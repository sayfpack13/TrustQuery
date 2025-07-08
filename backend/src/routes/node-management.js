const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");
const { refreshCacheAndSync } = require("../cache/indices-cache");

const router = express.Router();

// POST create new node
router.post("/nodes", verifyJwt, async (req, res) => {
  try {
    // Support both old nodeConfig format and new direct properties format
    const nodeConfig = req.body.nodeConfig || req.body;

    if (!nodeConfig || !nodeConfig.name) {
      return res.status(400).json({ error: "Node name is required" });
    }

    // Initialize cluster manager
    await clusterManager.initialize();

    // Create the node
    const createdNode = await clusterManager.createNode(nodeConfig);

    // Update configuration
    const currentNodes = getConfig("elasticsearchNodes") || [];
    currentNodes.push(createdNode.name);
    await setConfig("elasticsearchNodes", currentNodes);

    // If this is the first node, set it as the write node
    if (currentNodes.length === 1) {
      await setConfig("writeNode", createdNode.name);
    }

    // Update node metadata
    const currentMetadata = getConfig("nodeMetadata") || {};
    currentMetadata[createdNode.name] = {
      name: createdNode.name,
      configPath: createdNode.configPath,
      servicePath: createdNode.servicePath,
      dataPath: createdNode.dataPath,
      logsPath: createdNode.logsPath,
      cluster: nodeConfig.cluster || "trustquery-cluster",
      host: nodeConfig.host || "localhost",
      port: nodeConfig.port,
      transportPort: nodeConfig.transportPort,
      roles: nodeConfig.roles || {
        master: true,
        data: true,
        ingest: true,
      },
    };
    await setConfig("nodeMetadata", currentMetadata);

    // Refresh persistent indices cache after node creation
    try {
      await refreshCacheAndSync(`creating node ${createdNode.name}`);
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after creating node:`,
        cacheError.message
      );
    }

    res.json({
      message: `Node "${createdNode.name}" created successfully`,
      node: createdNode,
    });
  } catch (error) {
    console.error("Error creating node:", error);
    res.status(500).json({ error: "Failed to create node: " + error.message });
  }
});

// PUT update node configuration
router.put("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const updates = req.body;

    // Get current node metadata to find the original config
    const currentMetadata = getConfig("nodeMetadata") || {};
    const originalNodeConfig = currentMetadata[nodeName];
    if (!originalNodeConfig) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }

    // Check if the node is currently running
    const isRunning = await clusterManager.isNodeRunning(nodeName);
    if (isRunning) {
      return res.status(409).json({
        error: `Cannot update configuration for node "${nodeName}" while it is running. Stop the node first to make changes.`,
        reason: "node_running",
      });
    }

    // Create the potential new configuration by merging updates
    const updatedNodeConfig = { ...originalNodeConfig, ...updates };

    // Validate the updated configuration
    const validation = await clusterManager.validateNodeConfig(updatedNodeConfig, nodeName);
    if (!validation.valid) {
      return res.status(409).json({
        error: "Validation failed",
        conflicts: validation.conflicts,
        suggestions: validation.suggestions,
      });
    }

    // Validate path types if provided
    if (updates.dataPath && typeof updates.dataPath !== "string") {
      return res.status(400).json({ error: "Data path must be a string" });
    }
    if (updates.logsPath && typeof updates.logsPath !== "string") {
      return res.status(400).json({ error: "Logs path must be a string" });
    }

    // Update the actual configuration files using cluster manager
    const updateResult = await clusterManager.updateNode(nodeName, updates);

    // Update the metadata in config.json
    const newMetadata = {
      ...originalNodeConfig,
      ...updates,
      dataPath: typeof updates.dataPath === "string" ? updates.dataPath : originalNodeConfig.dataPath,
      logsPath: typeof updates.logsPath === "string" ? updates.logsPath : originalNodeConfig.logsPath,
      nodeUrl: `http://${updates.host || originalNodeConfig.host}:${updates.port || originalNodeConfig.port}`,
    };

    // If the node name changes, update the key in metadata and elasticsearchNodes
    if (updates.name && updates.name !== nodeName) {
      delete currentMetadata[nodeName];
      currentMetadata[updates.name] = newMetadata;
      const updatedNodes = (getConfig("elasticsearchNodes") || []).map(
        (name) => (name === nodeName ? updates.name : name)
      );
      await setConfig("elasticsearchNodes", updatedNodes);
    } else {
      currentMetadata[nodeName] = newMetadata;
    }
    await setConfig("nodeMetadata", currentMetadata);

    // Refresh persistent indices cache after node update
    try {
      await refreshCacheAndSync(`updating node ${nodeName}`);
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after updating node:`,
        cacheError.message
      );
    }

    res.json({
      message: `Node "${nodeName}" updated successfully`,
      node: newMetadata,
      updateResult: updateResult,
    });
  } catch (error) {
    console.error("Error updating node:", error);
    res.status(500).json({ error: "Failed to update node: " + error.message });
  }
});

// PUT change node cluster
router.put("/nodes/:nodeName/cluster", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { cluster } = req.body;

    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }

    // Get current node metadata
    const currentMetadata = getConfig("nodeMetadata") || {};

    // Find the node by name
    if (!currentMetadata[nodeName]) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }

    // Update the cluster assignment
    currentMetadata[nodeName].cluster = cluster;
    await setConfig("nodeMetadata", currentMetadata);

    res.json({
      message: `Node "${nodeName}" moved to cluster "${cluster}"`,
      node: currentMetadata[nodeName],
    });
  } catch (error) {
    console.error("Error changing node cluster:", error);
    res
      .status(500)
      .json({ error: "Failed to change node cluster: " + error.message });
  }
});

// DELETE node
router.delete("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { preserveData } = req.body;

    // Remove the node using cluster manager
    const removeResult = await clusterManager.removeNode(nodeName, preserveData);

    // Update configuration
    const currentNodes = getConfig("elasticsearchNodes") || [];
    const updatedNodes = currentNodes.filter((name) => name !== nodeName);
    await setConfig("elasticsearchNodes", updatedNodes);

    // Update node metadata
    const nodeMetadata = getConfig("nodeMetadata") || {};
    delete nodeMetadata[nodeName];
    await setConfig("nodeMetadata", nodeMetadata);

    // If this was the write node, update write node configuration
    const currentWriteNode = getConfig("writeNode");
    if (currentWriteNode === nodeName) {
      // Set a new write node if any nodes remain, otherwise clear it
      await setConfig("writeNode", updatedNodes[0] || null);
      if (!updatedNodes[0]) {
        console.log(`📝 Cleared write node (no nodes remaining)`);
      }
    }

    // Refresh persistent cache after node removal
    try {
      await refreshCacheAndSync(`removing node ${nodeName}`);
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after removing node:`,
        cacheError.message
      );
    }

    const message = removeResult.wasRunning
      ? `Node "${nodeName}" was stopped and removed successfully`
      : `Node "${nodeName}" removed successfully`;

    return res.json({
      message,
      details: removeResult,
    });
  } catch (error) {
    console.error("Error removing node:", error);
    res.status(500).json({ error: "Failed to remove node: " + error.message });
  }
});

module.exports = router; 