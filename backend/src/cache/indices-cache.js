const fs = require('fs').promises;
const path = require('path');
const { getSingleNodeClient } = require('../elasticsearch/client');
const clusterManager = require('../elasticsearch/cluster-manager');
const { getConfig } = require('../config');

const CACHE_FILE = path.join(__dirname, '..', '..', 'cache', 'indices-by-nodes.json');

let memoryCache = null;

async function getCache() {
  if (memoryCache) {
    return memoryCache;
  }
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    if (!data) { // Handle empty file
        return {};
    }
    memoryCache = JSON.parse(data);
    return memoryCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    // If parsing fails for other reasons, log it and return empty object
    console.error('Error reading or parsing cache file:', error);
    return {};
  }
}

async function setCache(data) {
  memoryCache = data;
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function refreshCacheForRunningNodes() {
    console.log('Refreshing cache for running nodes...');
    const currentCache = await getCache();
    
    let runningNodes;
    try {
        const allNodes = await clusterManager.listNodes();
        runningNodes = allNodes || [];
        console.log(`Found ${runningNodes.length} configured nodes, ${runningNodes.filter(n => n.isRunning).length} running`);
    } catch (error) {
        console.error('Could not get running nodes from Elasticsearch. Assuming all are offline.', error);
        runningNodes = [];
    }
    
    const newCache = {};

    // Process all nodes (both running and offline)
    for (const node of runningNodes) {
        const nodeName = node.name;
        const nodeUrl = `http://${node.host}:${node.port}`;
        
        if (node.isRunning) {
            // Node is online, fetch fresh data
            try {
                console.log(`Fetching indices stats for running node: ${nodeName} (${nodeUrl})`);
                const client = getSingleNodeClient(nodeUrl);
                
                if (!client) {
                    throw new Error(`Failed to get client for ${nodeUrl}`);
                }
                
                const response = await client.indices.stats({ index: '_all', metric: ['docs', 'store'] });
                
                if (!response) {
                    throw new Error(`No response received from Elasticsearch for node ${nodeName}`);
                }
                
                const indices = {};
                // Handle both response.body.indices and response.indices (newer clients return data directly)
                const statsData = response.body || response;
                
                if (statsData && statsData.indices) {
                    for (const [indexName, indexStats] of Object.entries(statsData.indices)) {
                        if (indexStats && indexStats.primaries && indexStats.primaries.docs && indexStats.primaries.store) {
                            indices[indexName] = {
                                doc_count: indexStats.primaries.docs.count || 0,
                                store_size: indexStats.primaries.store.size_in_bytes || 0,
                            };
                        }
                    }
                } else {
                    console.log(`No indices found in response for node ${nodeName}`);
                }

                newCache[nodeName] = {
                    status: 'online',
                    last_updated: new Date().toISOString(),
                    indices,
                    isRunning: true
                };
                
                console.log(`Cached ${Object.keys(indices).length} indices for node ${nodeName}`);
            } catch (error) {
                console.error(`Error fetching stats for online node ${nodeName}:`, error);
                // If we fail to fetch stats, treat it as offline but keep existing cache if available
                if (currentCache[nodeName]) {
                    newCache[nodeName] = { ...currentCache[nodeName], status: 'offline', isRunning: false };
                } else {
                    newCache[nodeName] = { status: 'offline', last_updated: new Date().toISOString(), indices: {}, isRunning: false };
                }
            }
        } else {
            // Node is offline, use cached data if it exists
            if (currentCache[nodeName]) {
                newCache[nodeName] = { ...currentCache[nodeName], status: 'offline', isRunning: false };
            } else {
                // First time seeing this node and it's offline
                newCache[nodeName] = { status: 'offline', last_updated: null, indices: {}, isRunning: false };
            }
        }
    }

    await setCache(newCache);
    console.log('Cache refresh complete.');
    return newCache;
}


async function getOrSetCache(nodeName = null) {
  const cache = await getCache();
  if (nodeName) {
    return cache[nodeName] || { status: 'offline', indices: {} };
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

async function syncSearchIndices(config) {
    // This function should sync the searchIndices configuration
    // For now, just return without doing anything specific
    console.log('syncSearchIndices called - no specific action needed');
    return true;
}

async function getCacheFiltered(config) {
    // Get cached indices data without triggering a refresh
    const cache = await getCache();
    
    // Convert the cache format to match what the validation code expects
    const processedCache = {};
    
    for (const [nodeName, nodeData] of Object.entries(cache)) {
        if (nodeData && nodeData.indices) {
            // Convert indices object to array format for validation
            const indicesArray = Array.isArray(nodeData.indices) 
                ? nodeData.indices 
                : Object.entries(nodeData.indices).map(([indexName, indexData]) => ({
                    index: indexName,
                    docCount: indexData.doc_count || 0,
                    storeSize: indexData.store_size || 0
                }));
            
            processedCache[nodeName] = {
                ...nodeData,
                indices: indicesArray
            };
        } else {
            processedCache[nodeName] = nodeData;
        }
    }
    
    return processedCache;
}

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
