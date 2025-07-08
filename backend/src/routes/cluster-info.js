const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig } = require("../config");
const { getES } = require("../elasticsearch/client");
const clusterManager = require("../elasticsearch/cluster-manager");

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
      es.nodes.info(),
    ]);

    // Get node stats for disk usage
    const nodeStats = await es.nodes.stats({
      metric: ["fs"],
    });

    // Process node information
    const nodeList = [];
    const nodeDisks = {};

    Object.entries(nodes.nodes).forEach(([nodeId, node]) => {
      nodeList.push({
        id: nodeId,
        name: node.name,
        version: node.version,
        roles: node.roles,
        os: node.os,
        jvm: node.jvm,
      });

      // Process disk information if available
      const nodeDisk = nodeStats.nodes[nodeId]?.fs?.total;
      if (nodeDisk) {
        const disk = nodeDisk;
        nodeDisks[nodeId] = Object.freeze({
          total: disk.total_in_bytes,
          free: disk.free_in_bytes,
          available: disk.available_in_bytes,
          used: disk.total_in_bytes - disk.free_in_bytes,
        });
      }
    });

    // Get cluster status from cluster manager
    const clusterStatus = await clusterManager.getClusterStatus();

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
      elasticsearchNodes: config.elasticsearchNodes || [],
      writeNode: config.writeNode || null,
      nodeAttributes: config.nodeAttributes || {},
      localClusterStatus: clusterStatus,
    });
  } catch (error) {
    console.error("Error fetching cluster information:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch cluster information: " + error.message });
  }
});

// GET all clusters
router.get("/clusters", verifyJwt, async (req, res) => {
  try {
    const nodeMetadata = getConfig("nodeMetadata") || {};
    let clusterList = getConfig("clusterList") || [];
    
    // Always ensure default cluster is present
    if (!clusterList.includes("trustquery-cluster")) {
      clusterList.push("trustquery-cluster");
    }
    
    // Convert to array of cluster objects
    const clusters = clusterList.map((name) => ({
      name,
      nodeCount: Object.values(nodeMetadata).filter(
        (m) => (m.cluster || "trustquery-cluster") === name
      ).length,
    }));

    res.json({
      clusters,
    });
  } catch (error) {
    console.error("Error fetching clusters:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch clusters: " + error.message });
  }
});

module.exports = router; 