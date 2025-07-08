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
    const enhancedNodes = [];

    // Check each node's status
    for (const node of nodes) {
      const isRunning = await isNodeRunning(node.name);
      enhancedNodes.push({
        ...node,
        isRunning,
        status: isRunning ? "running" : "stopped"
      });
    }

    // Get write node status
    const writeNode = getConfig("writeNode");
    const writeNodeRunning = writeNode ? await isNodeRunning(writeNode) : false;

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