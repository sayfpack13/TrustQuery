const { getES } = require("../elasticsearch/client");
const { getConfig } = require("../config");
const { isNodeRunning } = require("./node-process");
const { getNodeMetadata, listNodes } = require("./node-metadata");

/**
 * Get cluster status
 */
async function getClusterStatus() {
  try {
    const nodes = await listNodes();
    // Use cached isRunning from listNodes
    const enhancedNodes = nodes.map(node => ({
      ...node,
      status: node.isRunning ? "running" : "stopped"
    }));

    // Get write node status from cache if available
    const writeNode = getConfig("writeNode");
    let writeNodeRunning = false;
    if (writeNode) {
      const writeNodeInfo = nodes.find(n => n.name === writeNode);
      writeNodeRunning = writeNodeInfo ? writeNodeInfo.isRunning : false;
    }

    return {
      totalNodes: nodes.length,
      runningNodes: enhancedNodes.filter(n => n.isRunning).length,
      stoppedNodes: enhancedNodes.filter(n => !n.isRunning).length,
      writeNode,
      writeNodeRunning,
      nodes: enhancedNodes
    };
  } catch (error) {
    console.error("Error getting cluster status:", error);
    return {
      error: error.message,
      totalNodes: 0,
      runningNodes: 0,
      stoppedNodes: 0,
      writeNode: null,
      writeNodeRunning: false,
      nodes: []
    };
  }
}

/**
 * Check Elasticsearch installation
 */
async function checkElasticsearchInstallation(env) {
  try {
    const fs = require("fs").promises;
    const path = require("path");
    const binName = env.isWindows ? "elasticsearch.bat" : "elasticsearch";
    const elasticsearchBin = path.join(
      env.baseElasticsearchPath,
      "bin",
      binName
    );
    await fs.access(elasticsearchBin);
    return true;
  } catch (error) {
    console.warn("Elasticsearch not found at default location");
    return false;
  }
}

/**
 * Initialize cluster management system
 */
async function initialize() {
  try {
    const { getEnvAndConfig } = require("./node-config");
    const { createBaseDirectories } = require("./node-filesystem");
    const env = getEnvAndConfig();
    const esExists = await checkElasticsearchInstallation(env);
    if (!esExists) {
      throw new Error(
        "Elasticsearch installation not found. Please install Elasticsearch first."
      );
    }
    await createBaseDirectories(env);
    console.log("✅ Elasticsearch Cluster Manager initialized");
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize cluster manager:", error);
    throw error;
  }
}

module.exports = {
  getClusterStatus,
  checkElasticsearchInstallation,
  initialize,
}; 