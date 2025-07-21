const fs = require("fs").promises;
const path = require("path");
const { getConfig, setConfig } = require("../config");
const { getEnvAndConfig } = require("./node-config");
const { isNodeRunning } = require("./node-utils");

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
  await repairAndVerifyNodeMetadata();
  const env = getEnvAndConfig();
  const nodesDir = path.join(env.baseElasticsearchPath, "nodes");
  const nodes = new Map(); // Use Map to deduplicate nodes by name

  // First, get nodes from metadata
  const nodeMetadata = getConfig("nodeMetadata") || {};
  for (const [name, metadata] of Object.entries(nodeMetadata)) {
    const nodeInfo = buildNodeMetadata(metadata);
    // Use in-progress status if present, else check running
    let status = metadata.status;
    if (status !== "starting" && status !== "stopping") {
      status = (await isNodeRunning(name)) ? "running" : "stopped";
    }
    nodeInfo.status = status;
    nodes.set(name, nodeInfo);
  }

  try {
    // Then scan filesystem for any additional nodes
    await fs.mkdir(nodesDir, { recursive: true });
    const nodeDirs = await fs.readdir(nodesDir, { withFileTypes: true });
    const yaml = require("yaml");

    for (const dirent of nodeDirs) {
      if (dirent.isDirectory()) {
        let nodeDirName = dirent.name;
        let nodeDirPath = path.join(nodesDir, nodeDirName);
        const configPath = path.join(nodeDirPath, "config", "elasticsearch.yml");
        try {
          const configContent = await fs.readFile(configPath, "utf8");
          const config = yaml.parse(configContent);
          const definitiveNodeName = config["node.name"] || nodeDirName;

          // --- Auto-fix: Rename folder if folder name != node.name and no folder with node.name exists ---
          if (nodeDirName !== definitiveNodeName) {
            const targetDirPath = path.join(nodesDir, definitiveNodeName);
            let targetExists = false;
            try { await fs.access(targetDirPath); targetExists = true; } catch {}
            if (!targetExists) {
              await fs.rename(nodeDirPath, targetDirPath);
              nodeDirName = definitiveNodeName;
              nodeDirPath = targetDirPath;
            } else {
              // Conflict: folder with node.name already exists
              console.warn(`Cannot rename folder '${nodeDirName}' to '${definitiveNodeName}' because target already exists.`);
              // Do not proceed with this folder
              continue;
            }
          }

          // Skip if we already have this node from metadata
          if (nodes.has(definitiveNodeName)) continue;

          const metadata = getNodeMetadata(definitiveNodeName);
          nodes.set(definitiveNodeName, {
            name: definitiveNodeName,
            cluster: config["cluster.name"] || "trustquery-cluster",
            host: config["network.host"] || "localhost",
            port: config["http.port"] || 9200,
            transportPort: config["transport.port"] || 9300,
            roles: config["node.roles"] || {
              master: true,
              data: true,
              ingest: true,
            },
            status: (await isNodeRunning(definitiveNodeName)) ? "running" : "stopped",
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
 * Get node heap size
 */
async function getNodeHeapSize(nodeName) {
  const metadata = getNodeMetadata(nodeName);
  return metadata ? metadata.heapSize : null;
}

/**
 * Repair node folders and verify node metadata integrity (fully merged logic)
 */
async function repairAndVerifyNodeMetadata() {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const elasticsearchNodes = getConfig("elasticsearchNodes") || [];
  const writeNode = getConfig("writeNode");
  const issues = [];
  const repairs = [];
  let needsSave = false;
  const removedNodes = [];

  // First, scan filesystem for nodes
  const env = getEnvAndConfig();
  const nodesDir = path.join(env.baseElasticsearchPath, "nodes");
  const foundNodeNames = new Set();
  const fs = require("fs").promises;
  const yaml = require("yaml");

  try {
    // Create nodes directory if it doesn't exist
    await fs.mkdir(nodesDir, { recursive: true });
    const nodeDirs = await fs.readdir(nodesDir, { withFileTypes: true });

    for (const dirent of nodeDirs) {
      if (dirent.isDirectory()) {
        let nodeDirName = dirent.name;
        let nodeDirPath = path.join(nodesDir, nodeDirName);
        const configPath = path.join(nodeDirPath, "config", "elasticsearch.yml");
        try {
          const configContent = await fs.readFile(configPath, "utf8");
          const config = yaml.parse(configContent);
          const definitiveNodeName = config["node.name"] || nodeDirName;
          foundNodeNames.add(definitiveNodeName);

          // --- Auto-fix: Rename folder if folder name != node.name and no folder with node.name exists ---
          if (nodeDirName !== definitiveNodeName) {
            const targetDirPath = path.join(nodesDir, definitiveNodeName);
            let targetExists = false;
            try { await fs.access(targetDirPath); targetExists = true; } catch {}
            if (!targetExists) {
              // Rename the folder
              await fs.rename(nodeDirPath, targetDirPath);
              repairs.push({
                type: "renamed_folder",
                from: nodeDirName,
                to: definitiveNodeName,
                message: `Renamed node folder '${nodeDirName}' to match node.name '${definitiveNodeName}'`
              });
              needsSave = true;
              nodeDirName = definitiveNodeName;
              nodeDirPath = targetDirPath;
              // --- Update elasticsearch.yml: fix node.name and node.attr.custom_id ---
              const configPathToFix = path.join(targetDirPath, "config", "elasticsearch.yml");
              let configObjToFix;
              let configContentToFix;
              let shouldWriteConfig = false;
              try {
                configContentToFix = await fs.readFile(configPathToFix, "utf8");
                configObjToFix = yaml.parse(configContentToFix) || {};
                if (configObjToFix["node.name"] !== definitiveNodeName) {
                  configObjToFix["node.name"] = definitiveNodeName;
                  shouldWriteConfig = true;
                }
                if (configObjToFix["node.attr.custom_id"] !== definitiveNodeName) {
                  configObjToFix["node.attr.custom_id"] = definitiveNodeName;
                  shouldWriteConfig = true;
                }
                if (shouldWriteConfig) {
                  const newYaml = yaml.stringify(configObjToFix);
                  await fs.writeFile(configPathToFix, newYaml, "utf8");
                }
              } catch (e) {
                // If config is not valid YAML, regenerate from metadata
                const meta = nodeMetadata[definitiveNodeName] || {};
                const { generateNodeConfig } = require("./node-config");
                const newYaml = generateNodeConfig({
                  ...meta,
                  name: definitiveNodeName,
                  cluster: meta.cluster || "trustquery-cluster",
                  dataPath: meta.dataPath || path.join(targetDirPath, "data"),
                  logsPath: meta.logsPath || path.join(targetDirPath, "logs"),
                });
                await fs.writeFile(configPathToFix, newYaml, "utf8");
              }
              // --- Always update all paths in nodeMetadata for both new and existing nodes ---
              const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
              const newConfigPath = path.join(targetDirPath, "config", "elasticsearch.yml");
              const newServicePath = path.join(targetDirPath, "config", serviceFileName);
              // Determine new dataPath/logsPath only if they are subfolders of the node folder
              const nodeBaseDir = path.join(nodesDir, definitiveNodeName);
              let oldMeta = nodeMetadata[definitiveNodeName] || nodeMetadata[dirent.name] || {};
              let oldDataPath = oldMeta.dataPath || path.join(nodeDirPath, "data");
              let oldLogsPath = oldMeta.logsPath || path.join(nodeDirPath, "logs");
              if (config["path.data"]) oldDataPath = config["path.data"];
              if (config["path.logs"]) oldLogsPath = config["path.logs"];
              const wasDataInNode = oldDataPath.startsWith(path.join(nodesDir, nodeDirName) + path.sep);
              const wasLogsInNode = oldLogsPath.startsWith(path.join(nodesDir, nodeDirName) + path.sep);
              let newDataPath = oldDataPath;
              let newLogsPath = oldLogsPath;
              if (wasDataInNode) {
                newDataPath = path.join(targetDirPath, path.relative(path.join(nodesDir, nodeDirName), oldDataPath));
              }
              if (wasLogsInNode) {
                newLogsPath = path.join(targetDirPath, path.relative(path.join(nodesDir, nodeDirName), oldLogsPath));
              }
              // --- Always overwrite all paths in nodeMetadata ---
              nodeMetadata[definitiveNodeName] = {
                ...oldMeta,
                name: definitiveNodeName,
                configPath: newConfigPath,
                servicePath: newServicePath,
                dataPath: newDataPath,
                logsPath: newLogsPath,
                cluster: config["cluster.name"] || "trustquery-cluster",
                host: config["network.host"] || "localhost",
                port: config["http.port"] || 9200,
                transportPort: config["transport.port"] || 9300,
                roles: config["node.roles"] || { master: true, data: true, ingest: true },
                heapSize: "1g"
              };
              // Update elasticsearchNodes array
              const idxOld = elasticsearchNodes.indexOf(nodeDirName);
              if (idxOld !== -1) elasticsearchNodes.splice(idxOld, 1);
              if (!elasticsearchNodes.includes(definitiveNodeName)) {
                elasticsearchNodes.push(definitiveNodeName);
              }
              needsSave = true;
              // Also update config file if dataPath/logsPath changed
              let configChanged = false;
              let newConfigContent = configContent;
              if (wasDataInNode && config["path.data"] && config["path.data"] !== newDataPath) {
                newConfigContent = newConfigContent.replace(/^(path\.data\s*[:=]\s*).*/m, `$1${newDataPath}`);
                configChanged = true;
              }
              if (wasLogsInNode && config["path.logs"] && config["path.logs"] !== newLogsPath) {
                newConfigContent = newConfigContent.replace(/^(path\.logs\s*[:=]\s*).*/m, `$1${newLogsPath}`);
                configChanged = true;
              }
              if (configChanged) {
                await fs.writeFile(newConfigPath, newConfigContent, "utf8");
              }
            } else {
              // Conflict: folder with node.name already exists
              issues.push({
                type: "folder_conflict",
                folder: nodeDirName,
                nodeName: definitiveNodeName,
                message: `Cannot rename folder '${nodeDirName}' to '${definitiveNodeName}' because target already exists.`
              });
            }
          }

          // --- Always update all paths in nodeMetadata for both new and existing nodes ---
          const nodeBaseDir = path.join(nodesDir, nodeDirName);
          const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
          let meta = nodeMetadata[definitiveNodeName] || {};
          let configPathFinal = path.join(nodeBaseDir, "config", "elasticsearch.yml");
          let servicePathFinal = path.join(nodeBaseDir, "config", serviceFileName);
          let dataPathFinal = config["path.data"] || path.join(nodeBaseDir, "data");
          let logsPathFinal = config["path.logs"] || path.join(nodeBaseDir, "logs");

          // --- Ensure node.attr.custom_id always matches node.name ---
          let configObj = config;
          let shouldWriteCustomId = false;
          if (configObj["node.attr.custom_id"] !== definitiveNodeName) {
            configObj["node.attr.custom_id"] = definitiveNodeName;
            shouldWriteCustomId = true;
          }
          if (shouldWriteCustomId) {
            const newYaml = yaml.stringify(configObj);
            await fs.writeFile(configPathFinal, newYaml, "utf8");
          }

          // --- Ensure path.data and path.logs in config match node folder if those folders exist and are inside the node folder ---
          const dataDirExists = await fs.stat(path.join(nodeBaseDir, "data")).then(() => true).catch(() => false);
          const logsDirExists = await fs.stat(path.join(nodeBaseDir, "logs")).then(() => true).catch(() => false);
          let configPatched = false;
          if (dataDirExists) {
            const expectedDataPath = path.join(nodeBaseDir, "data");
            const currentDataPath = configObj["path.data"];
            // Only update if current path is missing or inside the node folder
            if (
              (!currentDataPath || currentDataPath.startsWith(nodeBaseDir + path.sep)) &&
              currentDataPath !== expectedDataPath
            ) {
              configObj["path.data"] = expectedDataPath;
              configPatched = true;
            }
          }
          if (logsDirExists) {
            const expectedLogsPath = path.join(nodeBaseDir, "logs");
            const currentLogsPath = configObj["path.logs"];
            if (
              (!currentLogsPath || currentLogsPath.startsWith(nodeBaseDir + path.sep)) &&
              currentLogsPath !== expectedLogsPath
            ) {
              configObj["path.logs"] = expectedLogsPath;
              configPatched = true;
            }
          }
          if (configPatched) {
            const newYaml = yaml.stringify(configObj);
            await fs.writeFile(configPathFinal, newYaml, "utf8");
          }

          nodeMetadata[definitiveNodeName] = {
            ...meta,
            name: definitiveNodeName,
            configPath: configPathFinal,
            servicePath: servicePathFinal,
            dataPath: dataPathFinal,
            logsPath: logsPathFinal,
            cluster: config["cluster.name"] || "trustquery-cluster",
            host: config["network.host"] || "localhost",
            port: config["http.port"] || 9200,
            transportPort: config["transport.port"] || 9300,
            roles: config["node.roles"] || { master: true, data: true, ingest: true },
            heapSize: meta.heapSize || "1g"
          };

          // --- Ensure jvm.options is always in sync with heapSize ---
          const { generateJVMOptions } = require("./node-config");
          const jvmOptions = generateJVMOptions(nodeMetadata[definitiveNodeName].heapSize);
          const jvmPath = path.join(path.dirname(configPathFinal), "jvm.options");
          await fs.writeFile(jvmPath, jvmOptions);

          if (!elasticsearchNodes.includes(definitiveNodeName)) {
            elasticsearchNodes.push(definitiveNodeName);
          }
          needsSave = true;
        } catch (configError) {
          // If config file is missing, skip this directory
          console.warn(`⚠️ Skipping node directory ${nodeDirName}: ${configError.message}`);
        }
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("❌ Failed to scan nodes directory:", error);
    }
  }

  // Remove nodes from metadata/config/cache that do not exist on disk
  for (const nodeName of Object.keys(nodeMetadata)) {
    if (!foundNodeNames.has(nodeName)) {
      delete nodeMetadata[nodeName];
      const idx = elasticsearchNodes.indexOf(nodeName);
      if (idx !== -1) elasticsearchNodes.splice(idx, 1);
      removedNodes.push(nodeName);
      repairs.push({
        type: "removed_metadata",
        node: nodeName,
        message: `Removed metadata for node "${nodeName}" not found on disk`
      });
      needsSave = true;
    }
  }

  // Check write node validity and auto-fix if needed
  if (writeNode && !nodeMetadata[writeNode]) {
    issues.push({
      type: "invalid_write_node",
      node: writeNode,
      message: `Write node "${writeNode}" does not exist in metadata. Auto-clearing.`
    });
    // Auto-assign to another available node if possible, else clear
    const availableNodes = Object.keys(nodeMetadata);
    if (availableNodes.length > 0) {
      await setConfig("writeNode", availableNodes[0]);
    } else {
      await setConfig("writeNode", null);
    }
    needsSave = true;
  }

  // Save changes if needed
  if (needsSave) {
    await setConfig("nodeMetadata", nodeMetadata);
    await setConfig("elasticsearchNodes", elasticsearchNodes);
  }

  // Remove from cache any nodes that were removed
  if (removedNodes.length > 0) {
    const { removeNodeFromCache } = require("../cache/indices-cache");
    for (const nodeName of removedNodes) {
      try {
        await removeNodeFromCache(nodeName);
      } catch (e) {
        console.warn(`[repairAndVerifyNodeMetadata] Failed to remove node ${nodeName} from cache: ${e.message}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    repairs,
    nodeMetadata,
    elasticsearchNodes
  };
}

module.exports = {
  buildNodeMetadata,
  getNodeMetadata,
  listNodes,
  repairAndVerifyNodeMetadata,
  getNodeHeapSize,
}; 