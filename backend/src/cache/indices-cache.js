const fs = require('fs').promises;
const path = require('path');
const { getSingleNodeClient } = require('../elasticsearch/client');
const { getConfig } = require('../config');
const clusterManager = require('../elasticsearch/cluster-manager');

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
    // Reduced logging for regular refresh operations
    const currentCache = await getCache();

    let runningNodes;
    try {
        const allNodes = await clusterManager.listNodes();
        runningNodes = allNodes || [];
        // Only log if there are running nodes to avoid spam
        if (runningNodes.filter(n => n.isRunning).length > 0) {
            console.log(`Found ${runningNodes.length} configured nodes, ${runningNodes.filter(n => n.isRunning).length} running`);
        }
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
                // Reduced logging - only log on first fetch or errors
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

                // Only log if there are indices, to reduce spam
                if (Object.keys(indices).length > 0) {
                    console.log(`Cached ${Object.keys(indices).length} indices for node ${nodeName}`);
                }
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
    // Reduced logging - only log when there are changes
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
    // This function syncs the searchIndices configuration by removing any indices
    // that no longer exist across all nodes
    console.log('🔄 Syncing searchIndices configuration...');

    try {
        const { getConfig, setConfig } = require('../config');
        const currentSearchIndices = getConfig('searchIndices') || [];

        if (currentSearchIndices.length === 0) {
            console.log('ℹ️ No search indices configured, nothing to sync');
            return true;
        }

        // Get current cache to see what indices actually exist
        const cache = await getCache();
        const existingIndices = new Set();

        // Collect all existing indices from all nodes
        for (const [nodeName, nodeData] of Object.entries(cache)) {
            if (nodeData && nodeData.indices) {
                if (Array.isArray(nodeData.indices)) {
                    // New format: array of index objects
                    nodeData.indices.forEach(indexInfo => {
                        if (indexInfo.index) {
                            existingIndices.add(indexInfo.index);
                        }
                    });
                } else {
                    // Old format: object with index names as keys
                    Object.keys(nodeData.indices).forEach(indexName => {
                        existingIndices.add(indexName);
                    });
                }
            }
        }

        console.log(`📊 Found ${existingIndices.size} existing indices across all nodes`);
        console.log(`🔍 Current searchIndices configuration: [${currentSearchIndices.join(', ')}]`);

        // Filter out indices that no longer exist
        const validSearchIndices = currentSearchIndices.filter(indexName => {
            const exists = existingIndices.has(indexName);
            if (!exists) {
                console.log(`🗑️ Removing non-existent index '${indexName}' from searchIndices`);
            }
            return exists;
        });

        // Only update if there's a change
        if (validSearchIndices.length !== currentSearchIndices.length) {
            await setConfig('searchIndices', validSearchIndices);
            console.log(`✅ Updated searchIndices configuration: [${validSearchIndices.join(', ')}]`);
            console.log(`🧹 Removed ${currentSearchIndices.length - validSearchIndices.length} invalid indices from search configuration`);
        } else {
            console.log('✅ All searchIndices are valid, no sync needed');
        }

        return true;
    } catch (error) {
        console.error('❌ Error syncing searchIndices:', error);
        return false;
    }
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

// Ensure the cache file exists at startup
(async () => {
    try {
        await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
        await fs.access(CACHE_FILE);
    } catch (err) {
        // If file does not exist, create it as an empty object
        if (err.code === 'ENOENT') {
            await fs.writeFile(CACHE_FILE, '{}', 'utf8');
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
