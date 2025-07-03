// Enhanced cluster management routes with node creation and OS-level management
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { getES, initializeElasticsearchClients } = require("../elasticsearch/client");
const clusterManager = require("../elasticsearch/cluster-manager");

const router = express.Router();

// GET cluster information and node details
router.get("/", verifyJwt, async (req, res) => {
  try {
    const es = getES();
    const config = getConfig();
    
    // Get cluster health and stats
    const [health, stats, nodes] = await Promise.all([
      es.cluster.health(),
      es.cluster.stats(),
      es.nodes.info()
    ]);

    // Get node stats for disk usage
    const nodeStats = await es.nodes.stats({
      metric: ['fs']
    });

    // Format node information
    const nodeList = Object.entries(nodes.nodes).map(([nodeId, nodeInfo]) => ({
      id: nodeId,
      name: nodeInfo.name,
      host: nodeInfo.host,
      ip: nodeInfo.ip,
      roles: nodeInfo.roles,
      version: nodeInfo.version,
      transport_address: nodeInfo.transport_address,
      http_address: nodeInfo.http?.bound_address?.[0] || nodeInfo.transport_address,
      attributes: nodeInfo.attributes || {}
    }));

    // Format disk information per node
    const nodeDisks = {};
    Object.entries(nodeStats.nodes).forEach(([nodeId, stats]) => {
      if (stats.fs && stats.fs.data) {
        nodeDisks[nodeId] = stats.fs.data.map(disk => ({
          path: disk.path,
          total: disk.total_in_bytes,
          free: disk.free_in_bytes,
          available: disk.available_in_bytes,
          used: disk.total_in_bytes - disk.free_in_bytes
        }));
      }
    });

    // Get cluster status from cluster manager
    const clusterStatus = await clusterManager.getClusterStatus();

    res.json({
      clusterName: health.cluster_name,
      clusterStatus: health.status,
      numberOfNodes: health.number_of_nodes,
      numberOfDataNodes: health.number_of_data_nodes,
      activePrimaryShards: health.active_primary_shards,
      activeShards: health.active_shards,
      relocatingShards: health.relocating_shards,
      initializingShards: health.initializing_shards,
      unassignedShards: health.unassigned_shards,
      nodes: nodeList,
      nodeDisks,
      elasticsearchNodes: config.elasticsearchNodes || [],
      writeNode: config.writeNode || null,
      nodeAttributes: config.nodeAttributes || {},
      localClusterStatus: clusterStatus
    });
  } catch (error) {
    console.error("Error fetching cluster information:", error);
    res.status(500).json({ error: "Failed to fetch cluster information: " + error.message });
  }
});

// POST create new cluster
router.post("/create", verifyJwt, async (req, res) => {
  try {
    const { clusterName, nodes } = req.body;
    
    if (!clusterName || !nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ 
        error: "Cluster name and at least one node configuration are required" 
      });
    }

    // Initialize cluster manager
    await clusterManager.initialize();

    const createdNodes = [];
    const errors = [];

    // Create each node
    for (const nodeConfig of nodes) {
      try {
        const createdNode = await clusterManager.createNode({
          ...nodeConfig,
          clusterName
        });
        createdNodes.push(createdNode);
      } catch (error) {
        errors.push({
          nodeName: nodeConfig.name,
          error: error.message
        });
      }
    }

    // Update configuration with new nodes
    const nodeUrls = createdNodes.map(node => node.nodeUrl);
    await setConfig('elasticsearchNodes', nodeUrls);
    
    if (nodeUrls.length > 0) {
      await setConfig('writeNode', nodeUrls[0]); // Set first node as write node
    }

    // Store node metadata
    const nodeMetadata = {};
    createdNodes.forEach(node => {
      nodeMetadata[node.nodeUrl] = {
        name: node.name,
        configPath: node.configPath,
        servicePath: node.servicePath,
        dataPath: node.dataPath,
        logsPath: node.logsPath
      };
    });
    await setConfig('nodeMetadata', nodeMetadata);

    res.json({
      message: `Cluster "${clusterName}" created successfully`,
      clusterName,
      createdNodes: createdNodes.length,
      nodes: createdNodes,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Error creating cluster:", error);
    res.status(500).json({ error: "Failed to create cluster: " + error.message });
  }
});

// POST create new node
router.post("/nodes", verifyJwt, async (req, res) => {
  try {
    // Support both old nodeConfig format and new direct properties format
    const nodeConfig = req.body.nodeConfig || req.body;
    
    if (!nodeConfig || !nodeConfig.name) {
      return res.status(400).json({ error: "Node name is required" });
    }

    // Initialize cluster manager if not already done
    await clusterManager.initialize();

    // Create the node
    const createdNode = await clusterManager.createNode(nodeConfig);

    // Update configuration
    const currentNodes = getConfig('elasticsearchNodes') || [];
    const updatedNodes = [...currentNodes, createdNode.nodeUrl];
    await setConfig('elasticsearchNodes', updatedNodes);

    // Store node metadata
    const currentMetadata = getConfig('nodeMetadata') || {};
    currentMetadata[createdNode.nodeUrl] = {
      name: createdNode.name,
      configPath: createdNode.configPath,
      servicePath: createdNode.servicePath,
      dataPath: createdNode.dataPath,
      logsPath: createdNode.logsPath,
      cluster: nodeConfig.cluster || 'trustquery-cluster',
      ...nodeConfig
    };
    await setConfig('nodeMetadata', currentMetadata);

    res.json({
      message: `Node "${createdNode.name}" created successfully`,
      node: createdNode
    });
  } catch (error) {
    console.error("Error creating node:", error);
    res.status(500).json({ error: "Failed to create node: " + error.message });
  }
});

// PUT update node configuration
router.put("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const updates = req.body;
    
    // Get current node metadata
    const currentMetadata = getConfig('nodeMetadata') || {};
    
    // Find the node by name
    let nodeUrl = null;
    for (const [url, metadata] of Object.entries(currentMetadata)) {
      if (metadata.name === nodeName) {
        nodeUrl = url;
        break;
      }
    }
    
    if (!nodeUrl) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }
    
    // Update the metadata
    currentMetadata[nodeUrl] = {
      ...currentMetadata[nodeUrl],
      ...updates
    };
    
    await setConfig('nodeMetadata', currentMetadata);
    
    res.json({
      message: `Node "${nodeName}" updated successfully`,
      node: currentMetadata[nodeUrl]
    });
  } catch (error) {
    console.error("Error updating node:", error);
    res.status(500).json({ error: "Failed to update node: " + error.message });
  }
});

// PUT change node cluster
router.put("/nodes/:nodeName/cluster", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { cluster } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Get current node metadata
    const currentMetadata = getConfig('nodeMetadata') || {};
    
    // Find the node by name
    let nodeUrl = null;
    for (const [url, metadata] of Object.entries(currentMetadata)) {
      if (metadata.name === nodeName) {
        nodeUrl = url;
        break;
      }
    }
    
    if (!nodeUrl) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }
    
    // Update the cluster assignment
    currentMetadata[nodeUrl].cluster = cluster;
    await setConfig('nodeMetadata', currentMetadata);
    
    res.json({
      message: `Node "${nodeName}" moved to cluster "${cluster}"`,
      node: currentMetadata[nodeUrl]
    });
  } catch (error) {
    console.error("Error changing node cluster:", error);
    res.status(500).json({ error: "Failed to change node cluster: " + error.message });
  }
});

// POST create cluster
router.post("/clusters", verifyJwt, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // For now, just acknowledge cluster creation
    // In the future, you might want to store cluster metadata
    res.json({
      message: `Cluster "${name}" created successfully`,
      cluster: { name }
    });
  } catch (error) {
    console.error("Error creating cluster:", error);
    res.status(500).json({ error: "Failed to create cluster: " + error.message });
  }
});

// POST start node
router.post("/nodes/:nodeName/start", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    
    const result = await clusterManager.startNode(nodeName);
    
    res.json({
      message: `Node "${nodeName}" started successfully`,
      ...result
    });
  } catch (error) {
    console.error(`Error starting node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to start node: " + error.message });
  }
});

// POST stop node
router.post("/nodes/:nodeName/stop", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    
    const result = await clusterManager.stopNode(nodeName);
    
    res.json({
      message: `Node "${nodeName}" stopped successfully`,
      ...result
    });
  } catch (error) {
    console.error(`Error stopping node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to stop node: " + error.message });
  }
});

// DELETE remove node
router.delete("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    console.log(`🗑️ Attempting to remove node: ${nodeName}`);
    
    // Get node metadata to find URL
    const nodeMetadata = getConfig('nodeMetadata') || {};
    let nodeUrl = null;
    
    // First, try to find the node by name in metadata
    for (const [url, metadata] of Object.entries(nodeMetadata)) {
      if (metadata.name === nodeName) {
        nodeUrl = url;
        break;
      }
    }
    
    // If not found in metadata, check if it matches a node in elasticsearchNodes
    // This handles cases where nodes exist in config but not in metadata
    if (!nodeUrl) {
      const currentNodes = getConfig('elasticsearchNodes') || [];
      // Try to match by parsing node name from URL or assuming standard format
      for (const url of currentNodes) {
        try {
          const urlObj = new URL(url);
          const possibleNodeName = `node-${urlObj.port}`;
          if (possibleNodeName === nodeName) {
            nodeUrl = url;
            console.log(`🔍 Found node URL by port matching: ${url}`);
            break;
          }
        } catch (urlError) {
          console.warn(`⚠️ Could not parse URL: ${url}`);
        }
      }
      
      // If still not found, check if nodeName directly corresponds to a URL pattern
      if (!nodeUrl && nodeName.startsWith('node-')) {
        const port = nodeName.replace('node-', '');
        const possibleUrl = `http://localhost:${port}`;
        if (currentNodes.includes(possibleUrl)) {
          nodeUrl = possibleUrl;
          console.log(`🔍 Found node URL by name pattern: ${possibleUrl}`);
        }
      }
    }
    
    // Remove from cluster manager (this will handle filesystem cleanup gracefully)
    const removeResult = await clusterManager.removeNode(nodeName);
    if (removeResult.warnings && removeResult.warnings.length > 0) {
      console.warn(`⚠️ Node removal completed with warnings:`, removeResult.warnings);
    }
    
    // Update configuration regardless of filesystem cleanup success
    if (nodeUrl) {
      const currentNodes = getConfig('elasticsearchNodes') || [];
      const updatedNodes = currentNodes.filter(url => url !== nodeUrl);
      await setConfig('elasticsearchNodes', updatedNodes);
      console.log(`📝 Removed node URL from elasticsearchNodes: ${nodeUrl}`);
      
      // Remove from metadata if it exists
      if (nodeMetadata[nodeUrl]) {
        delete nodeMetadata[nodeUrl];
        await setConfig('nodeMetadata', nodeMetadata);
        console.log(`📝 Removed node metadata for: ${nodeUrl}`);
      }
      
      // Update write node if necessary
      const currentWriteNode = getConfig('writeNode');
      if (currentWriteNode === nodeUrl) {
        if (updatedNodes.length > 0) {
          await setConfig('writeNode', updatedNodes[0]);
          console.log(`📝 Updated write node to: ${updatedNodes[0]}`);
        } else {
          await setConfig('writeNode', null);
          console.log(`📝 Cleared write node (no nodes remaining)`);
        }
      }
    } else {
      console.warn(`⚠️ Could not find node URL for ${nodeName}. Config may already be clean.`);
    }
    
    const message = removeResult.warnings && removeResult.warnings.length > 0
      ? `Node "${nodeName}" removed successfully (with warnings - see server logs)`
      : `Node "${nodeName}" removed successfully`;
    
    res.json({ message });
  } catch (error) {
    console.error(`Error removing node ${req.params.nodeName}:`, error);
    
    // Even if there was an error, try to clean up config
    try {
      const { nodeName } = req.params;
      const nodeMetadata = getConfig('nodeMetadata') || {};
      const currentNodes = getConfig('elasticsearchNodes') || [];
      
      // Try to find and remove orphaned config entries
      let cleaned = false;
      for (const [url, metadata] of Object.entries(nodeMetadata)) {
        if (metadata.name === nodeName) {
          delete nodeMetadata[url];
          await setConfig('nodeMetadata', nodeMetadata);
          
          const updatedNodes = currentNodes.filter(u => u !== url);
          await setConfig('elasticsearchNodes', updatedNodes);
          cleaned = true;
          console.log(`🧹 Emergency cleanup: removed orphaned config for ${nodeName}`);
          break;
        }
      }
      
      if (cleaned) {
        res.json({ 
          message: `Node "${nodeName}" config cleaned up (filesystem cleanup failed: ${error.message})`,
          warning: "Some files may remain on disk and need manual cleanup"
        });
      } else {
        res.status(500).json({ error: "Failed to remove node: " + error.message });
      }
    } catch (cleanupError) {
      console.error(`Failed to perform emergency cleanup:`, cleanupError);
      res.status(500).json({ error: "Failed to remove node: " + error.message });
    }
  }
});

// GET cluster setup guide
router.get("/setup-guide", verifyJwt, async (req, res) => {
  try {
    const guide = {
      steps: [
        {
          step: 1,
          title: "Download and Install Elasticsearch",
          description: "Download Elasticsearch from elastic.co and extract to C:\\elasticsearch",
          commands: [
            "Download from: https://www.elastic.co/downloads/elasticsearch",
            "Extract to: C:\\elasticsearch",
            "Ensure Java 11+ is installed"
          ]
        },
        {
          step: 2,
          title: "Create Your First Cluster",
          description: "Use the TrustQuery cluster creation wizard",
          commands: [
            "Go to Admin Dashboard > Cluster Management",
            "Click 'Create New Cluster'",
            "Configure nodes with different ports (9200, 9201, 9202, etc.)",
            "Set different data paths for each node"
          ]
        },
        {
          step: 3,
          title: "Start Nodes",
          description: "Start each node individually",
          commands: [
            "Click 'Start' button for each node in the UI",
            "Or run the generated start-node.bat files",
            "Monitor logs for successful startup"
          ]
        },
        {
          step: 4,
          title: "Verify Cluster Health",
          description: "Check that all nodes have joined the cluster",
          commands: [
            "Refresh cluster information in the UI",
            "Verify all nodes show as 'Active'",
            "Check cluster status is 'green'"
          ]
        }
      ],
      commonPorts: {
        node1: { http: 9200, transport: 9300 },
        node2: { http: 9201, transport: 9301 },
        node3: { http: 9202, transport: 9302 }
      },
      dataPathExamples: {
        node1: "C:\\elasticsearch-data\\node-1",
        node2: "C:\\elasticsearch-data\\node-2",
        node3: "C:\\elasticsearch-data\\node-3"
      }
    };
    
    res.json(guide);
  } catch (error) {
    console.error("Error getting setup guide:", error);
    res.status(500).json({ error: "Failed to get setup guide: " + error.message });
  }
});

// GET local nodes status
router.get("/local-nodes", verifyJwt, async (req, res) => {
  try {
    const clusterStatus = await clusterManager.getClusterStatus();
    res.json(clusterStatus);
  } catch (error) {
    console.error("Error getting local nodes status:", error);
    res.status(500).json({ error: "Failed to get local nodes status: " + error.message });
  }
});

module.exports = router;
