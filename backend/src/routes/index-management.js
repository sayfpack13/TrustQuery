const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");
const { refreshCacheAndSync } = require("../cache/indices-cache");
const { getSingleNodeClient } = require("../elasticsearch/client");

const router = express.Router();

// GET node indices
router.get("/:nodeName/indices", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    
    if (!nodeConfig) {
      return res.status(404).json({ error: `Node '${nodeName}' not found.` });
    }

    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const nodeClient = getSingleNodeClient(nodeUrl);
    
    const indices = await nodeClient.cat.indices({
      format: "json",
      bytes: "b",
      h: [
        "index",
        "status",
        "health",
        "pri",
        "rep",
        "docs.count",
        "store.size",
        "pri.store.size",
      ],
    });

    res.json({
      indices: indices.body,
      nodeUrl,
    });
  } catch (error) {
    console.error(`Error fetching indices for node ${req.params.nodeName}:`, error);
    res.status(500).json({
      error: "Failed to fetch indices.",
      details: error.message,
    });
  }
});

// POST create index on node
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
    const nodeClient = getSingleNodeClient(nodeUrl);

    await nodeClient.indices.create({
      index: indexName,
      wait_for_active_shards: "1",
      body: {
        settings: {
          "index.routing.allocation.require.custom_id": nodeName,
          number_of_shards: shards || 1,
          number_of_replicas: replicas || 0,
        },
      },
    });

    // Force immediate refresh on the created index
    try {
      await nodeClient.indices.refresh({ index: indexName });
    } catch (refreshError) {
      console.warn(
        `Warning: Could not refresh index ${indexName}:`,
        refreshError.message
      );
    }

    // Small delay to ensure Elasticsearch propagates the index state
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Refresh persistent indices cache after index creation
    try {
      await refreshCacheAndSync(
        `creating index ${indexName} on node ${nodeName}`
      );
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after creating index:`,
        cacheError.message
      );
    }

    res.status(201).json({
      message: `Index '${indexName}' created successfully on node '${nodeName}'.`,
    });
  } catch (error) {
    console.error(`Error creating index on node ${nodeName}:`, error);
    res
      .status(500)
      .json({ error: "Failed to create index.", details: error.message });
  }
});

// DELETE index from node
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
    const nodeClient = getSingleNodeClient(nodeUrl);

    await nodeClient.indices.delete({
      index: indexName,
    });

    // Small delay to ensure Elasticsearch propagates the deletion
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Refresh persistent indices cache after index deletion
    try {
      await refreshCacheAndSync(
        `deleting index ${indexName} from node ${nodeName}`
      );
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after deleting index:`,
        cacheError.message
      );
    }

    res.json({
      message: `Index '${indexName}' deleted successfully from node '${nodeName}'.`,
    });
  } catch (error) {
    console.error(`Error deleting index from node ${nodeName}:`, error);
    res
      .status(500)
      .json({ error: "Failed to delete index.", details: error.message });
  }
});

module.exports = router; 