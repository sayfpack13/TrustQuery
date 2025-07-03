// Node management routes
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { getES, initializeElasticsearchClients } = require("../elasticsearch/client");

const router = express.Router();

// GET node information
router.get("/", verifyJwt, async (req, res) => {
  try {
    const es = getES();
    
    // Get node information and stats
    const [nodeInfo, nodeStats] = await Promise.all([
      es.nodes.info(),
      es.nodes.stats({
        metric: ['jvm', 'os', 'fs', 'indices', 'transport']
      })
    ]);

    // Format node information
    const nodes = Object.entries(nodeInfo.nodes).map(([nodeId, info]) => {
      const stats = nodeStats.nodes[nodeId];
      
      return {
        id: nodeId,
        name: info.name,
        host: info.host,
        ip: info.ip,
        roles: info.roles,
        version: info.version,
        transport_address: info.transport_address,
        http_address: info.http?.bound_address?.[0] || info.transport_address,
        attributes: info.attributes || {},
        stats: stats ? {
          jvm: stats.jvm,
          os: stats.os,
          fs: stats.fs,
          indices: stats.indices,
          transport: stats.transport
        } : null
      };
    });

    res.json({
      nodes,
      stats: nodeStats.nodes
    });
  } catch (error) {
    console.error("Error fetching node information:", error);
    res.status(500).json({ error: "Failed to fetch node information: " + error.message });
  }
});

// POST add new node to configuration
router.post("/", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl, nodeConfig } = req.body;
    
    // Support both simple nodeUrl and advanced nodeConfig
    let finalNodeUrl;
    let nodeMetadata = {};
    
    if (nodeConfig) {
      // Advanced configuration
      const { name, host, port, transportPort, dataPath, logsPath, isMaster, isData, isIngest } = nodeConfig;
      
      if (!host || !port) {
        return res.status(400).json({ error: "Host and port are required for advanced configuration" });
      }
      
      finalNodeUrl = `http://${host}:${port}`;
      nodeMetadata = {
        name: name || `node-${host}-${port}`,
        host,
        port: parseInt(port),
        transportPort: transportPort ? parseInt(transportPort) : 9300,
        dataPath,
        logsPath,
        roles: {
          master: !!isMaster,
          data: !!isData,
          ingest: !!isIngest
        }
      };
    } else if (nodeUrl) {
      // Simple URL-based configuration
      if (typeof nodeUrl !== 'string') {
        return res.status(400).json({ error: "Node URL must be a string" });
      }
      
      finalNodeUrl = nodeUrl;
    } else {
      return res.status(400).json({ error: "Either nodeUrl or nodeConfig is required" });
    }

    // Validate URL format
    try {
      new URL(finalNodeUrl);
    } catch (urlError) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    const currentNodeMetadata = getConfig('nodeMetadata') || {};
    
    // Check if node already exists
    if (currentNodes.includes(finalNodeUrl)) {
      return res.status(400).json({ error: "Node already exists in configuration" });
    }

    // Add node to configuration
    const updatedNodes = [...currentNodes, finalNodeUrl];
    await setConfig('elasticsearchNodes', updatedNodes);
    
    // Store node metadata if provided
    if (Object.keys(nodeMetadata).length > 0) {
      const updatedMetadata = {
        ...currentNodeMetadata,
        [finalNodeUrl]: nodeMetadata
      };
      await setConfig('nodeMetadata', updatedMetadata);
    }

    // Reinitialize Elasticsearch clients with new configuration
    initializeElasticsearchClients();

    res.json({
      message: "Node added successfully",
      elasticsearchNodes: updatedNodes,
      nodeMetadata: nodeMetadata
    });
  } catch (error) {
    console.error("Error adding node:", error);
    res.status(500).json({ error: "Failed to add node: " + error.message });
  }
});

// DELETE remove node from configuration
router.delete("/", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl } = req.body;
    
    if (!nodeUrl || typeof nodeUrl !== 'string') {
      return res.status(400).json({ error: "Node URL is required" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    
    // Check if node exists
    if (!currentNodes.includes(nodeUrl)) {
      return res.status(400).json({ error: "Node not found in configuration" });
    }

    // Prevent removing the last node
    if (currentNodes.length <= 1) {
      return res.status(400).json({ error: "Cannot remove the last node from configuration" });
    }

    // Remove node from configuration
    const updatedNodes = currentNodes.filter(node => node !== nodeUrl);
    await setConfig('elasticsearchNodes', updatedNodes);

    // Update write node if it was the removed node
    const currentWriteNode = getConfig('writeNode');
    if (currentWriteNode === nodeUrl) {
      await setConfig('writeNode', updatedNodes[0]);
    }

    // Reinitialize Elasticsearch clients with new configuration
    initializeElasticsearchClients();

    res.json({
      message: "Node removed successfully",
      elasticsearchNodes: updatedNodes,
      writeNode: getConfig('writeNode')
    });
  } catch (error) {
    console.error("Error removing node:", error);
    res.status(500).json({ error: "Failed to remove node: " + error.message });
  }
});

// POST set write node
router.post("/write", verifyJwt, async (req, res) => {
  try {
    const { nodeUrl } = req.body;
    
    if (!nodeUrl || typeof nodeUrl !== 'string') {
      return res.status(400).json({ error: "Node URL is required" });
    }

    const currentNodes = getConfig('elasticsearchNodes') || [];
    
    // Check if node exists in configuration
    if (!currentNodes.includes(nodeUrl)) {
      return res.status(400).json({ error: "Node not found in configuration" });
    }

    // Update write node
    await setConfig('writeNode', nodeUrl);

    // Reinitialize Elasticsearch clients to use new write node
    initializeElasticsearchClients();

    res.json({
      message: "Write node updated successfully",
      writeNode: nodeUrl
    });
  } catch (error) {
    console.error("Error setting write node:", error);
    res.status(500).json({ error: "Failed to set write node: " + error.message });
  }
});

// GET detailed node statistics
router.get("/stats", verifyJwt, async (req, res) => {
  try {
    const es = getES();
    const stats = await es.nodes.stats({
      metric: ['jvm', 'os', 'fs', 'indices', 'transport', 'process']
    });

    res.json({
      stats: stats.nodes
    });
  } catch (error) {
    console.error("Error fetching node stats:", error);
    res.status(500).json({ error: "Failed to fetch node statistics: " + error.message });
  }
});

module.exports = router;
