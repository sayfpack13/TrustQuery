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

    // On Linux, ensure elasticsearch user owns the data and logs directories
    if (process.platform === 'linux') {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(`chown -R elasticsearch:elasticsearch "${dataDir}"`, (err) => {
          if (err) return reject(err);
          exec(`chown -R elasticsearch:elasticsearch "${logsDir}"`, (err2) => {
            if (err2) return reject(err2);
            resolve();
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

    // Create updated configuration
    const updatedConfig = {
      ...currentMetadata,
      ...updates,
    };

    // Generate new configuration files
    const config = generateNodeConfig(updatedConfig);
    await fs.writeFile(currentMetadata.configPath, config);

    // Update JVM options if heap size changed
    if (updates.heapSize) {
      const jvmOptions = generateJVMOptions(updates.heapSize);
      const jvmPath = path.join(path.dirname(currentMetadata.configPath), "jvm.options");
      await fs.writeFile(jvmPath, jvmOptions);
    }

    // Update service script if necessary
    if (updates.port) {
      const serviceContent = generateServiceScript(
        updatedConfig.name,
        path.dirname(currentMetadata.configPath),
        updatedConfig.port,
        env
      );
      await fs.writeFile(currentMetadata.servicePath, serviceContent);

      // Make service script executable on Unix systems
      if (!env.isWindows) {
        await fs.chmod(currentMetadata.servicePath, "755");
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
};