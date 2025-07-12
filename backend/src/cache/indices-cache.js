const fs = require("fs").promises;
const path = require("path");
const { getSingleNodeClient } = require("../elasticsearch/client");
const { getConfig, setConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");
const { getClient } = require("../elasticsearch/client");
const { buildNodeMetadata } = require("../elasticsearch/node-metadata");
const { isPortOpen } = require("../elasticsearch/node-utils");

const CACHE_FILE = path.join(
  __dirname,
  "..",
  "..",
  "cache",
  "indices-by-nodes.json"
);

let memoryCache = null;

async function getCache() {
  if (memoryCache) {
    return memoryCache;
  }
  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    if (!data) {
      // Handle empty file
      return {};
    }
    memoryCache = JSON.parse(data);
    return memoryCache;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    // If parsing fails for other reasons, log it and return empty object
    console.error("Error reading or parsing cache file:", error);
    return {};
  }
}

async function setCache(data) {
  memoryCache = data;
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Refresh cache for running nodes. Accepts an optional node list to avoid redundant listNodes() calls.
 */
async function refreshClusterCache() {
  // Reduced logging for regular refresh operations
  const currentCache = await getCache();

  let runningNodes = [];
  try {
    const allNodes = await clusterManager.listNodes();
    runningNodes = allNodes || [];
    if (runningNodes.filter((n) => n.status === "running").length > 0) {
      console.log(
        `Found ${runningNodes.length} configured nodes, ${
          runningNodes.filter((n) => n.status === "running").length
        } running`
      );
    }
  } catch (error) {
    console.error(
      "Could not get running nodes from Elasticsearch. Assuming all are offline.",
      error
    );
    runningNodes = [];
  }

  const newCache = {};


  for (const node of runningNodes) {
    const nodeName = node.name;
    // Always build nodeUrl from host/port if available, else use node.nodeUrl, never default to 9200 unless truly no info
    let nodeUrl = null;
    if (node.host && node.port) {
      nodeUrl = `http://${node.host}:${node.port}`;
    } else if (node.nodeUrl) {
      nodeUrl = node.nodeUrl;
    } else {
      // Only fallback if no host/port or nodeUrl at all
      nodeUrl = `http://localhost:9200`;
    }

    // Check if dataPath or logsPath exists
    const { dataPath, logsPath } = node;
    let dataExists = true, logsExists = true;
    try {
      if (dataPath) {
        await fs.access(dataPath);
      }
    } catch {
      dataExists = false;
    }
    try {
      if (logsPath) {
        await fs.access(logsPath);
      }
    } catch {
      logsExists = false;
    }
    if (!dataExists || !logsExists) {
      console.warn(`[indices-cache] Node ${nodeName} missing dataPath or logsPath on disk. Removing from cache.`);
      continue; // Do not include this node in the new cache
    }

    // Use improved isNodeRunning (port + HTTP check)
    const nodeActuallyRunning = await clusterManager.isNodeRunning(nodeName);
    // Log which nodeUrl is being used for this node
    console.log(`[indices-cache] Using nodeUrl for ${nodeName}: ${nodeUrl}`);
    if (nodeActuallyRunning) {
      // Node is online, fetch fresh data
      try {
        const client = getSingleNodeClient(nodeUrl);
        if (!client) {
          throw new Error(`Failed to get client for ${nodeUrl}`);
        }
        // Fetch all indices stats
        const response = await client.indices.stats({
          index: "_all",
          metric: ["docs", "store"],
        });
        const statsData = response.body || response;
        // Fetch shard allocation for this node
        const shardsResponse = await client.cat.shards({
          format: "json",
        });
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
        } catch (e) {
          console.warn(`[indices-cache] Could not fetch index health for node ${nodeName}:`, e.message);
        }
        // Build a set of indices that have at least one shard on this node
        const indicesWithShards = new Set();
        for (const shard of shardsResponse) {
          if (shard.node === nodeName && shard.index) {
            indicesWithShards.add(shard.index);
          }
        }
        const indices = {};
        if (statsData && statsData.indices) {
          for (const [indexName, indexStats] of Object.entries(statsData.indices)) {
            if (indexStats && indexStats.primaries && indicesWithShards.has(indexName)) {
              indices[indexName] = {
                "doc.count": (indexStats.primaries.docs && indexStats.primaries.docs.count) || 0,
                "store.size": (indexStats.primaries.store && indexStats.primaries.store.size_in_bytes) || 0,
                health: healthByIndex[indexName] || "unknown",
              };
            }
          }
        } else {
          console.log(`No indices found in response for node ${nodeName}`);
        }
        newCache[nodeName] = {
          status: "running",
          last_updated: new Date().toISOString(),
          indices
        };
        if (Object.keys(indices).length > 0) {
          console.log(
            `Cached ${Object.keys(indices).length} indices for node ${nodeName}`
          );
        }
      } catch (error) {
        console.error(
          `Error fetching stats for online node ${nodeName}:`,
          error
        );
        if (currentCache[nodeName]) {
          newCache[nodeName] = {
            ...currentCache[nodeName],
            status: "stopped"
          };
        } else {
          newCache[nodeName] = {
            status: "stopped",
            last_updated: new Date().toISOString(),
            indices: {}
          };
        }
      }
    } else {
      // Node is not truly running, mark as stopped
      console.log(`Node ${nodeName} is not truly running (port or HTTP check failed).`);
      if (currentCache[nodeName]) {
        newCache[nodeName] = {
          ...currentCache[nodeName],
          status: "stopped"
        };
      } else {
        newCache[nodeName] = {
          status: "stopped",
          last_updated: new Date().toISOString(),
          indices: {}
        };
      }
    }
  }

  // Always write the new cache to disk after refreshing
  await setCache(newCache);
  // Clean up search indices if any nodes were removed
  await syncSearchIndices();
}

async function removeNodeFromCache(nodeName) {
  console.log(`Removing node ${nodeName} from cache.`);
  const cache = await getCache();
  if (cache[nodeName]) {
    delete cache[nodeName];
    await setCache(cache);
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
    const cache = await getCache();
    const existingNodeIndices = new Set();
    for (const [nodeName, nodeData] of Object.entries(cache)) {
      if (nodeData && nodeData.indices) {
        if (Array.isArray(nodeData.indices)) {
          nodeData.indices.forEach((indexInfo) => {
            if (indexInfo.index) {
              existingNodeIndices.add(`${nodeName}::${indexInfo.index}`);
            }
          });
        } else {
          Object.keys(nodeData.indices).forEach((indexName) => {
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

async function getCacheFiltered() {
  // Get cached indices data without triggering a refresh
  const cache = await getCache();
  const config = getConfig()

  // Convert the cache format to match what the validation code expects
  const processedCache = {};

  // Use canonical node metadata structure for all nodes
  const { buildNodeMetadata } = require("../elasticsearch/node-metadata");
  const nodeMetadata = (config && config.nodeMetadata) || {};

  for (const [nodeName, nodeData] of Object.entries(cache)) {
    // Get canonical metadata for this node
    const meta = buildNodeMetadata(nodeMetadata[nodeName] || { name: nodeName });
    if (nodeData && nodeData.indices) {
      // Convert indices object to array format for validation
      const indicesArray = Array.isArray(nodeData.indices)
        ? nodeData.indices
        : Object.entries(nodeData.indices).map(([indexName, indexData]) => ({
            index: indexName,
            "doc.count": indexData["doc.count"] || 0,
            "store.size": indexData["store.size"] || 0,
            health: indexData.health || "unknown",
          }));

      processedCache[nodeName] = {
        ...nodeData,
        indices: indicesArray,
        ...meta,
      };
    } else {
      processedCache[nodeName] = {
        ...nodeData,
        ...meta,
      };
    }
  }

  return processedCache;
}

// Ensure the cache file exists at startup
(async () => {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.access(CACHE_FILE);
  } catch (err) {
    // If file does not exist, create it as an empty object
    if (err.code === "ENOENT") {
      await fs.writeFile(CACHE_FILE, "{}", "utf8");
    }
  }
})();

// Get cached data for all nodes
async function getCachedData() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading cache file:", error);
    return {};
  }
}

// Get cached data for a specific node
async function getCachedNodeData(nodeName) {
  const cache = await getCachedData();
  return cache[nodeName] || null;
}

// Get cached indices for a specific node
async function getCachedNodeIndices(nodeName) {
  const nodeData = await getCachedNodeData(nodeName);
  return nodeData?.indices || [];
}

module.exports = {
  refreshClusterCache,
  syncSearchIndices,
  removeNodeFromCache,
  getCache,
  setCache,
  getCacheFiltered,
  getCachedData,
  getCachedNodeData,
  getCachedNodeIndices
};
