const { getConfig } = require("../config");
const { Client } = require("@elastic/elasticsearch");

// Set a short timeout for node stats fetch (in ms)
const NODE_STATS_TIMEOUT = 500;

// Create a client for a specific node
function createNodeClient(nodeUrl) {
  return new Client({
    node: nodeUrl,
    requestTimeout: NODE_STATS_TIMEOUT,
    maxRetries: 1,
    sniffOnStart: false,
    sniffOnConnectionFault: false,
  });
} 