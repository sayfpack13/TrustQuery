const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const router = express.Router();

// POST create cluster
router.post("/clusters", verifyJwt, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    let clusterList = getConfig("clusterList") || [];
    if (!clusterList.includes("trustquery-cluster")) {
      clusterList.push("trustquery-cluster");
    }
    if (!clusterList.includes(name)) {
      clusterList.push(name);
      await setConfig("clusterList", clusterList);
    }
    res.json({
      message: `Cluster "${name}" created successfully`,
      cluster: { name },
    });
  } catch (error) {
    console.error("Error creating cluster:", error);
    res.status(500).json({ error: "Failed to create cluster: " + error.message });
  }
});

// GET all clusters
router.get("/clusters", verifyJwt, async (req, res) => {
  try {
    const nodeMetadata = getConfig("nodeMetadata") || {};
    let clusterList = getConfig("clusterList") || [];
    if (!clusterList.includes("trustquery-cluster")) {
      clusterList.push("trustquery-cluster");
    }
    const clusters = clusterList.map((name) => ({
      name,
      nodeCount: Object.values(nodeMetadata).filter((m) => (m.cluster || "trustquery-cluster") === name).length,
    }));
    res.json({ clusters });
  } catch (error) {
    console.error("Error fetching clusters:", error);
    res.status(500).json({ error: "Failed to fetch clusters: " + error.message });
  }
});

// PUT update cluster
router.put("/clusters/:name", verifyJwt, async (req, res) => {
  try {
    const { name } = req.params;
    const { newName } = req.body;
    if (!newName) {
      return res.status(400).json({ error: "New cluster name is required" });
    }
    if (name === newName) {
      return res.json({ message: "No changes needed", cluster: { name } });
    }
    const nodeMetadata = getConfig("nodeMetadata") || {};
    let updatedCount = 0;
    const fs = require("fs").promises;
    for (const [nodeName, metadata] of Object.entries(nodeMetadata)) {
      const clusterName = metadata.cluster || "trustquery-cluster";
      if (clusterName === name) {
        nodeMetadata[nodeName] = { ...metadata, cluster: newName };
        updatedCount++;
        if (metadata.configPath) {
          try {
            let configContent = await fs.readFile(metadata.configPath, "utf8");
            if (/^cluster\.name\s*[:=]/m.test(configContent)) {
              configContent = configContent.replace(/^cluster\.name\s*[:=].*$/m, `cluster.name: ${newName}`);
            } else {
              configContent = `cluster.name: ${newName}\n` + configContent;
            }
            await fs.writeFile(metadata.configPath, configContent, "utf8");
          } catch (e) {
            console.warn(`Failed to update config file for node ${metadata.name}:`, e.message);
          }
        }
      }
    }
    await setConfig("nodeMetadata", nodeMetadata);
    let clusterList = getConfig("clusterList") || [];
    clusterList = clusterList.filter((c) => c !== name);
    if (!clusterList.includes(newName)) {
      clusterList.push(newName);
    }
    if (!clusterList.includes("trustquery-cluster")) {
      clusterList.push("trustquery-cluster");
    }
    await setConfig("clusterList", clusterList);
    res.json({
      message: `Cluster "${name}" renamed to "${newName}" successfully. Updated ${updatedCount} nodes and cluster list.`,
      cluster: { name: newName, previousName: name, nodesUpdated: updatedCount },
    });
  } catch (error) {
    console.error(`Error updating cluster ${req.params.name}:`, error);
    res.status(500).json({ error: "Failed to update cluster: " + error.message });
  }
});

// DELETE cluster
router.delete("/clusters/:name", verifyJwt, async (req, res) => {
  try {
    const { name } = req.params;
    const { targetCluster } = req.body;
    if (name === "trustquery-cluster") {
      return res.status(400).json({ error: "Cannot delete the default cluster", reason: "default_cluster" });
    }
    const nodeMetadata = getConfig("nodeMetadata") || {};
    const nodesInCluster = Object.values(nodeMetadata).filter((m) => (m.cluster || "trustquery-cluster") === name);
    let clusterList = getConfig("clusterList") || [];
    let changed = false;
    if (nodesInCluster.length > 0) {
      if (targetCluster) {
        for (const [url, metadata] of Object.entries(nodeMetadata)) {
          if ((metadata.cluster || "trustquery-cluster") === name) {
            nodeMetadata[url] = { ...metadata, cluster: targetCluster };
            changed = true;
            if (metadata.configPath) {
              try {
                const fs = require("fs").promises;
                let configContent = await fs.readFile(metadata.configPath, "utf8");
                if (/^cluster\.name\s*[:=]/m.test(configContent)) {
                  configContent = configContent.replace(/^cluster\.name\s*[:=].*$/m, `cluster.name: ${targetCluster}`);
                } else {
                  configContent = `cluster.name: ${targetCluster}\n` + configContent;
                }
                await fs.writeFile(metadata.configPath, configContent, "utf8");
              } catch (e) {
                console.warn(`Failed to update config file for node ${metadata.name}:`, e.message);
              }
            }
          }
        }
        if (changed) await setConfig("nodeMetadata", nodeMetadata);
        clusterList = clusterList.filter((c) => c !== name);
        if (!clusterList.includes("trustquery-cluster")) {
          clusterList.push("trustquery-cluster");
        }
        await setConfig("clusterList", clusterList);
        res.json({
          message: `Cluster "${name}" deleted successfully. ${nodesInCluster.length} nodes moved to cluster "${targetCluster}".`,
          nodesMovedCount: nodesInCluster.length,
          targetCluster,
        });
      } else {
        return res.status(409).json({
          error: `Cannot delete cluster "${name}" because it contains ${nodesInCluster.length} nodes. Specify a target cluster to move these nodes.`,
          reason: "cluster_not_empty",
          nodesCount: nodesInCluster.length,
        });
      }
    } else {
      clusterList = clusterList.filter((c) => c !== name);
      if (!clusterList.includes("trustquery-cluster")) {
        clusterList.push("trustquery-cluster");
      }
      await setConfig("clusterList", clusterList);
      res.json({ message: `Cluster "${name}" deleted successfully.` });
    }
  } catch (error) {
    console.error(`Error deleting cluster ${req.params.name}:`, error);
    res.status(500).json({ error: "Failed to delete cluster: " + error.message });
  }
});

module.exports = router;
