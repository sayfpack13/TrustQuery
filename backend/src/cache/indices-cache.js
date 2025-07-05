const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

// Path to persistent cache file
const CACHE_FILE = path.join(__dirname, '../../cache/indices-by-nodes.json');

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const timeout = options.timeout || 10000;
    
    const req = client.request(url, {
      method: 'GET',
      timeout: timeout,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, text: () => data, json: () => JSON.parse(data) });
        } else {
          resolve({ ok: false, status: res.statusCode, text: () => data });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Load cache from disk or initialize
async function loadCacheFile() {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return { indicesByNodes: {}, timestamp: 0 };
  }
}

// Save cache to disk
async function saveCacheFile(data) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
}

// Get cache data (filtered by current configuration)
async function getCache() {
  const data = await loadCacheFile();
  return data.indicesByNodes;
}

// Get cache data filtered by current node configuration
async function getCacheFiltered(config) {
  const data = await loadCacheFile();
  const { elasticsearchNodes: nodes = [], nodeMetadata = {} } = config;
  
  // Create a set of current node names for filtering
  const currentNodeNames = new Set();
  for (const nodeUrl of nodes) {
    const info = nodeMetadata[nodeUrl] || { name: nodeUrl, host: nodeUrl };
    currentNodeNames.add(info.name);
  }
  
  // Filter cached data to only include nodes that still exist in configuration
  const filteredIndicesByNodes = {};
  for (const [nodeName, nodeData] of Object.entries(data.indicesByNodes)) {
    if (currentNodeNames.has(nodeName)) {
      filteredIndicesByNodes[nodeName] = nodeData;
    }
  }
  
  return filteredIndicesByNodes;
}

// Get cache status
async function getCacheStatus() {
  const data = await loadCacheFile();
  return { isPersistent: true, timestamp: data.timestamp };
}

// Clear cache
async function clearCache() {
  return saveCacheFile({ indicesByNodes: {}, timestamp: 0 });
}

// Refresh cache by fetching live indices from nodes
async function refreshCache(config) {
  const { elasticsearchNodes: nodes = [], nodeMetadata = {} } = config;
  const indicesByNodes = {};
  
  // Only include nodes that are still in the current configuration
  for (const nodeUrl of nodes) {
    const info = nodeMetadata[nodeUrl] || { name: nodeUrl, host: nodeUrl };
    const nodeName = info.name;
    try {
      // Health check
      const healthRes = await makeRequest(`${nodeUrl}/_cluster/health`, { timeout: 5000 });
      if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
      
      // Fetch indices
      const idxRes = await makeRequest(
        `${nodeUrl}/_cat/indices?format=json&h=index,health,status,docs.count,store.size,uuid`,
        { timeout: 10000 }
      );
      let list = [];
      if (idxRes.ok) {
        const responseText = await idxRes.text();
        list = responseText ? JSON.parse(responseText) : [];
      }
      indicesByNodes[nodeName] = {
        nodeUrl,
        isRunning: true,
        indices: list.map(idx => ({ ...idx, node: nodeName, nodeUrl })),
        error: null
      };
    } catch (err) {
      indicesByNodes[nodeName] = { nodeUrl, isRunning: false, indices: [], error: err.message };
    }
  }
  
  const timestamp = Date.now();
  // This will overwrite the cache with only the current nodes, effectively removing deleted nodes
  await saveCacheFile({ indicesByNodes, timestamp });
  console.log(`🔄 Persistent cache updated with ${Object.keys(indicesByNodes).length} nodes`);
  return indicesByNodes;
}

// Sync searchIndices in config.json with available indices from cache
async function syncSearchIndices(config) {
  try {
    const { getConfig, setConfig } = require('../config');
    const indicesByNodes = await getCacheFiltered(config);
    
    // Collect all available indices from all nodes
    const availableIndices = new Set();
    for (const [nodeName, nodeData] of Object.entries(indicesByNodes)) {
      if (nodeData.indices && Array.isArray(nodeData.indices)) {
        nodeData.indices.forEach(index => {
          if (index.index) {
            availableIndices.add(index.index);
          }
        });
      }
    }
    
    // Get current searchIndices from config
    const currentSearchIndices = getConfig('searchIndices') || [];
    
    // Filter out indices that no longer exist
    const validSearchIndices = currentSearchIndices.filter(indexName => 
      availableIndices.has(indexName)
    );
    
    // Only update if there's a change
    if (validSearchIndices.length !== currentSearchIndices.length || 
        !validSearchIndices.every(idx => currentSearchIndices.includes(idx))) {
      
      await setConfig('searchIndices', validSearchIndices);
      console.log(`🔄 Synchronized searchIndices: removed ${currentSearchIndices.length - validSearchIndices.length} stale indices`);
      
      if (validSearchIndices.length === 0 && availableIndices.size > 0) {
        console.log(`ℹ️  Available indices: ${Array.from(availableIndices).join(', ')}`);
      }
    }
    
    return validSearchIndices;
  } catch (error) {
    console.warn('⚠️ Failed to sync searchIndices:', error.message);
    return [];
  }
}

module.exports = { getCache, getCacheFiltered, getCacheStatus, clearCache, refreshCache, syncSearchIndices };
