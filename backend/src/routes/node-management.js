
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const net = require("net");
const { refreshClusterCache } = require("../cache/indices-cache");
const clusterManager = require("../elasticsearch/cluster-manager");
const { createIndexMapping } = require("../elasticsearch/client");

// Helper function to check port availability
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

const router = express.Router();

// GET the content of a node's configuration file
router.get("/:nodeName/config", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  try {
    const configContent = await clusterManager.getNodeConfigContent(nodeName);
    res.type("text/plain"); // Set content type to plain text
    res.send(configContent);
  } catch (error) {
    console.error(`Error fetching config for node ${nodeName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET the list of indices for a specific node
router.get("/:nodeName/indices", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig || !nodeConfig.http || !nodeConfig.network) {
      return res
        .status(404)
        .json({ error: `Configuration for node ${nodeName} not found.` });
    }

    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require("../elasticsearch/client");
    const nodeClient = getSingleNodeClient(nodeUrl);

    // Fetch all indices visible to the node
    const indicesResponse = await nodeClient.cat.indices({
      format: "json",
      h: "index,status,health,doc.count,store.size,creation.date.string,uuid",
      s: "index:asc",
    });
    // Fetch all shards for this node
    const shardsResponse = await nodeClient.cat.shards({
      format: "json",
    });
    // Build a set of indices that have at least one shard on this node
    const indicesWithShards = new Set();
    // The node name in the cluster may be different from the config name, so get the actual node name from config
    const actualNodeName = nodeConfig.node && nodeConfig.node.name ? nodeConfig.node.name : nodeName;
    for (const shard of shardsResponse) {
      if (shard.node === actualNodeName && shard.index) {
        indicesWithShards.add(shard.index);
      }
    }
    // Only include indices that have a shard on this node
    const filteredIndices = indicesResponse.filter((index) => indicesWithShards.has(index.index));
    // For each index, get true doc count and parse store.size as bytes
    const indicesWithStats = await Promise.all(filteredIndices.map(async (index) => {
      // Get true doc count
      let docCount = 0;
      try {
        const countResp = await nodeClient.count({ index: index.index });
        docCount = typeof countResp.count === 'number' ? countResp.count : 0;
      } catch (e) {
        docCount = index["doc.count"] || 0;
      }
      // Parse store.size as bytes
      let storeSize = 0;
      if (index["store.size"]) {
        const sizeStr = String(index["store.size"]).toLowerCase();
        const sizeMatch = sizeStr.match(/([\d.]+)\s*(b|kb|mb|gb|tb)?/);
        if (sizeMatch) {
          let value = parseFloat(sizeMatch[1]);
          let unit = sizeMatch[2] || 'b';
          const multipliers = { b: 1, kb: 1024, mb: 1024*1024, gb: 1024*1024*1024, tb: 1024*1024*1024*1024 };
          storeSize = value * (multipliers[unit] || 1);
          storeSize = Math.round(storeSize);
        }
      }
      // Normalize creation date
      let creationDate = index["creation.date.string"] || null;
      let creation = null;
      if (creationDate) {
        creation = { date: { string: creationDate } };
      }
      return {
        index: index.index,
        "doc.count": docCount,
        "store.size": storeSize,
        health: index.health,
        status: index.status,
        uuid: index.uuid,
        creation,
      };
    }));

    res.json(indicesWithStats);
  } catch (error) {
    console.error(`Error fetching indices for node ${nodeName}:`, error);
    res
      .status(500)
      .json({ error: "Failed to fetch indices: " + error.message });
  }
});

// Create an index on a specific node
router.post("/:nodeName/indices", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  const { indexName, shards, replicas } = req.body;

  if (!indexName) {
    return res.status(400).json({ error: "Index name is required." });
  }

  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig) {
      return res.status(404).json({ error: `Node '${nodeName}' not found.` });
    }

    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require("../elasticsearch/client");
    const nodeClient = getSingleNodeClient(nodeUrl);

    // Check if index already exists in this node's cluster
    let indexExists = false;
    try {
      const existsResp = await nodeClient.indices.exists({ index: indexName, timeout: "2s" });
      indexExists = existsResp.body === true || existsResp === true;
    } catch (e) {
      // If error is not 404, treat as exists = false
      indexExists = false;
    }
    if (indexExists) {
      return res.status(409).json({
        error: `Index '${indexName}' already exists in this node's cluster. Index names must be unique per cluster.`,
        reason: "index_exists_in_cluster"
      });
    }

    // Try to create the index with a timeout and catch connection errors
    try {
      await nodeClient.indices.create({
        index: indexName,
        wait_for_active_shards: "1",
        timeout: "5s",
        body: createIndexMapping(shards || 1, replicas || 0),
      });
    } catch (err) {
      if (err && err.message && err.message.includes("resource_already_exists_exception")) {
        return res.status(409).json({
          error: `Index '${indexName}' already exists in this node's cluster. Index names must be unique per cluster.`,
          reason: "index_exists_in_cluster",
          details: err.message
        });
      }
      if (err && err.message && err.message.includes("Request timed out")) {
        return res.status(504).json({
          error: `Node '${nodeName}' did not respond in time. Is it running?`,
          reason: "node_timeout",
          details: err.message
        });
      }
      return res.status(500).json({
        error: `Failed to create index on node '${nodeName}'.`,
        details: err.message
      });
    }

    // Force immediate refresh on the created index to ensure it's visible
    try {
      await nodeClient.indices.refresh({ index: indexName, timeout: "3s" });
    } catch (refreshError) {
      console.warn(
        `Warning: Could not refresh index ${indexName}:`,
        refreshError.message
      );
      // If refresh times out, still continue
    }

    // Small delay to ensure Elasticsearch propagates the index state
    await new Promise((resolve) => setTimeout(resolve, 100));

    // After successful index creation, refresh persistent cache and only respond after it's done
    try {
      await refreshClusterCache();
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after creating index:`,
        cacheError.message
      );
      // Still continue, but warn
    }

    res.status(201).json({
      message: `Index '${indexName}' created successfully on node '${nodeName}'.`,
    });
  } catch (error) {
    console.error(`Error creating index on node ${nodeName}:`, error);
    res.status(500).json({ error: "Failed to create index.", details: error.message });
  }
});

// Delete an index from a specific node
router.delete("/:nodeName/indices/:indexName", verifyJwt, async (req, res) => {
  const { nodeName, indexName } = req.params;

  if (!indexName) {
    return res.status(400).json({ error: "Index name is required." });
  }

  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig) {
      return res.status(404).json({ error: `Node '${nodeName}' not found.` });
    }

    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require("../elasticsearch/client");
    const nodeClient = getSingleNodeClient(nodeUrl);

    await nodeClient.indices.delete({
      index: indexName,
    });

    // Small delay to ensure Elasticsearch propagates the deletion
    await new Promise((resolve) => setTimeout(resolve, 100));

    // After successful deletion, refresh persistent cache and only respond after it's done
    try {
      await refreshClusterCache();
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after deleting index:`,
        cacheError.message
      );
      // Still continue, but warn
    }

    res.json({
      message: `Index '${indexName}' deleted successfully from node '${nodeName}'.`,
    });
  } catch (error) {
    console.error(
      `Error deleting index ${indexName} on node ${nodeName}:`,
      error
    );
    if (error.meta && error.meta.statusCode === 404) {
      res
        .status(404)
        .json({
          error: `Index '${indexName}' not found on node '${nodeName}'.`,
        });
    } else {
      res
        .status(500)
        .json({ error: "Failed to delete index.", details: error.message });
    }
  }
});

// GET individual node details
router.get("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    // Get cluster status to find the node (same source as local-nodes endpoint)
    const clusterStatus = await clusterManager.getClusterStatus();

    // Find the node by name
    let nodeData = clusterStatus.nodes.find((node) => node.name === nodeName);

    // Get nodeMeta from config
    let nodeMeta = getConfig("nodeMetadata")?.[nodeName];
    let pathsOk = nodeMeta && (await nodePathsExist(nodeMeta));
    if (!pathsOk) {
      // Try to auto-heal: verifyNodeMetadata, reload config from disk, try again
      await clusterManager.repairAndVerifyNodeMetadata();
      // Force reload config from disk
      const { loadConfig, getConfig, setConfig } = require("../config");
      await loadConfig();
      nodeMeta = getConfig("nodeMetadata")?.[nodeName];
      pathsOk = nodeMeta && (await nodePathsExist(nodeMeta));
      if (!pathsOk) {
        // Log the actual paths and errors
        const fs = require("fs").promises;
        let dataError = null, logsError = null;
        let dataExists = false, logsExists = false;
        if (nodeMeta && nodeMeta.dataPath) {
          try { await fs.access(nodeMeta.dataPath); dataExists = true; } catch (e) { dataError = e.message; }
        }
        if (nodeMeta && nodeMeta.logsPath) {
          try { await fs.access(nodeMeta.logsPath); logsExists = true; } catch (e) { logsError = e.message; }
        }
        // If the folders exist but config is wrong, update and save config
        if (dataExists && logsExists) {
          // Save the config to ensure it's up to date
          const nodeMetadata = getConfig("nodeMetadata") || {};
          nodeMetadata[nodeName] = nodeMeta;
          await setConfig("nodeMetadata", nodeMetadata);
          // Try again
          pathsOk = await nodePathsExist(nodeMeta);
          if (pathsOk) {
            // Also update nodeData if needed
            const clusterStatus2 = await clusterManager.getClusterStatus();
            nodeData = clusterStatus2.nodes.find((node) => node.name === nodeName);
            const nodeUrl = `http://${nodeData.host}:${nodeData.port}`;
            return res.json({ nodeUrl, ...nodeData });
          }
        }
        await refreshClusterCache();
        return res.status(410).json({
          error: `Node "${nodeName}" data or logs missing on disk. Cache refreshed.`,
          details: {
            dataPath: nodeMeta && nodeMeta.dataPath,
            logsPath: nodeMeta && nodeMeta.logsPath,
            dataExists,
            logsExists,
            dataError,
            logsError
          }
        });
      }
      // Also update nodeData if needed
      const clusterStatus2 = await clusterManager.getClusterStatus();
      nodeData = clusterStatus2.nodes.find((node) => node.name === nodeName);
    }
    // Build node URL for compatibility
    const nodeUrl = `http://${nodeData.host}:${nodeData.port}`;
    res.json({
      nodeUrl,
      ...nodeData,
    });
  } catch (error) {
    console.error("Error getting node details:", error);
    res
      .status(500)
      .json({ error: "Failed to get node details: " + error.message });
  }
});

// Move node to a new location
router.post("/nodes/:nodeName/move", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { newPath, preserveData } = req.body;

    if (!newPath || typeof newPath !== "string") {
      return res.status(400).json({ error: "New path is required" });
    }

    // Ensure node is stopped before moving
    const isRunning = await clusterManager.isNodeRunning(nodeName);
    if (isRunning) {
      return res.status(409).json({
        error: "Cannot move a running node. Please stop the node first.",
        reason: "node_running",
      });
    }

    // Check if destination exists and handle conflicts
    const fs = require("fs").promises;

    const destinationExists = await fs
      .access(newPath)
      .then(() => true)
      .catch(() => false);
    if (destinationExists) {
      return res.status(409).json({
        error: `Destination path "${newPath}" already exists`,
        reason: "destination_exists",
      });
    }

    const moveResult = await clusterManager.moveNode(
      nodeName,
      newPath,
      preserveData
    );

    // Update metadata
    const nodeMetadata = getConfig("nodeMetadata") || {};
    const currentMetadata = Object.values(nodeMetadata).find(
      (m) => m.name === nodeName
    );

    if (currentMetadata) {
      const nodeUrl = Object.keys(nodeMetadata).find(
        (url) => nodeMetadata[url].name === nodeName
      );
      if (nodeUrl) {
        nodeMetadata[nodeUrl] = {
          ...currentMetadata,
          dataPath: moveResult.newDataPath,
          logsPath: moveResult.newLogsPath,
          configPath: moveResult.newConfigPath,
          servicePath: moveResult.newServicePath,
        };
        await setConfig("nodeMetadata", nodeMetadata);
      }
    }

    // Refresh persistent indices cache after node move
    try {
      await refreshClusterCache();
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after moving node:`,
        cacheError.message
      );
    }

    res.json({
      message: `Node "${nodeName}" moved successfully to ${newPath}`,
      newPaths: moveResult,
    });
  } catch (error) {
    console.error(`Error moving node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to move node: " + error.message });
  }
});

// Copy node to a new location with a new name
router.post("/nodes/:nodeName/copy", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { newNodeName, newPath, copyData } = req.body;

    if (!newNodeName || typeof newNodeName !== "string") {
      return res.status(400).json({ error: "New node name is required" });
    }

    if (!newPath || typeof newPath !== "string") {
      return res.status(400).json({ error: "New path is required" });
    }

    // Check if new node name already exists
    const existingMetadata = getConfig("nodeMetadata") || {};
    const nodeExists = Object.values(existingMetadata).some(
      (m) => m.name === newNodeName
    );
    if (nodeExists) {
      return res.status(409).json({
        error: `Node with name "${newNodeName}" already exists`,
        reason: "node_name_exists",
      });
    }

    // Check if destination exists
    const fs = require("fs").promises;
    const destinationExists = await fs
      .access(newPath)
      .then(() => true)
      .catch(() => false);
    if (destinationExists) {
      return res.status(409).json({
        error: `Destination path "${newPath}" already exists`,
        reason: "destination_exists",
      });
    }

    const copyResult = await clusterManager.copyNode(
      nodeName,
      newNodeName,
      newPath,
      copyData
    );

    // Add new node to configuration
    const currentNodes = getConfig("elasticsearchNodes") || [];
    const updatedNodes = [...currentNodes, newNodeName];
    await setConfig("elasticsearchNodes", updatedNodes);

    // Store new node metadata (keyed by node name)
    const currentMetadata = getConfig("nodeMetadata") || {};
    currentMetadata[newNodeName] = {
      nodeUrl: copyResult.nodeUrl,
      name: newNodeName,
      configPath: copyResult.configPath,
      servicePath: copyResult.servicePath,
      dataPath: copyResult.dataPath,
      logsPath: copyResult.logsPath,
      cluster: copyResult.cluster,
      host: copyResult.host,
      port: copyResult.port,
      transportPort: copyResult.transportPort,
      roles: copyResult.roles,
    };
    await setConfig("nodeMetadata", currentMetadata);

    // Refresh persistent indices cache after node copy
    try {
      await refreshClusterCache();
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after copying node:`,
        cacheError.message
      );
    }

    res.json({
      message: `Node "${nodeName}" copied successfully to "${newNodeName}"`,
      newNode: copyResult,
    });
  } catch (error) {
    console.error(`Error copying node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to copy node: " + error.message });
  }
});

// GET node disk usage and stats
router.get("/nodes/:nodeName/stats", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    // Get node metadata to resolve nodeUrl
    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    const nodeMeta = nodeMetadata[nodeName];
    if (!nodeMeta || !nodeMeta.nodeUrl) {
      return res.status(404).json({ error: `No nodeUrl found for node "${nodeName}"` });
    }

    // Check data/logs existence
    if (!nodeMeta || !(await nodePathsExist(nodeMeta))) {
      await refreshClusterCache();
      return res.status(410).json({ error: `Node "${nodeName}" data or logs missing on disk. Cache refreshed.` });
    }

    // Use direct client for this node
    const { getSingleNodeClient } = require("../elasticsearch/client");
    const es = getSingleNodeClient(nodeMeta.nodeUrl);

    // Defensive: Await node stats, handle undefined/null response
    let nodeStats;
    try {
      nodeStats = await es.nodes.stats({
        metric: ["fs", "os", "jvm"]
      });
    } catch (err) {
      console.warn(
        `Failed to get node stats for ${nodeName} at ${nodeMeta.nodeUrl}:`,
        err.message
      );
      nodeStats = null;
    }

    let targetNodeStats = null;
    let nodeIds = [];
    if (nodeStats && nodeStats.nodes && typeof nodeStats.nodes === "object") {
      nodeIds = Object.keys(nodeStats.nodes);
    }
    if (
      nodeStats &&
      nodeStats.nodes &&
      typeof nodeStats.nodes === "object" &&
      nodeIds.length > 0
    ) {
      // Use the first (and likely only) node in the response
      targetNodeStats = nodeStats.nodes[nodeIds[0]];
    }

    if (!targetNodeStats) {
      return res
        .status(404)
        .json({ error: `No statistics found for node "${nodeName}"` });
    }

    // Format disk information
    const diskInfo =
      targetNodeStats.fs && Array.isArray(targetNodeStats.fs.data)
        ? targetNodeStats.fs.data.map((disk) => ({
            path: disk.path,
            total: disk.total_in_bytes,
            free: disk.free_in_bytes,
            available: disk.available_in_bytes,
            used: disk.total_in_bytes - disk.free_in_bytes,
            usedPercent:
              disk.total_in_bytes > 0
                ? Math.round(
                    ((disk.total_in_bytes - disk.free_in_bytes) /
                      disk.total_in_bytes) *
                      100
                  )
                : 0,
          }))
        : [];

    // Format OS information if available
    const osInfo = targetNodeStats.os
      ? {
          cpu: targetNodeStats.os.cpu,
          mem: targetNodeStats.os.mem,
          swap: targetNodeStats.os.swap,
        }
      : null;

    // Format JVM information if available
    const jvmInfo =
      targetNodeStats.jvm && targetNodeStats.jvm.mem
        ? {
            heap_used_percent: targetNodeStats.jvm.mem.heap_used_percent,
            heap_used: targetNodeStats.jvm.mem.heap_used_in_bytes,
            heap_max: targetNodeStats.jvm.mem.heap_max_in_bytes,
          }
        : null;

    res.json({
      nodeName,
      diskInfo,
      osInfo,
      jvmInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting node stats:", error);
    res
      .status(500)
      .json({ error: "Failed to get node statistics: " + error.message });
  }
});

// POST validate node configuration
router.post("/validate-node", verifyJwt, async (req, res) => {
  try {
    const { nodeConfig, originalName } = req.body;
    if (!nodeConfig || typeof nodeConfig !== "object") {
      return res.status(400).json({ valid: false, errors: ["Node configuration is required and must be an object"] });
    }

    // Validate required fields
    const requiredFields = ["name", "port", "transportPort"];
    const missingFields = requiredFields.filter((field) => !nodeConfig[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        valid: false,
        errors: missingFields.map((field) => `${field} is required`),
      });
    }

    // Validate node configuration
    const validationResult = await clusterManager.validateNodeConfig(nodeConfig, originalName);

    if (!validationResult.valid) {
      return res.status(409).json({
        valid: false,
        conflicts: validationResult.conflicts,
        suggestions: validationResult.suggestions,
      });
    }

    // If validation passes
    res.json({
      valid: true,
      message: "Node configuration is valid",
    });
  } catch (error) {
    console.error("Error validating node configuration:", error);
    res.status(500).json({ valid: false, error: "Failed to validate node configuration", details: error.message });
  }
});
// POST stop node
router.post("/nodes/:nodeName/stop", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    
    // Create a task for tracking the node stopping progress
    const { createTask, updateTask } = require("../utils/task-utils");
    const taskId = createTask("Stop Node", "initializing", null, nodeName);
    
    // Set status to 'stopping' in nodeMetadata
    const nodeMetadata = getConfig("nodeMetadata") || {};
    if (nodeMetadata[nodeName]) {
      nodeMetadata[nodeName].status = "stopping";
      await setConfig("nodeMetadata", nodeMetadata);
    }
    
    // Return task ID immediately so frontend can track progress
    res.json({ 
      message: `Stopping node "${nodeName}"...`,
      taskId,
      status: "stopping" 
    });
    
    // Update task to in-progress
    updateTask(taskId, {
      status: "stopping",
      progress: 10,
      total: 100,
      message: `Stopping node "${nodeName}"...`
    });
    
    try {
      // Stop the node with progress callback
      const result = await clusterManager.stopNode(nodeName, (progress) => {
        updateTask(taskId, {
          status: progress.status,
          progress: progress.progress,
          total: 100,
          message: progress.message,
          error: progress.error
        });
      });
      
      // Set status to 'stopped' in nodeMetadata after successful stop
      const nodeMetadataAfter = getConfig("nodeMetadata") || {};
      if (nodeMetadataAfter[nodeName]) {
        nodeMetadataAfter[nodeName].status = "stopped";
        await setConfig("nodeMetadata", nodeMetadataAfter);
      }
      
      // Refresh persistent indices cache after node stop
      try {
        await refreshClusterCache();
      } catch (cacheError) {
        console.warn(
          `⚠️ Failed to refresh persistent indices cache after stopping node:`,
          cacheError.message
        );
      }
      
      // Update task to completed if not already done by the callback
      updateTask(taskId, {
        status: "completed",
        progress: 100,
        total: 100,
        completed: true,
        message: `Node "${nodeName}" stopped successfully`
      });
      
    } catch (error) {
      console.error(`Error stopping node ${nodeName}:`, error);
      
      // Update task with error if not already done by the callback
      updateTask(taskId, {
        status: "error",
        error: error.message || "Failed to stop node",
        completed: true,
        message: `Failed to stop node "${nodeName}": ${error.message || "Unknown error"}`
      });
    }
    
  } catch (error) {
    console.error(`Error in node stop endpoint for ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to stop node: " + error.message });
  }
});

// DELETE remove node
router.delete("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    // Fix: Safely destructure preserveData from req.body or default to {}
    const { preserveData } = req.body || {};

    // Remove from cluster manager (this will handle filesystem cleanup gracefully)
    const removeResult = await clusterManager.removeNode(nodeName, preserveData);
    if (removeResult.warnings && removeResult.warnings.length > 0) {
      console.warn(
        `⚠️ Node removal completed with warnings:`,
        removeResult.warnings
      );
    }

    // Remove node from indices cache
    try {
      const { removeNodeFromCache } = require("../cache/indices-cache");
      await removeNodeFromCache(nodeName);
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to remove node from indices cache:`,
        cacheError.message
      );
    }

    // Update configuration: remove from elasticsearchNodes and nodeMetadata by node name
    const currentNodes = getConfig("elasticsearchNodes") || [];
    const updatedNodes = currentNodes.filter((n) => n !== nodeName);
    await setConfig("elasticsearchNodes", updatedNodes);

    const nodeMetadata = getConfig("nodeMetadata") || {};
    if (nodeMetadata[nodeName]) {
      delete nodeMetadata[nodeName];
      await setConfig("nodeMetadata", nodeMetadata);
    }

    // Update write node if necessary
    const currentWriteNode = getConfig("writeNode");
    if (currentWriteNode === nodeName) {
      if (updatedNodes.length > 0) {
        await setConfig("writeNode", updatedNodes[0]);
      } else {
        await setConfig("writeNode", null);
      }
    }

    // Refresh persistent cache after node removal to clean up removed nodes
    try {
      await refreshClusterCache();
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
    console.error(`Error removing node ${req.params.nodeName}:`, error);

    // Even if there was an error, try to clean up config
    try {
      const { nodeName } = req.params;
      const nodeMetadata = getConfig("nodeMetadata") || {};
      const currentNodes = getConfig("elasticsearchNodes") || [];

      // Try to find and remove orphaned config entries
      let cleaned = false;
      for (const [url, metadata] of Object.entries(nodeMetadata)) {
        if (metadata.name === nodeName) {
          delete nodeMetadata[url];
          await setConfig("nodeMetadata", nodeMetadata);

          const updatedNodes = currentNodes.filter((u) => u !== url);
          await setConfig("elasticsearchNodes", updatedNodes);
          cleaned = true;
          break;
        }
      }

      if (cleaned) {
        // Refresh cache after emergency cleanup
        try {
          await refreshClusterCache();
        } catch (cacheError) {
          console.warn(
            `⚠️ Failed to refresh cache after emergency cleanup:`,
            cacheError.message
          );
        }

        res.json({
          message: `Node "${nodeName}" config cleaned up (filesystem cleanup failed: ${error.message})`,
          warning: "Some files may remain on disk and need manual cleanup",
        });
      } else {
        res
          .status(500)
          .json({ error: "Failed to remove node: " + error.message });
      }
    } catch (cleanupError) {
      console.error(`Failed to perform emergency cleanup:`, cleanupError);
      res
        .status(500)
        .json({ error: "Failed to remove node: " + error.message });
    }
  }
});

// POST repair and verify all nodes (combined action)
router.post("/nodes/repair-and-verify", verifyJwt, async (req, res) => {
  try {
    // --- Step 1: Repair nodes (fix paths, remove unrecoverable) ---
    const nodeMetadata = getConfig("nodeMetadata") || {};
    let changed = false;
    let repaired = [];
    let removed = [];
    for (const nodeName of Object.keys(nodeMetadata)) {
      const meta = nodeMetadata[nodeName];
      try {
        // Try to repair node paths
        const ok = await nodePathsExist(meta);
        if (ok) {
          repaired.push(nodeName);
        } else {
          // Unrecoverable, remove from config
          removed.push(nodeName);
          delete nodeMetadata[nodeName];
          changed = true;
        }
      } catch (e) {
        removed.push(nodeName);
        delete nodeMetadata[nodeName];
        changed = true;
        console.error(`[nodes/repair-and-verify] Error repairing node '${nodeName}':`, e);
      }
    }
    if (changed) {
      try {
        await setConfig("nodeMetadata", nodeMetadata);
      } catch (err) {
        console.error("[nodes/repair-and-verify] Failed to update nodeMetadata config:", err);
      }
      // Also update elasticsearchNodes list
      try {
        const currentNodes = getConfig("elasticsearchNodes") || [];
        const updatedNodes = currentNodes.filter((name) => nodeMetadata[name]);
        await setConfig("elasticsearchNodes", updatedNodes);
      } catch (err) {
        console.error("[nodes/repair-and-verify] Failed to update elasticsearchNodes config:", err);
      }
    }
    // --- Step 2: Verify and repair node metadata ---
    let verifyResult = {};
    try {
      verifyResult = await clusterManager.repairAndVerifyNodeMetadata();
    } catch (error) {
      console.error("[nodes/repair-and-verify] Error verifying node metadata:", error);
      verifyResult = { error: error.message };
    }
    // --- Step 3: Refresh cluster cache ---
    try {
      await refreshClusterCache();
    } catch (err) {
      console.warn("[nodes/repair-and-verify] Failed to refresh cluster cache:", err);
    }
    // --- Step 4: Respond with combined summary ---
    res.json({
      message: `Repair and verify complete. ${repaired.length} nodes repaired, ${removed.length} removed.`,
      repaired,
      removed,
      verifyResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error repairing and verifying nodes:", error);
    res.status(500).json({ error: "Failed to repair and verify nodes: " + (error?.message || error) });
  }
});

// GET all local nodes and indices-by-nodes (for frontend dashboard)
router.get("/local-nodes", verifyJwt, async (req, res) => {
  try {
    const { listNodes } = require("../elasticsearch/node-metadata");
    const { getConfig } = require("../config");
    const forceRefresh = req.query.forceRefresh === "true";
    if (forceRefresh) {
      const { refreshClusterCache } = require("../cache/indices-cache");
      await refreshClusterCache();
    }
    // Use nodeMetadata as the single source of truth
    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    // nodes array for UI
    const nodes = Object.values(nodeMetadata);
    // indicesByNodes for backward compatibility (same as nodeMetadata keyed by name)
    const indicesByNodes = {};
    for (const [nodeName, meta] of Object.entries(nodeMetadata)) {
      indicesByNodes[nodeName] = meta;
    }
    res.json({ nodes, indicesByNodes });
  } catch (error) {
    console.error("Error fetching local nodes or indices cache:", error);
    res.status(500).json({ error: "Failed to fetch local nodes or indices cache" });
  }
});

// POST start a node
router.post("/nodes/:nodeName/start", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    if (!nodeName || typeof nodeName !== "string") {
      return res.status(400).json({ error: "Node name is required and must be a string." });
    }
    
    // Create a task for tracking the node startup progress
    const { createTask, updateTask } = require("../utils/task-utils");
    const taskId = createTask("Start Node", "initializing", null, nodeName);
    
    // Set status to 'starting' in nodeMetadata
    const nodeMetadata = getConfig("nodeMetadata") || {};
    if (nodeMetadata[nodeName]) {
      nodeMetadata[nodeName].status = "starting";
      await setConfig("nodeMetadata", nodeMetadata);
    }
    
    // Return task ID immediately so frontend can track progress
    res.json({ 
      message: `Starting node "${nodeName}"...`,
      taskId,
      status: "starting" 
    });
    
    // Start the node asynchronously
    const { startNode } = require("../elasticsearch/node-process");
    const { getNodeMetadata } = require("../elasticsearch/node-metadata");
    
    // Update task to in-progress
    updateTask(taskId, {
      status: "starting",
      progress: 10,
      total: 100,
      message: `Initializing node "${nodeName}"...`
    });
    
    try {
      // Start the node with progress callback
      const result = await startNode(nodeName, (progress) => {
        updateTask(taskId, {
          status: progress.status,
          progress: progress.progress,
          total: 100,
          message: progress.message,
          error: progress.error
        });
      });
      
      // Update node metadata status
      const nodeMetadataAfter = getConfig("nodeMetadata") || {};
      if (nodeMetadataAfter[nodeName]) {
        nodeMetadataAfter[nodeName].status = "running";
        await setConfig("nodeMetadata", nodeMetadataAfter);
      }
      
      // Refresh cluster cache
      try {
        await refreshClusterCache();
      } catch (cacheError) {
        console.warn(
          `⚠️ Failed to refresh persistent indices cache after starting node:`,
          cacheError.message
        );
      }
      
      // Update task to completed if not already done by the callback
      updateTask(taskId, {
        status: "completed",
        progress: 100,
        total: 100,
        completed: true,
        message: `Node "${nodeName}" started successfully`
      });
      
    } catch (error) {
      console.error(`Error starting node ${nodeName}:`, error);
      
      // Update node metadata to reflect failure
      const nodeMetadataAfter = getConfig("nodeMetadata") || {};
      if (nodeMetadataAfter[nodeName]) {
        nodeMetadataAfter[nodeName].status = "stopped";
        await setConfig("nodeMetadata", nodeMetadataAfter);
      }
      
      // Update task with error if not already done by the callback
      updateTask(taskId, {
        status: "error",
        error: error.message || "Failed to start node",
        completed: true,
        message: `Failed to start node "${nodeName}": ${error.message || "Unknown error"}`
      });
    }
    
  } catch (error) {
    console.error(`Error in node start endpoint for ${req.params.nodeName}:`, error);
    res.status(500).json({ error: error.message || "Failed to start node" });
  }
});

// GET node operation task status
router.get("/tasks/:taskId", verifyJwt, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { getTask } = require("../utils/task-utils");
    
    const task = getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    res.json(task);
  } catch (error) {
    console.error(`Error getting task status:`, error);
    res.status(500).json({ error: "Failed to get task status: " + error.message });
  }
});

// Helper to check node data/logs existence
const fs = require("fs").promises;
async function nodePathsExist(nodeMeta) {
  let dataExists = true, logsExists = true;
  const { getConfig, setConfig } = require("../config");
  const path = require("path");
  // Helper to set permissions for Linux/macOS
  async function setUnixPermissions(path) {
    if (process.platform === "linux" || process.platform === "darwin") {
      try {
        await fs.chmod(path, 0o770);
      } catch (e) {
        console.warn(`[nodePathsExist] Failed to set permissions for ${path}:`, e.message);
      }
    }
  }
  if (!nodeMeta || typeof nodeMeta !== "object" || !nodeMeta.name) {
    console.error("[nodePathsExist] Invalid nodeMeta input:", nodeMeta);
    return false;
  }
  // Defensive: Ensure paths are strings
  if (nodeMeta.dataPath && typeof nodeMeta.dataPath !== "string") {
    console.error(`[nodePathsExist] dataPath is not a string for node:`, nodeMeta.name);
    dataExists = false;
  }
  if (nodeMeta.logsPath && typeof nodeMeta.logsPath !== "string") {
    console.error(`[nodePathsExist] logsPath is not a string for node:`, nodeMeta.name);
    logsExists = false;
  }
  // --- Patch: If dataPath/logsPath missing, try to auto-heal if folder was renamed ---
  let configChanged = false;
  // Check and recreate dataPath if missing
  if (nodeMeta.dataPath && typeof nodeMeta.dataPath === "string") {
    try {
      await fs.access(nodeMeta.dataPath);
    } catch (e) {
      // Try to find the correct folder if this is a canonical node folder
      const nodesDir = path.dirname(path.dirname(nodeMeta.dataPath)); // .../nodes/<nodeName>
      const nodeName = nodeMeta.name;
      const expectedDataPath = path.join(nodesDir, nodeName, "data");
      try {
        await fs.access(expectedDataPath);
        // If found, update config
        if (nodeMeta.dataPath !== expectedDataPath) {
          nodeMeta.dataPath = expectedDataPath;
          configChanged = true;
          console.info(`[nodePathsExist] Auto-healed dataPath for node ${nodeName}: ${expectedDataPath}`);
        }
      } catch {
        // Fallback: Try to create directory, retry once if fails
        try {
          await fs.mkdir(nodeMeta.dataPath, { recursive: true });
          await setUnixPermissions(nodeMeta.dataPath);
          dataExists = false;
          console.info(`[nodePathsExist] Recreated missing dataPath: ${nodeMeta.dataPath}`);
        } catch (mkdirErr) {
          await new Promise(r => setTimeout(r, 100));
          try {
            await fs.mkdir(nodeMeta.dataPath, { recursive: true });
            await setUnixPermissions(nodeMeta.dataPath);
            dataExists = false;
            console.info(`[nodePathsExist] Retried and recreated missing dataPath: ${nodeMeta.dataPath}`);
          } catch (retryErr) {
            console.error(`[nodePathsExist] Failed to create dataPath ${nodeMeta.dataPath} after retry:`, retryErr.message);
            dataExists = false;
          }
        }
      }
    }
  } else {
    dataExists = false;
    console.warn(`[nodePathsExist] dataPath missing or invalid for node:`, nodeMeta.name);
  }
  // Check and recreate logsPath if missing
  if (nodeMeta.logsPath && typeof nodeMeta.logsPath === "string") {
    try {
      await fs.access(nodeMeta.logsPath);
    } catch (e) {
      // Try to find the correct folder if this is a canonical node folder
      const nodesDir = path.dirname(path.dirname(nodeMeta.logsPath));
      const nodeName = nodeMeta.name;
      const expectedLogsPath = path.join(nodesDir, nodeName, "logs");
      try {
        await fs.access(expectedLogsPath);
        // If found, update config
        if (nodeMeta.logsPath !== expectedLogsPath) {
          nodeMeta.logsPath = expectedLogsPath;
          configChanged = true;
          console.info(`[nodePathsExist] Auto-healed logsPath for node ${nodeName}: ${expectedLogsPath}`);
        }
      } catch {
        // Fallback: Try to create directory, retry once if fails
        try {
          await fs.mkdir(nodeMeta.logsPath, { recursive: true });
          await setUnixPermissions(nodeMeta.logsPath);
          logsExists = false;
          console.info(`[nodePathsExist] Recreated missing logsPath: ${nodeMeta.logsPath}`);
        } catch (mkdirErr) {
          await new Promise(r => setTimeout(r, 100));
          try {
            await fs.mkdir(nodeMeta.logsPath, { recursive: true });
            await setUnixPermissions(nodeMeta.logsPath);
            logsExists = false;
            console.info(`[nodePathsExist] Retried and recreated missing logsPath: ${nodeMeta.logsPath}`);
          } catch (retryErr) {
            console.error(`[nodePathsExist] Failed to create logsPath ${nodeMeta.logsPath} after retry:`, retryErr.message);
            logsExists = false;
          }
        }
      }
    }
  } else {
    logsExists = false;
    console.warn(`[nodePathsExist] logsPath missing or invalid for node:`, nodeMeta.name);
  }
  // Final check: both paths must exist
  try {
    await fs.access(nodeMeta.dataPath);
    await fs.access(nodeMeta.logsPath);
    if (configChanged) {
      // Save updated nodeMetadata to config.json
      const nodeMetadata = getConfig("nodeMetadata") || {};
      nodeMetadata[nodeMeta.name] = nodeMeta;
      await setConfig("nodeMetadata", nodeMetadata);
    }
    return dataExists && logsExists;
  } catch (e) {
    console.error(`[nodePathsExist] Final access check failed for node:`, nodeMeta.name, e.message);
    return false;
  }
}

// POST create new node
router.post("/nodes", verifyJwt, async (req, res) => {
  const { name, port, transportPort, roles, heapSize, dataPath, logsPath, cluster, host } = req.body;
  // Validation
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Node name is required and must be a string." });
  }
  if (!port || typeof port !== "number") {
    return res.status(400).json({ error: "Port is required and must be a number." });
  }
  if (!transportPort || typeof transportPort !== "number") {
    return res.status(400).json({ error: "Transport port is required and must be a number." });
  }
  if (roles && typeof roles !== "object") {
    return res.status(400).json({ error: "Roles must be an object if provided." });
  }
  if (heapSize && typeof heapSize !== "string") {
    return res.status(400).json({ error: "Heap size must be a string if provided." });
  }
  if (dataPath && typeof dataPath !== "string") {
    return res.status(400).json({ error: "Data path must be a string if provided." });
  }
  if (logsPath && typeof logsPath !== "string") {
    return res.status(400).json({ error: "Logs path must be a string if provided." });
  }
  if (cluster && typeof cluster !== "string") {
    return res.status(400).json({ error: "Cluster must be a string if provided." });
  }
  if (host && typeof host !== "string") {
    return res.status(400).json({ error: "Host must be a string if provided." });
  }
  
  try {
    // Validate node configuration before creating
    const nodeConfig = {
      name,
      port,
      transportPort,
      roles: roles || { master: true, data: true, ingest: true },
      heapSize: heapSize || "1g",
      dataPath,
      logsPath,
      cluster: cluster || "trustquery-cluster",
      host: host || "localhost"
    };
    
    // Validate node configuration
    const validation = await clusterManager.validateNodeConfig(nodeConfig);
    if (!validation.valid) {
      return res.status(409).json({
        error: "Validation failed",
        conflicts: validation.conflicts,
        suggestions: validation.suggestions
      });
    }
    
    // Create the node using cluster manager
    const createdNode = await clusterManager.createNode(nodeConfig);
    
    // Update configuration: add to elasticsearchNodes and nodeMetadata
    const currentNodes = getConfig("elasticsearchNodes") || [];
    if (!currentNodes.includes(name)) {
      currentNodes.push(name);
      await setConfig("elasticsearchNodes", currentNodes);
    }
    
    // Add node metadata
    const nodeMetadata = getConfig("nodeMetadata") || {};
    nodeMetadata[name] = {
      name,
      nodeUrl: `http://${host || "localhost"}:${port}`,
      configPath: createdNode.configPath,
      servicePath: createdNode.servicePath,
      dataPath: createdNode.dataPath,
      logsPath: createdNode.logsPath,
      cluster: cluster || "trustquery-cluster",
      host: host || "localhost",
      port,
      transportPort,
      roles: roles || { master: true, data: true, ingest: true },
      heapSize: heapSize || "1g"
    };
    await setConfig("nodeMetadata", nodeMetadata);
    
    // If this is the first node, set it as the write node
    if (currentNodes.length === 1) {
      await setConfig("writeNode", name);
    }
    
    // Refresh cluster cache after node creation
    try {
      await refreshClusterCache();
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after creating node:`,
        cacheError.message
      );
    }
    
    res.status(201).json({
      message: `Node "${name}" created successfully`,
      node: nodeMetadata[name]
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
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Updates must be provided as an object." });
    }
    // Validate updatable fields if present
    if (updates.name && typeof updates.name !== "string") {
      return res.status(400).json({ error: "Node name must be a string if provided." });
    }
    if (updates.port && typeof updates.port !== "number") {
      return res.status(400).json({ error: "Port must be a number if provided." });
    }
    if (updates.transportPort && typeof updates.transportPort !== "number") {
      return res.status(400).json({ error: "Transport port must be a number if provided." });
    }
    if (updates.roles && typeof updates.roles !== "object") {
      return res.status(400).json({ error: "Roles must be an object if provided." });
    }
    if (updates.heapSize && typeof updates.heapSize !== "string") {
      return res.status(400).json({ error: "Heap size must be a string if provided." });
    }
    if (updates.dataPath && typeof updates.dataPath !== "string") {
      return res.status(400).json({ error: "Data path must be a string if provided." });
    }
    if (updates.logsPath && typeof updates.logsPath !== "string") {
      return res.status(400).json({ error: "Logs path must be a string if provided." });
    }
    if (updates.cluster && typeof updates.cluster !== "string") {
      return res.status(400).json({ error: "Cluster must be a string if provided." });
    }
    if (updates.host && typeof updates.host !== "string") {
      return res.status(400).json({ error: "Host must be a string if provided." });
    }
    // Get current node metadata to find the original config
    const currentMetadata = getConfig("nodeMetadata") || {};
    const originalNodeConfig = currentMetadata[nodeName];
    if (!originalNodeConfig) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }

    // Check data/logs existence
    if (!(await nodePathsExist(originalNodeConfig))) {
      await refreshClusterCache();
      return res.status(410).json({ error: `Node "${nodeName}" data or logs missing on disk. Cache refreshed.` });
    }

    // Check if the node is currently running
    const status = (await clusterManager.isNodeRunning(nodeName)) ? "running" : "stopped";
    if (status === "running") {
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
    let newMetadata = {
      ...originalNodeConfig,
      ...updates,
      // Always preserve original dataPath and logsPath
      dataPath: originalNodeConfig.dataPath,
      logsPath: originalNodeConfig.logsPath,
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
      await refreshClusterCache();
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
    if (!cluster || typeof cluster !== "string") {
      return res.status(400).json({ error: "Cluster name is required and must be a string." });
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
    res.status(500).json({ error: "Failed to change node cluster: " + error.message });
  }
});

module.exports = router;