// Elasticsearch client management
const fs = require("fs").promises;
const path = require("path");
const { Client } = require("@elastic/elasticsearch");
const { getConfig } = require("../config");
const { getEnvAndConfig } = require("./node-config");
const { buildNodeMetadata } = require("./node-metadata");

let es;
let esWrite;
let writeClient;
let esAvailable = false;
const singleNodeClients = {}; // Cache for single-node clients

function initializeElasticsearchClients() {
  // Always resolve node names to URLs for all client initializations
  const nodeNames = getConfig("elasticsearchNodes");
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const nodeUrls = (nodeNames || [])
    .map((name) => buildNodeMetadata(nodeMetadata[name] || { name })?.nodeUrl)
    .filter(Boolean);
  if (nodeUrls.length > 0) {
    es = new Client({ nodes: nodeUrls });
  } else {
    // Fall back to default configuration
    const { DEFAULT_CONFIG } = require("../config");
    const defaultNodes = DEFAULT_CONFIG.elasticsearchNodes;
    es = new Client({ nodes: defaultNodes });
  }

  const writeNode = getConfig("writeNode");
  if (writeNode) {
    esWrite = new Client({ node: writeNode });
  } else {
    // Fall back to default write node or use main client
    const { DEFAULT_CONFIG } = require("../config");
    const defaultWriteNode = DEFAULT_CONFIG.writeNode;
    if (defaultWriteNode) {
      esWrite = new Client({ node: defaultWriteNode });
    } else {
      esWrite = es;
    }
  }
  // Write client - connects to specific write node
  const writeNodeName = getConfig("writeNode");
  const writeNodeMetadata = buildNodeMetadata(nodeMetadata?.[writeNodeName] || { name: writeNodeName });
  if (writeNodeMetadata && writeNodeMetadata.nodeUrl) {
    esWrite = new Client({ node: writeNodeMetadata.nodeUrl });
  } else {
    // Fall back to default write node or use main client
    const { DEFAULT_CONFIG } = require("../config");
    const defaultWriteNode = DEFAULT_CONFIG.writeNode;
    if (defaultWriteNode) {
      esWrite = new Client({ node: defaultWriteNode });
    } else {
      esWrite = es;
    }
  }

  esAvailable = true;
}

function getSingleNodeClient(nodeOrUrl) {
  // Always resolve to a full URL from metadata if a node name is passed
  const nodeMetadata = getConfig("nodeMetadata") || {};
  let url = null;
  if (nodeOrUrl.startsWith("http://") || nodeOrUrl.startsWith("https://")) {
    url = nodeOrUrl;
  } else if (nodeMetadata[nodeOrUrl]) {
    // Build from metadata
    const meta = nodeMetadata[nodeOrUrl];
    if (meta.host && meta.port) {
      url = `http://${meta.host}:${meta.port}`;
    } else if (meta.nodeUrl) {
      url = meta.nodeUrl;
    } else {
      url = `http://localhost:9200`;
    }
  } else {
    // Try to build from node name as fallback
    url = `http://localhost:9200`;
  }
  // Log the resolved URL and node name
  console.log(`[getSingleNodeClient] Creating client for node '${nodeOrUrl}' resolved to URL: ${url}`);
  if (singleNodeClients[url]) {
    return singleNodeClients[url];
  }
  const client = new Client({
    node: url,
    requestTimeout: 30000,
    sniffOnStart: false,
    sniffOnConnectionFault: false,
  });
  singleNodeClients[url] = client;
  return client;
}

// Helper function to check if Elasticsearch is available
async function isElasticsearchAvailable() {
  try {
    if (!es) return false;
    await es.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Use shared formatBytes utility
const { formatBytes } = require("../utils/format");

// Helper function to create proper index mapping
function createIndexMapping(shards = 1, replicas = 0) {
  return {
    settings: {
      number_of_shards: shards,
      number_of_replicas: replicas,
      analysis: {
        analyzer: {
          autocomplete_analyzer: {
            tokenizer: "autocomplete_tokenizer",
            filter: ["lowercase"],
          },
          lowercase_analyzer: {
            tokenizer: "standard",
            filter: ["lowercase"],
          },
          ngram_analyzer: {
            tokenizer: "ngram_tokenizer",
            filter: ["lowercase"],
          },
        },
        tokenizer: {
          autocomplete_tokenizer: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 10,
          },
          ngram_tokenizer: {
            type: "ngram",
            min_gram: 3,
            max_gram: 15,
          },
        },
      },
    },
    mappings: {
      properties: {
        raw_line: {
          type: "text",
          analyzer: "lowercase_analyzer",
          fields: {
            keyword: { type: "keyword" },
            autocomplete: {
              type: "text",
              analyzer: "autocomplete_analyzer",
            },
            ngram: {
              type: "text",
              analyzer: "ngram_analyzer",
            },
          },
        },
      },
    },
  };
}

// Helper function to safely format index name
function formatIndexName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

module.exports = {
  initializeElasticsearchClients,
  getSingleNodeClient,
  getES: () => es,
  getWriteES: () => esWrite,
  isElasticsearchAvailable,
  formatBytes,
  createIndexMapping,
  formatIndexName,
};
