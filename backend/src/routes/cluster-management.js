const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");
const { refreshCacheAndSync } = require("../cache/indices-cache");

const router = express.Router();

// POST create new cluster
router.post("/create", verifyJwt, async (req, res) => {
  try {
    const { clusterName, nodes } = req.body;

    if (!clusterName || !nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({
        error: "Cluster name and at least one node configuration are required",
      });
    }

    // Initialize cluster manager
    await clusterManager.initialize();

    const createdNodes = [];
    const errors = [];

    // Create each node
    for (const nodeConfig of nodes) {
      try {
        const createdNode = await clusterManager.createNode({
          ...nodeConfig,
          clusterName,
        });
        createdNodes.push(createdNode);
      } catch (error) {
        errors.push({
          nodeName: nodeConfig.name,
          error: error.message,
        });
      }
    }

    // Update configuration with new nodes
    const nodeNames = createdNodes.map((node) => node.name);
    await setConfig("elasticsearchNodes", nodeNames);

    if (nodeNames.length > 0) {
      await setConfig("writeNode", nodeNames[0]); // Set first node as write node
    }

    // Store node metadata using canonical builder
    const nodeMetadata = {};
    createdNodes.forEach((node) => {
      nodeMetadata[node.name] = clusterManager.buildNodeMetadata(node);
    });
    await setConfig("nodeMetadata", nodeMetadata);

    // Refresh persistent indices cache after cluster creation
    try {
      await refreshCacheAndSync(
        `creating cluster ${clusterName} with ${createdNodes.length} nodes`
      );
    } catch (cacheError) {
      console.warn(
        `⚠️ Failed to refresh persistent indices cache after creating cluster:`,
        cacheError.message
      );
    }

    res.json({
      message: `Cluster "${clusterName}" created successfully`,
      clusterName,
      createdNodes: createdNodes.length,
      nodes: createdNodes,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error creating cluster:", error);
    res
      .status(500)
      .json({ error: "Failed to create cluster: " + error.message });
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
      return res.json({
        message: "No changes needed",
        cluster: { name },
      });
    }

    // Update cluster name for all nodes in this cluster
    const nodeMetadata = getConfig("nodeMetadata") || {};
    let updatedCount = 0;
    const fs = require("fs").promises;
    
    for (const [nodeName, metadata] of Object.entries(nodeMetadata)) {
      const clusterName = metadata.cluster || "trustquery-cluster";
      if (clusterName === name) {
        nodeMetadata[nodeName] = {
          ...metadata,
          cluster: newName,
        };
        updatedCount++;
        
        // Update the node's config file if it exists
        if (metadata.configPath) {
          try {
            let configContent = await fs.readFile(metadata.configPath, "utf8");
            if (/^cluster\.name\s*[:=]/m.test(configContent)) {
              configContent = configContent.replace(
                /^cluster\.name\s*[:=].*$/m,
                `cluster.name: ${newName}`
              );
            } else {
              configContent = `cluster.name: ${newName}\n` + configContent;
            }
            await fs.writeFile(metadata.configPath, configContent, "utf8");
          } catch (e) {
            console.warn(
              `Failed to update config file for node ${metadata.name}:`,
              e.message
            );
          }
        }
      }
    }
    await setConfig("nodeMetadata", nodeMetadata);

    // Update clusterList in config
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
      cluster: {
        name: newName,
        previousName: name,
        nodesUpdated: updatedCount,
      },
    });
  } catch (error) {
    console.error(`Error updating cluster ${req.params.name}:`, error);
    res
      .status(500)
      .json({ error: "Failed to update cluster: " + error.message });
  }
});

// DELETE cluster
router.delete("/clusters/:name", verifyJwt, async (req, res) => {
  try {
    const { name } = req.params;
    const { targetCluster } = req.body;

    // Don't allow deleting the default cluster
    if (name === "trustquery-cluster") {
      return res.status(400).json({
        error: "Cannot delete the default cluster",
        reason: "default_cluster",
      });
    }

    // Check if there are nodes in this cluster
    const nodeMetadata = getConfig("nodeMetadata") || {};
    const nodesInCluster = Object.values(nodeMetadata).filter(
      (m) => (m.cluster || "trustquery-cluster") === name
    );

    let clusterList = getConfig("clusterList") || [];
    let changed = false;

    if (nodesInCluster.length > 0) {
      if (targetCluster) {
        // Move all nodes to the target cluster
        for (const [url, metadata] of Object.entries(nodeMetadata)) {
          if ((metadata.cluster || "trustquery-cluster") === name) {
            nodeMetadata[url] = {
              ...metadata,
              cluster: targetCluster,
            };
            changed = true;

            // Update the node's config file if it exists
            if (metadata.configPath) {
              try {
                let configContent = await fs.readFile(metadata.configPath, "utf8");
                if (/^cluster\.name\s*[:=]/m.test(configContent)) {
                  configContent = configContent.replace(
                    /^cluster\.name\s*[:=].*$/m,
                    `cluster.name: ${targetCluster}`
                  );
                } else {
                  configContent = `cluster.name: ${targetCluster}\n` + configContent;
                }
                await fs.writeFile(metadata.configPath, configContent, "utf8");
              } catch (e) {
                console.warn(
                  `Failed to update config file for node ${metadata.name}:`,
                  e.message
                );
              }
            }
          }
        }
        if (changed) await setConfig("nodeMetadata", nodeMetadata);
        
        // Remove the deleted cluster from clusterList
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
      // No nodes in this cluster, safe to delete
      clusterList = clusterList.filter((c) => c !== name);
      if (!clusterList.includes("trustquery-cluster")) {
        clusterList.push("trustquery-cluster");
      }
      await setConfig("clusterList", clusterList);
      
      res.json({
        message: `Cluster "${name}" deleted successfully.`,
      });
    }
  } catch (error) {
    console.error(`Error deleting cluster ${req.params.name}:`, error);
    res
      .status(500)
      .json({ error: "Failed to delete cluster: " + error.message });
  }
});

module.exports = router; 