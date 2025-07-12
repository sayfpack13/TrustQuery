// Elasticsearch Cluster Management System
const fs = require("fs").promises;
const path = require("path");
const { execSync, spawn } = require("child_process");
const { getConfig, setConfig } = require("../config");
const yaml = require("yaml");

const { getEnvAndConfig, generateNodeConfig, generateJVMOptions, generateLog4j2Config, generateServiceScript, formatNodeRoles, getNodeConfig, getNodeConfigContent } = require("./node-config");
const { startNode, stopNode, isNodeRunning } = require("./node-process");
const { moveNode, copyNode, removeNodeFiles } = require("./node-filesystem");
const { buildNodeMetadata, getNodeMetadata, listNodes, verifyNodeMetadata } = require("./node-metadata");
const { getClusterStatus, initialize } = require("./cluster-status");

/**
 * Create a new Elasticsearch node
 */
async function createNode(nodeConfig) {
  try {
    const env = getEnvAndConfig();
    const fs = require("fs").promises;
    const path = require("path");

    // Create node directories
    const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeConfig.name);
    const configDir = path.join(nodeBaseDir, "config");
    const dataDir = nodeConfig.dataPath || path.join(nodeBaseDir, "data");
    const logsDir = nodeConfig.logsPath || path.join(nodeBaseDir, "logs");

    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    // On Linux, ensure elasticsearch user owns the config, data, and logs directories
    if (process.platform === 'linux') {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(`chown -R elasticsearch:elasticsearch "${configDir}"`, (err) => {
          if (err) return reject(err);
          exec(`chown -R elasticsearch:elasticsearch "${dataDir}"`, (err2) => {
            if (err2) return reject(err2);
            exec(`chown -R elasticsearch:elasticsearch "${logsDir}"`, (err3) => {
              if (err3) return reject(err3);
              resolve();
            });
          });
        });
      });
    }

    // Generate configuration files
    const config = generateNodeConfig({
      ...nodeConfig,
      dataPath: dataDir,
      logsPath: logsDir,
    });

    const configPath = path.join(configDir, "elasticsearch.yml");
    await fs.writeFile(configPath, config);

    // Generate and write JVM options file
    const jvmOptions = generateJVMOptions(nodeConfig.heapSize || "1g");
    const jvmPath = path.join(configDir, "jvm.options");
    await fs.writeFile(jvmPath, jvmOptions);

    // Generate and write log4j2.properties file
    const log4j2Config = generateLog4j2Config(logsDir);
    const log4j2Path = path.join(configDir, "log4j2.properties");
    await fs.writeFile(log4j2Path, log4j2Config);

    // Generate and write service script
    const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
    const servicePath = path.join(configDir, serviceFileName);
    const serviceContent = generateServiceScript(
      nodeConfig.name,
      configDir,
      nodeConfig.port,
      env
    );
    await fs.writeFile(servicePath, serviceContent);

    // Make service script executable on Unix systems
    if (!env.isWindows) {
      await fs.chmod(servicePath, "755");
    }

    return {
      name: nodeConfig.name,
      configPath,
      servicePath,
      dataPath: dataDir,
      logsPath: logsDir,
      ...nodeConfig,
    };
  } catch (error) {
    console.error(`Error creating node ${nodeConfig.name}:`, error);
    throw error;
  }
}

/**
 * Update node configuration
 */
async function updateNode(nodeName, updates, options = {}) {
  try {
    const env = getEnvAndConfig();
    const fs = require("fs").promises;
    const path = require("path");
    const { getConfig, setConfig } = require("../config");
    const yaml = require("yaml");

    // Get current node metadata
    const currentMetadata = getNodeMetadata(nodeName);
    if (!currentMetadata) {
      throw new Error(`Node "${nodeName}" not found`);
    }

    // Check if node is running
    const running = await isNodeRunning(nodeName);
    if (running) {
      throw new Error(`Cannot update node "${nodeName}" while it is running`);
    }

    let renamed = false;
    let oldNodeDir, newNodeDir;
    let newName = updates.name && updates.name !== nodeName ? updates.name : nodeName;
    let newDataPath = currentMetadata.dataPath;
    let newLogsPath = currentMetadata.logsPath;
    let configPath = currentMetadata.configPath;
    let servicePath = currentMetadata.servicePath;
    let configChanged = false;
    let configContent = await fs.readFile(currentMetadata.configPath, "utf8");
    let configObj = yaml.parse(configContent);

    // --- Directory rename logic ---
    if (updates.name && updates.name !== nodeName) {
      oldNodeDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
      newNodeDir = path.join(env.baseElasticsearchPath, "nodes", updates.name);
      // Check for folder conflict
      let newDirExists = false;
      try { await fs.access(newNodeDir); newDirExists = true; } catch {}
      if (newDirExists) {
        // Abort folder rename, but still update node.name in config
        console.warn(`[updateNode] Skipping directory rename: Node directory for '${updates.name}' already exists on disk.`);
      } else {
        // Only move data/logs if they are inside the old node folder
        const wasDataInNode = currentMetadata.dataPath.startsWith(oldNodeDir + path.sep);
        const wasLogsInNode = currentMetadata.logsPath.startsWith(oldNodeDir + path.sep);
        // Rename the base folder
        await fs.rename(oldNodeDir, newNodeDir);
        renamed = true;
        // Physically move data/logs if needed (if they are not already inside the base folder, skip)
        // (Since we renamed the base folder, the data/logs folders move with it if they are inside)
        if (wasDataInNode) {
          newDataPath = path.join(newNodeDir, path.relative(oldNodeDir, currentMetadata.dataPath));
          configObj["path.data"] = newDataPath;
          configChanged = true;
        }
        if (wasLogsInNode) {
          newLogsPath = path.join(newNodeDir, path.relative(oldNodeDir, currentMetadata.logsPath));
          configObj["path.logs"] = newLogsPath;
          configChanged = true;
        }
        // Update configPath/servicePath
        const configDir = path.join(newNodeDir, "config");
        configPath = path.join(configDir, "elasticsearch.yml");
        const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
        servicePath = path.join(configDir, serviceFileName);
      }
      // Always update node.name in config
      configObj["node.name"] = updates.name;
      configChanged = true;
    }

    // Write updated config if needed
    if (configChanged) {
      const newConfigContent = yaml.stringify(configObj);
      await fs.writeFile(renamed ? configPath : currentMetadata.configPath, newConfigContent, "utf8");
    }

    // Create updated configuration
    const updatedConfig = {
      ...currentMetadata,
      ...updates,
      name: newName,
      configPath,
      servicePath,
      dataPath: newDataPath,
      logsPath: newLogsPath,
    };

    // Update nodeMetadata and elasticsearchNodes
    const nodeMetadata = getConfig("nodeMetadata") || {};
    const elasticsearchNodes = getConfig("elasticsearchNodes") || [];
    if (updates.name && updates.name !== nodeName) {
      // Remove old entry, add new
      delete nodeMetadata[nodeName];
      nodeMetadata[newName] = updatedConfig;
      const idx = elasticsearchNodes.indexOf(nodeName);
      if (idx !== -1) elasticsearchNodes.splice(idx, 1);
      if (!elasticsearchNodes.includes(newName)) elasticsearchNodes.push(newName);
      await setConfig({ nodeMetadata, elasticsearchNodes });
    } else {
      nodeMetadata[newName] = updatedConfig;
      await setConfig("nodeMetadata", nodeMetadata);
    }

    // Update JVM options if heap size changed
    if (updates.heapSize) {
      const jvmOptions = generateJVMOptions(updates.heapSize);
      const jvmPath = path.join(path.dirname(configPath), "jvm.options");
      await fs.writeFile(jvmPath, jvmOptions);
    }

    // Update service script if necessary
    if (updates.port) {
      const serviceContent = generateServiceScript(
        updatedConfig.name,
        path.dirname(configPath),
        updatedConfig.port,
        env
      );
      await fs.writeFile(servicePath, serviceContent);
      if (!env.isWindows) {
        await fs.chmod(servicePath, "755");
      }
    }

    return {
      success: true,
      message: `Node "${nodeName}" configuration updated successfully`,
      node: updatedConfig,
    };
  } catch (error) {
    console.error(`Error updating node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Remove a node configuration
 */
async function removeNode(nodeName) {
  let wasRunning = false;
  try {
    // Check if node is running and stop it first
    wasRunning = await isNodeRunning(nodeName);
    if (wasRunning) {
      try {
        await stopNode(nodeName);

        // Wait a moment and verify it's actually stopped
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const stillRunning = await isNodeRunning(nodeName);
        if (stillRunning) {
          throw new Error(
            `Node ${nodeName} is still running after stopping. Please manually stop the node.`
          );
        }
      } catch (stopError) {
        console.error(`Error stopping node ${nodeName}:`, stopError);
        throw stopError;
      }
    }

    // Remove node files
    await removeNodeFiles(nodeName);

    return {
      success: true,
      message: `Node "${nodeName}" removed successfully`,
    };
  } catch (error) {
    console.error(`Error removing node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Validate node configuration
 */
async function validateNodeConfig(nodeConfig, originalName) {
  try {
    const env = getEnvAndConfig();
    const fs = require("fs").promises;
    const path = require("path");
    const net = require("net");
    const config = getConfig();
    
    // Validate required fields
    const requiredFields = ["name", "port", "transportPort"];
    const missingFields = requiredFields.filter((field) => !nodeConfig[field]);
    
    if (missingFields.length > 0) {
      return {
        valid: false,
        conflicts: missingFields.map((field) => ({
          type: field,
          message: `${field} is required`
        })),
        suggestions: {}
      };
    }
    
    // Validate ports - similar logic to validateNodePorts but inline to avoid circular dependency
    const conflicts = [];
    const suggestions = {};
    const nodeMetadata = config.nodeMetadata || {};
    const nodes = Object.entries(nodeMetadata);
    const thisName = nodeConfig.name;
    const thisPort = nodeConfig.port;
    const thisTransportPort = nodeConfig.transportPort;

    // Check for port conflicts with other nodes
    for (const [name, meta] of nodes) {
      if (originalName && name === originalName) continue; // skip self on update
      if (name === thisName) continue; // skip self
      if (!meta) continue;
      if (meta.port === thisPort) {
        conflicts.push({
          type: 'http_port',
          message: `HTTP port ${thisPort} is already used by node '${name}'`
        });
        suggestions.httpPort = thisPort + 1;
      }
      if (meta.transportPort === thisTransportPort) {
        conflicts.push({
          type: 'transport_port',
          message: `Transport port ${thisTransportPort} is already used by node '${name}'`
        });
        suggestions.transportPort = thisTransportPort + 1;
      }
      // Prevent HTTP and transport port overlap
      if (meta.port === thisTransportPort) {
        conflicts.push({
          type: 'transport_port',
          message: `Transport port ${thisTransportPort} overlaps with HTTP port of node '${name}'`
        });
        suggestions.transportPort = thisTransportPort + 1;
      }
      if (meta.transportPort === thisPort) {
        conflicts.push({
          type: 'http_port',
          message: `HTTP port ${thisPort} overlaps with transport port of node '${name}'`
        });
        suggestions.httpPort = thisPort + 1;
      }
    }
    
    // Check if the ports are available on the system
    async function isPortAvailable(port) {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
          server.close(() => resolve(true));
        });
        server.listen(port, "0.0.0.0");
      });
    }

    if (thisPort && typeof thisPort === "number") {
      const available = await isPortAvailable(thisPort);
      if (!available) {
        conflicts.push({
          type: 'http_port',
          message: `HTTP port ${thisPort} is not available on this system`
        });
        suggestions.httpPort = thisPort + 1;
      }
    }
    if (thisTransportPort && typeof thisTransportPort === "number") {
      const available = await isPortAvailable(thisTransportPort);
      if (!available) {
        conflicts.push({
          type: 'transport_port',
          message: `Transport port ${thisTransportPort} is not available on this system`
        });
        suggestions.transportPort = thisTransportPort + 1;
      }
    }
    
    // Check for node name conflicts
    if (!originalName || originalName !== thisName) {
      const existingNode = nodes.find(([name, _]) => name === thisName);
      if (existingNode) {
        conflicts.push({
          type: 'node_name',
          message: `Node name '${thisName}' already exists`
        });
        suggestions.nodeName = [`${thisName}-1`, `${thisName}-new`, `${thisName}-copy`];
      }
    }
    
    if (conflicts.length > 0) {
      return {
        valid: false,
        conflicts,
        suggestions
      };
    }
    
    return {
      valid: true,
      message: "Node configuration is valid",
    };
  } catch (error) {
    console.error(`Error validating node configuration:`, error);
    return {
      valid: false,
      conflicts: [{
        type: "general",
        message: error.message
      }],
      suggestions: {}
    };
  }
}

// --- EXPORT AS FUNCTIONAL MODULE ---
module.exports = {
  initialize,
  createNode,
  updateNode,
  startNode,
  stopNode,
  moveNode,
  copyNode,
  removeNodeFiles,
  isNodeRunning,
  getClusterStatus,
  buildNodeMetadata,
  getNodeMetadata,
  listNodes,
  verifyNodeMetadata,
  getNodeConfig,
  getNodeConfigContent,
  removeNode,
  validateNodeConfig,
};