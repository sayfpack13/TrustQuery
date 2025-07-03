// Cluster and node management routes
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { getES, initializeElasticsearchClients } = require("../elasticsearch/client");

const router = express.Router();

// GET cluster information and node details
router.get("/", verifyJwt, async (req, res) => {
  try {
    const es = getES();
    const config = getConfig();
    
    // Get cluster health and stats
    const [health, stats, nodes] = await Promise.all([
      es.cluster.health(),
      es.cluster.stats(),
      es.nodes.info()
    ]);

    // Get node stats for disk usage
    const nodeStats = await es.nodes.stats({
      metric: ['fs']
    });

    // Format node information
    const nodeList = Object.entries(nodes.nodes).map(([nodeId, nodeInfo]) => ({
      id: nodeId,
      name: nodeInfo.name,
      host: nodeInfo.host,
      ip: nodeInfo.ip,
      roles: nodeInfo.roles,
      version: nodeInfo.version,
      transport_address: nodeInfo.transport_address,
      http_address: nodeInfo.http?.bound_address?.[0] || nodeInfo.transport_address,
      attributes: nodeInfo.attributes || {}
    }));

    // Format disk information per node
    const nodeDisks = {};
    Object.entries(nodeStats.nodes).forEach(([nodeId, stats]) => {
      if (stats.fs && stats.fs.data) {
        nodeDisks[nodeId] = stats.fs.data.map(disk => ({
          path: disk.path,
          total: disk.total_in_bytes,
          free: disk.free_in_bytes,
          used: disk.total_in_bytes - disk.free_in_bytes,
          available: disk.available_in_bytes
        }));
      }
    });

    res.json({
      clusterName: health.cluster_name,
      clusterStatus: health.status,
      numberOfNodes: health.number_of_nodes,
      numberOfDataNodes: health.number_of_data_nodes,
      activePrimaryShards: health.active_primary_shards,
      activeShards: health.active_shards,
      relocatingShards: health.relocating_shards,
      initializingShards: health.initializing_shards,
      unassignedShards: health.unassigned_shards,
      nodes: nodeList,
      nodeDisks,
      // Include configuration information
      elasticsearchNodes: config.elasticsearchNodes || [],
      writeNode: config.writeNode || null,
      nodeAttributes: config.nodeAttributes || {}
    });
  } catch (error) {
    console.error("Error fetching cluster information:", error);
    res.status(500).json({ error: "Failed to fetch cluster information: " + error.message });
  }
});

// POST update cluster name
router.post("/name", verifyJwt, async (req, res) => {
  try {
    const { clusterName } = req.body;
    
    if (!clusterName || typeof clusterName !== 'string') {
      return res.status(400).json({ error: "Cluster name is required" });
    }

    // Update Elasticsearch configuration with new cluster name
    try {
      const { updateElasticsearchConfig } = require("../elasticsearch/config");
      await updateElasticsearchConfig({
        'cluster.name': clusterName.trim()
      });
    } catch (configError) {
      console.warn("Could not update Elasticsearch config file:", configError.message);
      // Continue without failing the request
    }

    res.json({
      message: "Cluster name updated successfully. Restart Elasticsearch for changes to take effect.",
      clusterName: clusterName.trim()
    });
  } catch (error) {
    console.error("Error updating cluster name:", error);
    res.status(500).json({ error: "Failed to update cluster name: " + error.message });
  }
});

// POST add new node to configuration
router.post("/", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl } = req.body;
    
    if (!nodeUrl || typeof nodeUrl !== 'string') {
      return res.status(400).json({ error: "Node URL is required" });
    }

    // Validate URL format
    try {
      new URL(nodeUrl);
    } catch (urlError) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    
    // Check if node already exists
    if (currentNodes.includes(nodeUrl)) {
      return res.status(400).json({ error: "Node already exists in configuration" });
    }

    // Add node to configuration
    const updatedNodes = [...currentNodes, nodeUrl];
    await setConfig('elasticsearchNodes', updatedNodes);

    // Reinitialize Elasticsearch clients with new configuration
    initializeElasticsearchClients();

    res.json({
      message: "Node added successfully",
      elasticsearchNodes: updatedNodes
    });
  } catch (error) {
    console.error("Error adding node:", error);
    res.status(500).json({ error: "Failed to add node: " + error.message });
  }
});

// DELETE remove node from configuration
router.delete("/", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl } = req.body;
    
    if (!nodeUrl || typeof nodeUrl !== 'string') {
      return res.status(400).json({ error: "Node URL is required" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    
    // Check if node exists
    if (!currentNodes.includes(nodeUrl)) {
      return res.status(400).json({ error: "Node not found in configuration" });
    }

    // Prevent removing the last node
    if (currentNodes.length <= 1) {
      return res.status(400).json({ error: "Cannot remove the last node from configuration" });
    }

    // Remove node from configuration
    const updatedNodes = currentNodes.filter(node => node !== nodeUrl);
    await setConfig('elasticsearchNodes', updatedNodes);

    // Update write node if it was the removed node
    const currentWriteNode = getConfig('writeNode');
    if (currentWriteNode === nodeUrl) {
      await setConfig('writeNode', updatedNodes[0]);
    }

    // Reinitialize Elasticsearch clients with new configuration
    initializeElasticsearchClients();

    res.json({
      message: "Node removed successfully",
      elasticsearchNodes: updatedNodes,
      writeNode: getConfig('writeNode')
    });
  } catch (error) {
    console.error("Error removing node:", error);
    res.status(500).json({ error: "Failed to remove node: " + error.message });
  }
});

// POST set write node
router.post("/write", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl } = req.body;
    
    if (!nodeUrl || typeof nodeUrl !== 'string') {
      return res.status(400).json({ error: "Node URL is required" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    
    // Check if node exists in configuration
    if (!currentNodes.includes(nodeUrl)) {
      return res.status(400).json({ error: "Node not found in configuration" });
    }

    // Update write node
    await setConfig('writeNode', nodeUrl);

    // Reinitialize Elasticsearch clients to use new write node
    initializeElasticsearchClients();

    res.json({
      message: "Write node updated successfully",
      writeNode: nodeUrl
    });
  } catch (error) {
    console.error("Error setting write node:", error);
    res.status(500).json({ error: "Failed to set write node: " + error.message });
  }
});

// GET node statistics
router.get("/stats", verifyJwt, async (req, res) => {
  try {
    const es = getES();
    const stats = await es.nodes.stats({
      metric: ['jvm', 'os', 'fs', 'indices', 'transport']
    });

    res.json({
      stats: stats.nodes
    });
  } catch (error) {
    console.error("Error fetching node stats:", error);
    res.status(500).json({ error: "Failed to fetch node statistics: " + error.message });
  }
});

module.exports = router;
