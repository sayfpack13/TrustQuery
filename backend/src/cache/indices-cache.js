
// Get indices for all nodes from config.nodeMetadata
async function getCacheFiltered() {
  const { getConfig } = require("../config");
  const config = getConfig();
  const nodeMetadata = config.nodeMetadata || {};
  const processedCache = {};
  for (const [nodeName, meta] of Object.entries(nodeMetadata)) {
    // Indices are now stored directly in nodeMetadata[nodeName].indices
    const indicesArray = Array.isArray(meta.indices)
      ? meta.indices
      : Object.entries(meta.indices || {}).map(([indexName, indexData]) => ({
          index: indexName,
          "doc.count": indexData["doc.count"] || 0,
          "store.size": indexData["store.size"] || 0,
          health: indexData.health || "unknown",
        }));
    processedCache[nodeName] = {
      ...meta,
      indices: indicesArray,
    };
  }
  return processedCache;
}

// Refresh indices for all nodes and update nodeMetadata in config.json
async function refreshClusterCache() {
  const { getConfig, setConfig } = require("../config");
  const { getSingleNodeClient } = require("../elasticsearch/client");
  const nodeMetadata = getConfig("nodeMetadata") || {};
  for (const [nodeName, meta] of Object.entries(nodeMetadata)) {
    // Use isNodeRunning utility for robust liveness check (fast port check only)
    const { isNodeRunning } = require("../elasticsearch/node-utils");
    let nodeActuallyRunning = false;
    try {
      nodeActuallyRunning = await isNodeRunning(nodeName); // default is fast TCP port check
    } catch (e) {
      nodeActuallyRunning = false;
    }
    if (nodeActuallyRunning) {
      try {
        const client = getSingleNodeClient(meta.nodeUrl || `http://${meta.host}:${meta.port}`);
        // Fetch all indices stats
        const response = await client.indices.stats({
          index: "_all",
          metric: ["docs", "store"],
        });
        const statsData = response.body || response;
        // Fetch index health for all indices on this node
        let healthByIndex = {};
        try {
          const catIndices = await client.cat.indices({
          format: "json",
            h: "index,health",
          });
          for (const idx of catIndices) {
            if (idx.index && idx.health) {
              healthByIndex[idx.index] = idx.health;
            }
          }
        } catch (e) {}
        // Build indices array
        const indices = [];
        if (statsData.indices) {
          for (const [indexName, indexStats] of Object.entries(statsData.indices)) {
            indices.push({
              index: indexName,
              "doc.count": indexStats.total?.docs?.count || 0,
              "store.size": indexStats.total?.store?.size_in_bytes || 0,
              health: healthByIndex[indexName] || "unknown",
            });
          }
        }
        meta.indices = indices;
        meta.status = "running";
      } catch (e) {
        meta.status = "stopped";
        meta.indices = meta.indices || [];
      }
    } else {
      meta.status = "stopped";
      meta.indices = meta.indices || [];
    }
  }
  await setConfig("nodeMetadata", nodeMetadata);
  }

// Remove node from nodeMetadata (for node deletion)
async function removeNodeFromCache(nodeName) {
  const { getConfig, setConfig } = require("../config");
  const nodeMetadata = getConfig("nodeMetadata") || {};
  if (nodeMetadata[nodeName]) {
    delete nodeMetadata[nodeName];
    await setConfig("nodeMetadata", nodeMetadata);
  }
}

async function syncSearchIndices() {
  // Only log when there are changes or errors
  try {
    const { getConfig, setConfig } = require("../config");
    const currentSearchIndices = getConfig("searchIndices") || [];
    if (currentSearchIndices.length === 0) {
      // No log needed for no indices
      return true;
    }
    const config = getConfig();
    const existingNodeIndices = new Set();
    for (const [nodeName, meta] of Object.entries(config.nodeMetadata)) {
      if (meta.indices) {
        if (Array.isArray(meta.indices)) {
          meta.indices.forEach((indexInfo) => {
            if (indexInfo.index) {
              existingNodeIndices.add(`${nodeName}::${indexInfo.index}`);
            }
          });
        } else {
          Object.keys(meta.indices).forEach((indexName) => {
            existingNodeIndices.add(`${nodeName}::${indexName}`);
          });
        }
      }
    }
    // Only log if there are changes
    const validSearchIndices = currentSearchIndices.filter((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        "node" in entry &&
        "index" in entry
      ) {
        const key = `${entry.node}::${entry.index}`;
        return existingNodeIndices.has(key);
      } else {
        return false;
      }
    });
    if (validSearchIndices.length !== currentSearchIndices.length) {
      await setConfig("searchIndices", validSearchIndices);
      console.log(
        "✅ Updated searchIndices configuration:",
        JSON.stringify(validSearchIndices, null, 2)
      );
      console.log(
        `🧹 Removed ${
          currentSearchIndices.length - validSearchIndices.length
        } invalid indices from search configuration`
      );
    }
    return true;
  } catch (error) {
    console.error("❌ Error syncing searchIndices:", error);
    return false;
  }
}

module.exports = {
  getCacheFiltered,
  refreshClusterCache,
  removeNodeFromCache,
  syncSearchIndices,
};
