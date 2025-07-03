// Elasticsearch client management
const { Client } = require("@elastic/elasticsearch");
const { getConfig } = require("../config");

let es;
let esWrite;

function initializeElasticsearchClients() {
  // Main client for reading/searching - connects to all nodes
  const nodes = getConfig('elasticsearchNodes');
  if (nodes && nodes.length > 0) {
    es = new Client({ nodes });
    console.log(`🔍 Initialized main Elasticsearch client with nodes: ${nodes.join(', ')}`);
  } else {
    // Fall back to default configuration
    const DEFAULT_CONFIG = require("../config").DEFAULT_CONFIG;
    const defaultNodes = DEFAULT_CONFIG.elasticsearchNodes;
    es = new Client({ nodes: defaultNodes });
    console.log(`🔍 Initialized main Elasticsearch client with default nodes: ${defaultNodes.join(', ')}`);
  }

  // Write client - connects to specific write node
  const writeNode = getConfig('writeNode');
  if (writeNode) {
    esWrite = new Client({ node: writeNode });
    console.log(`✍️ Initialized write client for node: ${writeNode}`);
  } else {
    // Fall back to default write node or use main client
    const DEFAULT_CONFIG = require("../config").DEFAULT_CONFIG;
    const defaultWriteNode = DEFAULT_CONFIG.writeNode;
    if (defaultWriteNode) {
      esWrite = new Client({ node: defaultWriteNode });
      console.log(`✍️ Initialized write client with default node: ${defaultWriteNode}`);
    } else {
      console.log("✍️ Using main client for writes");
      esWrite = es;
    }
  }
}

// Helper function to check if Elasticsearch is available
async function isElasticsearchAvailable() {
  try {
    await es.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
            filter: ["lowercase"]
          }
        },
        tokenizer: {
          autocomplete_tokenizer: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 10,
          }
        }
      }
    },
    mappings: {
      properties: {
        raw_line: {
          type: "text",
          fields: {
            autocomplete: {
              type: "text",
              analyzer: "autocomplete_analyzer"
            }
          }
        },
      },
    },
  };
}

// Helper function to safely format index name
function formatIndexName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

module.exports = {
  initializeElasticsearchClients,
  isElasticsearchAvailable,
  formatBytes,
  createIndexMapping,
  formatIndexName,
  getES: () => es,
  getESWrite: () => esWrite
};
