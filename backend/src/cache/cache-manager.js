const { getConfig } = require("../config");
const { Client } = require("@elastic/elasticsearch");

// Create a client for a specific node
function createNodeClient(nodeUrl) {
  return new Client({
    node: nodeUrl,
    requestTimeout: 3000,
    maxRetries: 1,
    sniffOnStart: false,
    sniffOnConnectionFault: false,
  });
}

// Refresh cache and handle errors
async function refreshCache() {
  try {
    // Implement cache refresh directly here instead of importing from indices-cache
    const nodeMetadata = getConfig("nodeMetadata") || {};
    const newCache = {};

    for (const [nodeName, metadata] of Object.entries(nodeMetadata)) {
      if (!metadata || !metadata.nodeUrl) continue;

      try {
        const client = createNodeClient(metadata.nodeUrl);
        const response = await client.indices.stats({
          index: "_all",
          metric: ["docs", "store"],
        });

        const indices = [];
        const statsData = response.body || response;

        if (statsData && statsData.indices) {
          for (const [indexName, indexStats] of Object.entries(statsData.indices)) {
            if (indexStats?.primaries?.docs && indexStats?.primaries?.store) {
              indices.push({
                index: indexName,
                "doc.count": indexStats.primaries.docs.count || 0,
                "store.size": indexStats.primaries.store.size_in_bytes || 0,
              });
            }
          }
        }

        newCache[nodeName] = {
          nodeUrl: metadata.nodeUrl,
          status: "online",
          last_updated: new Date().toISOString(),
          indices,
          isRunning: true,
        };

      } catch (error) {
        console.error(`Error fetching stats for node ${nodeName}:`, error.message);
        newCache[nodeName] = {
          nodeUrl: metadata.nodeUrl,
          status: "offline",
          last_updated: new Date().toISOString(),
          indices: [],
          isRunning: false,
        };
      }
    }

    // Write to cache file
    const fs = require("fs").promises;
    const path = require("path");
    const CACHE_FILE = path.join(__dirname, "..", "..", "cache", "indices-by-nodes.json");
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(newCache, null, 2), "utf8");

    return newCache;
  } catch (error) {
    console.error("Error refreshing cache:", error);
    throw error;
  }
}

// Trigger cache refresh after node operations
async function refreshAfterOperation(nodeName, operation) {
  try {
    console.log(`Refreshing cache after ${operation} operation on node ${nodeName}`);
    await refreshCache();
  } catch (error) {
    console.error(`Error refreshing cache after ${operation} operation on node ${nodeName}:`, error);
  }
}

module.exports = {
  refreshAfterOperation,
  refreshCache,
}; 