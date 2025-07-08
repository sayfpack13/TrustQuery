const fs = require("fs").promises;
const path = require("path");
const { getSingleNodeClient } = require("../elasticsearch/client");
const { getConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");

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
 * @param {Array} nodes Optional array of node objects (with isRunning, host, port, etc)
 */
async function refreshCacheForRunningNodes(nodes) {
  // Reduced logging for regular refresh operations
  const currentCache = await getCache();

  let runningNodes;
  if (Array.isArray(nodes)) {
    runningNodes = nodes;
  } else {
    try {
      const allNodes = await clusterManager.listNodes();
      runningNodes = allNodes || [];
      // Only log if there are running nodes to avoid spam
      if (runningNodes.filter((n) => n.isRunning).length > 0) {
        console.log(
          `Found ${runningNodes.length} configured nodes, ${
            runningNodes.filter((n) => n.isRunning).length
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
  }

  const newCache = {};

  // Process all nodes (both running and offline)
  for (const node of runningNodes) {
    const nodeName = node.name;
    const nodeUrl = `http://${node.host}:${node.port}`;

    if (node.isRunning) {
      // Node is online, fetch fresh data
      try {
        // Reduced logging - only log on first fetch or errors
        const client = getSingleNodeClient(nodeUrl);

        if (!client) {
          throw new Error(`Failed to get client for ${nodeUrl}`);
        }

        const response = await client.indices.stats({
          index: "_all",
          metric: ["docs", "store"],
        });

        if (!response) {
          throw new Error(
            `No response received from Elasticsearch for node ${nodeName}`
          );
        }

        const indices = {};
        // Handle both response.body.indices and response.indices (newer clients return data directly)
        const statsData = response.body || response;

        if (statsData && statsData.indices) {
          for (const [indexName, indexStats] of Object.entries(
            statsData.indices
          )) {
            if (
              indexStats &&
              indexStats.primaries &&
              indexStats.primaries.docs &&
              indexStats.primaries.store
            ) {
              indices[indexName] = {
                "doc.count": indexStats.primaries.docs.count || 0,
                "store.size": indexStats.primaries.store.size_in_bytes || 0,
              };
            }
          }
        } else {
          console.log(`No indices found in response for node ${nodeName}`);
        }

        newCache[nodeName] = {
          status: "online",
          last_updated: new Date().toISOString(),
          indices,
          isRunning: true,
        };

        // Only log if there are indices, to reduce spam
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
        // If we fail to fetch stats, treat it as offline but keep existing cache if available
        if (currentCache[nodeName]) {
          newCache[nodeName] = {
            ...currentCache[nodeName],
            status: "offline",
            isRunning: false,
          };
        } else {
          newCache[nodeName] = {
            status: "offline",
            last_updated: new Date().toISOString(),
            indices: {},
            isRunning: false,
          };
        }
      }
    } else {
      // Node is offline, use cached data if it exists
      if (currentCache[nodeName]) {
        newCache[nodeName] = {
          ...currentCache[nodeName],
          status: "offline",
          isRunning: false,
        };
      } else {
        // First time seeing this node and it's offline
        newCache[nodeName] = {
          status: "offline",
          last_updated: null,
          indices: {},
          isRunning: false,
        };
      }
    }
  }

  await setCache(newCache);
  // Reduced logging - only log when there are changes
  return newCache;
}

async function getOrSetCache(nodeName = null) {
  const cache = await getCache();
  if (nodeName) {
    return cache[nodeName] || { status: "offline", indices: {} };
  }
  return cache;
}

async function removeNodeFromCache(nodeName) {
  console.log(`Removing node ${nodeName} from cache.`);
  const cache = await getCache();
  if (cache[nodeName]) {
    delete cache[nodeName];
    await setCache(cache);
  }
}

async function refreshCache() {
  // Legacy function - just redirect to the new smart refresh
  return await refreshCacheForRunningNodes();
}

async function syncSearchIndices() {
  // This function syncs the searchIndices configuration by removing any indices
  // that no longer exist across all nodes
  console.log("🔄 Syncing searchIndices configuration...");

  try {
    const { getConfig, setConfig } = require("../config");
    const currentSearchIndices = getConfig("searchIndices") || [];

    if (currentSearchIndices.length === 0) {
      console.log("ℹ️ No search indices configured, nothing to sync");
      return true;
    }

    // Get current cache to see what indices actually exist
    const cache = await getCache();
    // Build a set of valid node+index pairs
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

    console.log(
      `📊 Found ${existingNodeIndices.size} existing node+index pairs across all nodes`
    );


    // Filter out indices that no longer exist (expecting { node, index } objects)
    const validSearchIndices = currentSearchIndices.filter((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        "node" in entry &&
        "index" in entry
      ) {
        const key = `${entry.node}::${entry.index}`;
        const exists = existingNodeIndices.has(key);
        if (!exists) {
          console.log(
            `🗑️ Removing non-existent index '${entry.index}' on node '${entry.node}' from searchIndices`
          );
        }
        return exists;
      } else {
        console.log(`🗑️ Removing invalid searchIndices entry:`, entry);
        return false;
      }
    });

    // Only update if there's a change
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
    } else {
      console.log("✅ All searchIndices are valid, no sync needed");
    }

    return true;
  } catch (error) {
    console.error("❌ Error syncing searchIndices:", error);
    return false;
  }
}

async function getCacheFiltered(config) {
  // Get cached indices data without triggering a refresh
  const cache = await getCache();

  // Convert the cache format to match what the validation code expects
  const processedCache = {};
  // Get nodeMetadata from config for nodeUrl injection
  const nodeMetadata = (config && config.nodeMetadata) || {};

  for (const [nodeName, nodeData] of Object.entries(cache)) {
    // Get nodeUrl and other metadata from config
    const meta = nodeMetadata[nodeName] || {};
    if (nodeData && nodeData.indices) {
      // Convert indices object to array format for validation
      const indicesArray = Array.isArray(nodeData.indices)
        ? nodeData.indices
        : Object.entries(nodeData.indices).map(([indexName, indexData]) => ({
            index: indexName,
            "doc.count": indexData["doc.count"] || 0,
            "store.size": indexData["store.size"] || 0,
          }));

      processedCache[nodeName] = {
        ...nodeData,
        indices: indicesArray,
        nodeUrl: meta.nodeUrl,
        host: meta.host,
        port: meta.port,
        transportPort: meta.transportPort,
        cluster: meta.cluster,
        roles: meta.roles,
      };
    } else {
      processedCache[nodeName] = {
        ...nodeData,
        nodeUrl: meta.nodeUrl,
        host: meta.host,
        port: meta.port,
        transportPort: meta.transportPort,
        cluster: meta.cluster,
        roles: meta.roles,
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

module.exports = {
  getOrSetCache,
  refreshCache,
  refreshCacheForRunningNodes,
  syncSearchIndices,
  removeNodeFromCache,
  getCache,
  setCache,
  getCacheFiltered,
};
