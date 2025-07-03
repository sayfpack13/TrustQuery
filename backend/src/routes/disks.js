// Disk management routes
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { getES } = require("../elasticsearch/client");

const router = express.Router();

// GET disk information for a specific node
router.get("/:nodeId", verifyJwt, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const es = getES();
    
    // Get filesystem stats for the specific node
    const nodeStats = await es.nodes.stats({
      nodeId: nodeId,
      metric: ['fs']
    });

    if (!nodeStats.nodes[nodeId]) {
      return res.status(404).json({ error: "Node not found" });
    }

    const nodeData = nodeStats.nodes[nodeId];
    let disks = [];

    if (nodeData.fs && nodeData.fs.data) {
      disks = nodeData.fs.data.map(disk => ({
        path: disk.path,
        total: disk.total_in_bytes,
        free: disk.free_in_bytes,
        used: disk.total_in_bytes - disk.free_in_bytes,
        available: disk.available_in_bytes,
        mount: disk.mount || disk.path,
        type: disk.type || 'unknown'
      }));
    }

    res.json({
      nodeId,
      disks
    });
  } catch (error) {
    console.error(`Error fetching disk info for node ${req.params.nodeId}:`, error);
    res.status(500).json({ error: "Failed to fetch disk information: " + error.message });
  }
});

// GET preferred disk path for a node
router.get("/preferred/:nodeId", verifyJwt, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const diskPreferences = getConfig('diskPreferences') || {};
    
    res.json({
      nodeId,
      preferred: diskPreferences[nodeId] || null
    });
  } catch (error) {
    console.error(`Error fetching preferred disk for node ${req.params.nodeId}:`, error);
    res.status(500).json({ error: "Failed to fetch preferred disk: " + error.message });
  }
});

// POST set preferred disk path for a node
router.post("/preferred", verifyJwt, async (req, res) => {
  try {
    const { nodeId, diskPath } = req.body;
    
    if (!nodeId || !diskPath) {
      return res.status(400).json({ error: "Node ID and disk path are required" });
    }

    // Get current disk preferences
    const currentPreferences = getConfig('diskPreferences') || {};
    
    // Update preferences
    const updatedPreferences = {
      ...currentPreferences,
      [nodeId]: diskPath
    };
    
    await setConfig('diskPreferences', updatedPreferences);

    res.json({
      message: "Preferred disk path updated successfully",
      nodeId,
      diskPath,
      preferences: updatedPreferences
    });
  } catch (error) {
    console.error("Error setting preferred disk:", error);
    res.status(500).json({ error: "Failed to set preferred disk: " + error.message });
  }
});

// GET all disk preferences
router.get("/preferences/all", verifyJwt, async (req, res) => {
  try {
    const diskPreferences = getConfig('diskPreferences') || {};
    
    res.json({
      preferences: diskPreferences
    });
  } catch (error) {
    console.error("Error fetching all disk preferences:", error);
    res.status(500).json({ error: "Failed to fetch disk preferences: " + error.message });
  }
});

module.exports = router;
