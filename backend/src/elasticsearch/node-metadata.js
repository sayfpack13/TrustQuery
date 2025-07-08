const fs = require("fs").promises;
const path = require("path");
const { getConfig, setConfig } = require("../config");
const { getEnvAndConfig, getNodeConfig } = require("./node-config");
const { isNodeRunning } = require("./node-process");

/**
 * Build canonical node metadata object from any node config or detection source.
 * Ensures all required fields are present and consistent.
 */
function buildNodeMetadata(nodeConfig) {
  if (!nodeConfig) return {};
  const {
    name,
    configPath,
    servicePath,
    dataPath,
    logsPath,
    cluster,
    host,
    port,
    transportPort,
    roles,
    heapSize,
    nodeUrl,
  } = nodeConfig;
  
  // Always ensure we have a nodeUrl if host and port are available
  const url = nodeUrl || (host && port ? `http://${host}:${port}` : undefined);
  const hostValue = host || 'localhost';
  const portValue = port !== undefined ? port : 9200;
  
  // If we still don't have a URL but can construct one from defaults, do so
  const finalUrl = url || `http://${hostValue}:${portValue}`;
  
  return {
    nodeUrl: finalUrl,
    name: name || '',
    configPath: configPath || '',
    servicePath: servicePath || '',
    dataPath: dataPath || '',
    logsPath: logsPath || '',
    cluster: cluster || 'trustquery-cluster',
    host: hostValue,
    port: portValue,
    transportPort: transportPort !== undefined ? transportPort : 9300,
    roles: roles || { master: true, data: true, ingest: true },
    heapSize: heapSize || '1g',
  };
}

/**
 * Get node metadata from config
 */
function getNodeMetadata(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  if (nodeMetadata[nodeName]) {
    return buildNodeMetadata(nodeMetadata[nodeName]);
  }
  // Return canonical default structure if not in metadata
  const env = getEnvAndConfig();
  const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
  const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
  return buildNodeMetadata({
    name: nodeName,
    configPath: path.join(nodeBaseDir, "config", "elasticsearch.yml"),
    servicePath: path.join(nodeBaseDir, "config", serviceFileName),
    dataPath: path.join(nodeBaseDir, "data"),
    logsPath: path.join(nodeBaseDir, "logs"),
    cluster: env.config.elasticsearchConfig?.cluster || 'trustquery-cluster',
    host: 'localhost',
    port: 9200,
    transportPort: 9300,
    roles: { master: true, data: true, ingest: true },
    heapSize: '1g',
  });
}

/**
 * List all nodes by scanning both metadata and filesystem
 */
async function listNodes() {
  const env = getEnvAndConfig();
  const nodesDir = path.join(env.baseElasticsearchPath, "nodes");
  const nodes = new Map(); // Use Map to deduplicate nodes by name

  // First, get nodes from metadata
  const nodeMetadata = getConfig("nodeMetadata") || {};
  for (const [name, metadata] of Object.entries(nodeMetadata)) {
    const nodeInfo = buildNodeMetadata(metadata);
    nodeInfo.isRunning = await isNodeRunning(name);
    nodes.set(name, nodeInfo);
  }

  try {
    // Then scan filesystem for any additional nodes
    await fs.mkdir(nodesDir, { recursive: true });
    const nodeDirs = await fs.readdir(nodesDir, { withFileTypes: true });

    for (const dirent of nodeDirs) {
      if (dirent.isDirectory()) {
        const nodeDirName = dirent.name;
        try {
          const config = await getNodeConfig(nodeDirName);
          const definitiveNodeName = config.node.name;
          
          // Skip if we already have this node from metadata
          if (nodes.has(definitiveNodeName)) continue;

          const metadata = getNodeMetadata(definitiveNodeName);
          nodes.set(definitiveNodeName, {
            name: definitiveNodeName,
            cluster: config.cluster.name,
            host: config.network.host,
            port: config.http.port,
            transportPort: config.transport.port,
            roles: config.node.roles || {
              master: true,
              data: true,
              ingest: true,
            },
            isRunning: await isNodeRunning(definitiveNodeName),
            dataPath: metadata.dataPath,
            logsPath: metadata.logsPath,
            heapSize: metadata.heapSize,
          });
        } catch (configError) {
          console.warn(
            `⚠️ Skipping node directory ${nodeDirName}: ${configError.message}`
          );
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("❌ Failed to scan nodes directory:", error);
    }
  }

  // Convert Map back to array
  return Array.from(nodes.values());
}

/**
 * Verify and repair node metadata integrity
 */
async function verifyNodeMetadata() {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const elasticsearchNodes = getConfig("elasticsearchNodes") || [];
  const writeNode = getConfig("writeNode");
  const issues = [];
  const repairs = [];
  let needsSave = false;

  // First, scan filesystem for nodes
  const env = getEnvAndConfig();
  const nodesDir = path.join(env.baseElasticsearchPath, "nodes");
  
  try {
    // Create nodes directory if it doesn't exist
    await fs.mkdir(nodesDir, { recursive: true });
    const nodeDirs = await fs.readdir(nodesDir, { withFileTypes: true });

    for (const dirent of nodeDirs) {
      if (dirent.isDirectory()) {
        const nodeDirName = dirent.name;
        try {
          const config = await getNodeConfig(nodeDirName);
          const definitiveNodeName = config.node.name;

          // If node exists in filesystem but not in metadata, add it
          if (!nodeMetadata[definitiveNodeName]) {
            console.log(`📝 Adding missing metadata for node ${definitiveNodeName}`);
            const nodeBaseDir = path.join(nodesDir, nodeDirName);
            const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
            
            nodeMetadata[definitiveNodeName] = {
              name: definitiveNodeName,
              configPath: path.join(nodeBaseDir, "config", "elasticsearch.yml"),
              servicePath: path.join(nodeBaseDir, "config", serviceFileName),
              dataPath: config.path.data || path.join(nodeBaseDir, "data"),
              logsPath: config.path.logs || path.join(nodeBaseDir, "logs"),
              cluster: config.cluster.name || "trustquery-cluster",
              host: config.network.host || "localhost",
              port: config.http.port || 9200,
              transportPort: config.transport.port || 9300,
              roles: config.node.roles || {
                master: true,
                data: true,
                ingest: true
              },
              heapSize: "1g"
            };

            // Add to elasticsearchNodes array if not present
            if (!elasticsearchNodes.includes(definitiveNodeName)) {
              elasticsearchNodes.push(definitiveNodeName);
            }

            repairs.push({
              type: "added_metadata",
              node: definitiveNodeName,
              message: `Added metadata for node "${definitiveNodeName}" found in filesystem`
            });
            needsSave = true;
          }
        } catch (configError) {
          console.warn(
            `⚠️ Skipping node directory ${nodeDirName}: ${configError.message}`
          );
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("❌ Failed to scan nodes directory:", error);
    }
  }

  // Check for nodes in elasticsearchNodes but not in metadata
  for (const nodeName of elasticsearchNodes) {
    if (!nodeMetadata[nodeName]) {
      issues.push({
        type: "missing_metadata",
        node: nodeName,
        message: `Node "${nodeName}" is in elasticsearchNodes but has no metadata`
      });
    }
  }

  // Check for nodes in metadata but not in elasticsearchNodes
  for (const nodeName of Object.keys(nodeMetadata)) {
    if (!elasticsearchNodes.includes(nodeName)) {
      elasticsearchNodes.push(nodeName);
      repairs.push({
        type: "added_to_list",
        node: nodeName,
        message: `Added node "${nodeName}" to elasticsearchNodes list`
      });
      needsSave = true;
    }
    
    // Ensure all nodes have a nodeUrl
    const metadata = nodeMetadata[nodeName];
    if (!metadata.nodeUrl && metadata.host && metadata.port) {
      metadata.nodeUrl = `http://${metadata.host}:${metadata.port}`;
      repairs.push({
        type: "added_url",
        node: nodeName,
        message: `Added missing nodeUrl for "${nodeName}": ${metadata.nodeUrl}`
      });
      needsSave = true;
    }
  }

  // Check write node validity
  if (writeNode && !nodeMetadata[writeNode]) {
    issues.push({
      type: "invalid_write_node",
      node: writeNode,
      message: `Write node "${writeNode}" does not exist in metadata`
    });
  }

  // Save changes if needed
  if (needsSave) {
    await setConfig("nodeMetadata", nodeMetadata);
    await setConfig("elasticsearchNodes", elasticsearchNodes);
    console.log("💾 Saved updated node metadata to configuration");
  }

  return {
    valid: issues.length === 0,
    issues,
    repairs,
    nodeMetadata,
    elasticsearchNodes
  };
}

/**
 * Get node heap size
 */
async function getNodeHeapSize(nodeName) {
  const metadata = getNodeMetadata(nodeName);
  return metadata ? metadata.heapSize : null;
}

module.exports = {
  buildNodeMetadata,
  getNodeMetadata,
  listNodes,
  verifyNodeMetadata,
  getNodeHeapSize,
}; 