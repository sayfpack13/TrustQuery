// Enhanced cluster management routes with node creation and OS-level management
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { refreshCache, refreshCacheForRunningNodes, syncSearchIndices } = require('../cache/indices-cache');
const { getES, initializeElasticsearchClients } = require("../elasticsearch/client");
const clusterManager = require("../elasticsearch/cluster-manager");

const router = express.Router();

// Helper function to refresh cache and sync search indices using smart refresh
async function refreshCacheAndSync(config, operation = 'operation') {
  try {
    await refreshCacheForRunningNodes(config);
    await syncSearchIndices(config);
    console.log(`🔄 Smart cache refresh and searchIndices synchronized after ${operation}`);
  } catch (error) {
    console.warn(`⚠️ Failed to refresh cache and sync indices after ${operation}:`, error.message);
  }
}

// Validation function for port conflicts
async function validateNodePorts(newNodeConfig, editingNodeName = null) {
  const existingMetadata = getConfig('nodeMetadata') || {};
  const conflicts = [];
  const suggestions = {};

  // Default values
  const newHost = newNodeConfig.host || 'localhost';
  const newHttpPort = parseInt(newNodeConfig.port) || 9200;
  const newTransportPort = parseInt(newNodeConfig.transportPort) || 9300;

  // Check against existing nodes
  for (const [nodeUrl, metadata] of Object.entries(existingMetadata)) {
    // If editing, skip checking the node against itself
    if (editingNodeName && metadata.name === editingNodeName) {
      continue;
    }

    const existingHost = metadata.host || 'localhost';
    const existingHttpPort = parseInt(metadata.port) || 9200;
    const existingTransportPort = parseInt(metadata.transportPort) || 9300;

    // Skip if different hosts (no conflict on different machines)
    if (existingHost !== newHost) continue;

    // Check for HTTP port conflicts
    if (existingHttpPort === newHttpPort) {
      conflicts.push({
        type: 'http_port',
        conflictWith: metadata.name,
        port: newHttpPort,
        message: `HTTP port ${newHttpPort} is already used by node "${metadata.name}"`
      });
    }

    // Check for transport port conflicts
    if (existingTransportPort === newTransportPort) {
      conflicts.push({
        type: 'transport_port',
        conflictWith: metadata.name,
        port: newTransportPort,
        message: `Transport port ${newTransportPort} is already used by node "${metadata.name}"`
      });
    }

    // Check for node name conflicts
    if (metadata.name === newNodeConfig.name) {
      conflicts.push({
        type: 'node_name',
        conflictWith: metadata.name,
        message: `Node name "${newNodeConfig.name}" already exists`
      });
    }

    // Check for data path conflicts
    if (newNodeConfig.dataPath && metadata.dataPath && newNodeConfig.dataPath === metadata.dataPath) {
      conflicts.push({
        type: 'data_path',
        conflictWith: metadata.name,
        path: newNodeConfig.dataPath,
        message: `Data path "${newNodeConfig.dataPath}" is already used by node "${metadata.name}"`
      });
    }

    // Check for logs path conflicts
    if (newNodeConfig.logsPath && metadata.logsPath && newNodeConfig.logsPath === metadata.logsPath) {
      conflicts.push({
        type: 'logs_path',
        conflictWith: metadata.name,
        path: newNodeConfig.logsPath,
        message: `Logs path "${newNodeConfig.logsPath}" is already used by node "${metadata.name}"`
      });
    }
  }

  // Generate suggestions for available ports if conflicts exist
  if (conflicts.length > 0) {
    suggestions.httpPort = findAvailablePort(existingMetadata, 'port', newHost, 9200);
    suggestions.transportPort = findAvailablePort(existingMetadata, 'transportPort', newHost, 9300);
    
    // Generate node name suggestions if there's a name conflict
    const nameConflict = conflicts.find(c => c.type === 'node_name');
    if (nameConflict) {
      suggestions.nodeName = findAvailableNodeName(existingMetadata, newNodeConfig.name);
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    suggestions
  };
}

// Helper function to find available ports
function findAvailablePort(existingMetadata, portType, host, startPort) {
  const usedPorts = new Set();
  
  // Collect all used ports for the specific host
  for (const metadata of Object.values(existingMetadata)) {
    if ((metadata.host || 'localhost') === host) {
      const port = parseInt(metadata[portType]);
      if (port) usedPorts.add(port);
    }
  }

  // Find next available port starting from startPort
  let candidatePort = startPort;
  while (usedPorts.has(candidatePort)) {
    candidatePort++;
    // Safety limit to prevent infinite loop
    if (candidatePort > startPort + 1000) break;
  }

  return candidatePort;
}

// Helper function to find available node names
function findAvailableNodeName(existingMetadata, baseName) {
  const usedNames = new Set();
  
  // Collect all used node names
  for (const metadata of Object.values(existingMetadata)) {
    if (metadata.name) {
      usedNames.add(metadata.name.toLowerCase());
    }
  }

  // Generate suggestions based on common patterns
  const suggestions = [];
  
  // Pattern 1: Add number suffix (e.g., node-1 -> node-2, node-3)
  const baseNameLower = baseName.toLowerCase();
  for (let i = 1; i <= 10; i++) {
    const candidate = `${baseName}-${i}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      suggestions.push(candidate);
      if (suggestions.length >= 3) break;
    }
  }
  
  // Pattern 2: If original name doesn't have number, try with numbers
  if (!baseName.match(/\d+$/)) {
    for (let i = 2; i <= 10; i++) {
      const candidate = `${baseName}${i}`;
      if (!usedNames.has(candidate.toLowerCase())) {
        suggestions.push(candidate);
        if (suggestions.length >= 3) break;
      }
    }
  }
  
  // Pattern 3: Role-based suggestions
  const roleBasedNames = [
    `${baseName}-master`,
    `${baseName}-data`,
    `${baseName}-ingest`,
    `master-${baseName}`,
    `data-${baseName}`,
    `search-${baseName}`
  ];
  
  for (const candidate of roleBasedNames) {
    if (!usedNames.has(candidate.toLowerCase())) {
      suggestions.push(candidate);
      if (suggestions.length >= 5) break;
    }
  }
  
  return suggestions.slice(0, 3); // Return top 3 suggestions
}

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

    // Refresh persistent indices cache after cluster creation
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `creating cluster ${clusterName} with ${createdNodes.length} nodes`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after creating cluster:`, cacheError.message);
    }

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

    // Basic validation for required fields only
    if (!nodeConfig.port || !nodeConfig.transportPort) {
      return res.status(400).json({ error: "Port and transport port are required" });
    }

    // Ensure paths are strings (not objects)
    if (nodeConfig.dataPath && typeof nodeConfig.dataPath !== 'string') {
      return res.status(400).json({ error: "Data path must be a string" });
    }
    if (nodeConfig.logsPath && typeof nodeConfig.logsPath !== 'string') {
      return res.status(400).json({ error: "Logs path must be a string" });
    }

    // Initialize cluster manager if not already done
    await clusterManager.initialize();

    // Create the node (frontend validation ensures no conflicts)
    const createdNode = await clusterManager.createNode(nodeConfig);

    // Update configuration
    const currentNodes = getConfig('elasticsearchNodes') || [];
    const updatedNodes = [...currentNodes, createdNode.nodeUrl];
    await setConfig('elasticsearchNodes', updatedNodes);

    // Store node metadata (avoid spreading nodeConfig to prevent overwriting paths)
    const currentMetadata = getConfig('nodeMetadata') || {};
    
    // Log the types for debugging
    console.log('📝 Node creation - Path types:', {
      dataPath: typeof createdNode.dataPath,
      logsPath: typeof createdNode.logsPath,
      dataPathValue: createdNode.dataPath,
      logsPathValue: createdNode.logsPath
    });
    
    currentMetadata[createdNode.nodeUrl] = {
      name: createdNode.name,
      configPath: createdNode.configPath,
      servicePath: createdNode.servicePath,
      dataPath: createdNode.dataPath,
      logsPath: createdNode.logsPath,
      cluster: nodeConfig.cluster || 'trustquery-cluster',
      host: nodeConfig.host || 'localhost',
      port: nodeConfig.port,
      transportPort: nodeConfig.transportPort,
      roles: nodeConfig.roles || {
        master: true,
        data: true,
        ingest: true
      }
    };
    await setConfig('nodeMetadata', currentMetadata);

    // Refresh persistent indices cache after node creation
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `creating node ${createdNode.name}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after creating node:`, cacheError.message);
    }

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
    const { nodeName } = req.params; // The original name of the node being edited
    const updates = req.body;

    // Get current node metadata to find the original config
    const currentMetadata = getConfig('nodeMetadata') || {};
    let originalNodeConfig = null;
    let nodeUrl = null;

    for (const [url, metadata] of Object.entries(currentMetadata)) {
      if (metadata.name === nodeName) {
        originalNodeConfig = metadata;
        nodeUrl = url;
        break;
      }
    }

    if (!originalNodeConfig) {
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }

    // Check if the node is currently running
    const isRunning = await clusterManager.isNodeRunning(nodeName);
    if (isRunning) {
      return res.status(409).json({ 
        error: `Cannot update configuration for node "${nodeName}" while it is running. Stop the node first to make changes.`,
        reason: "node_running"
      });
    }

    // Create the potential new configuration by merging updates
    const updatedNodeConfig = { ...originalNodeConfig, ...updates };

    // Validate the updated configuration, passing the original node name to exclude it from self-conflict checks
    const validation = await validateNodePorts(updatedNodeConfig, nodeName);

    if (!validation.valid) {
      return res.status(409).json({ // 409 Conflict is more appropriate here
        error: "Validation failed",
        conflicts: validation.conflicts,
        suggestions: validation.suggestions,
      });
    }

    // Validate path types if provided
    if (updates.dataPath && typeof updates.dataPath !== 'string') {
      return res.status(400).json({ error: "Data path must be a string" });
    }
    if (updates.logsPath && typeof updates.logsPath !== 'string') {
      return res.status(400).json({ error: "Logs path must be a string" });
    }
    
    // Update the actual configuration files using cluster manager
    const updateResult = await clusterManager.updateNode(nodeName, updates);
    console.log(`Node ${nodeName} configuration update result:`, updateResult);
    
    // Update the metadata in config.json (ensure paths are strings)
    const newMetadata = {
      ...originalNodeConfig,
      ...updates,
      dataPath: typeof updates.dataPath === 'string' ? updates.dataPath : originalNodeConfig.dataPath,
      logsPath: typeof updates.logsPath === 'string' ? updates.logsPath : originalNodeConfig.logsPath,
    };

    // If the URL changes (e.g., new host or port), we need to update the key in metadata
    const newHost = newMetadata.host;
    const newPort = newMetadata.port;
    const newNodeUrl = `http://${newHost}:${newPort}`;

    if (nodeUrl !== newNodeUrl) {
      // Remove the old entry
      delete currentMetadata[nodeUrl];
    }

    // Add/update the entry with the new URL and metadata
    currentMetadata[newNodeUrl] = newMetadata;
    
    await setConfig('nodeMetadata', currentMetadata);

    // Also update the elasticsearchNodes array if the URL changed
    if (nodeUrl !== newNodeUrl) {
      const currentNodes = getConfig('elasticsearchNodes') || [];
      const updatedNodes = currentNodes.map(url => url === nodeUrl ? newNodeUrl : url);
      await setConfig('elasticsearchNodes', updatedNodes);
    }
    
    // Refresh persistent indices cache after node update
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `updating node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after updating node:`, cacheError.message);
    }
    
    res.json({
      message: `Node "${nodeName}" updated successfully`,
      node: newMetadata,
      updateResult: updateResult
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
    
    // Refresh persistent indices cache after node stop
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `stopping node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after stopping node:`, cacheError.message);
    }
    
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
    
    // Refresh persistent cache after node removal to clean up removed nodes
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `removing node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after removing node:`, cacheError.message);
    }
    
    const message = removeResult.wasRunning 
      ? `Node "${nodeName}" was stopped and removed successfully`
      : `Node "${nodeName}" removed successfully`;
    
    res.json({ 
      message,
      details: removeResult
    });
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
        // Refresh cache after emergency cleanup
        try {
          const config = getConfig();
          await refreshCacheAndSync(config, `emergency cleanup of node ${nodeName}`);
        } catch (cacheError) {
          console.warn(`⚠️ Failed to refresh cache after emergency cleanup:`, cacheError.message);
        }
        
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

// GET local nodes status with indices information
router.get("/local-nodes", verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    
    // First get cluster status to see which nodes are running
    const clusterStatus = await clusterManager.getClusterStatus();
    
    // Perform smart refresh - only update running nodes, use cache for offline ones
    const refreshedCache = await refreshCacheForRunningNodes(config);
      // Enhance nodes with indices information
    const enhancedNodes = await Promise.all(clusterStatus.nodes.map(async (node) => {
      const nodeUrl = `http://${node.host}:${node.port}`;
      const cachedNodeData = refreshedCache[node.name] || {};
      
      let indicesArray = [];
      
      if (node.isRunning) {
        // For running nodes, fetch fresh live data to ensure accuracy
        try {
          const { getSingleNodeClient } = require('../elasticsearch/client');
          const client = getSingleNodeClient(nodeUrl);
          const response = await client.cat.indices({
            format: "json",
            h: "index,status,health,docs.count,store.size,creation.date.string,uuid",
            s: "index:asc"
          });
          
          indicesArray = response.map((index) => ({
            index: index.index,
            'docs.count': index['docs.count'],
            'store.size': index['store.size'],
            docCount: parseInt(index['docs.count'], 10) || 0,
            health: index.health,
            status: index.status,
            uuid: index.uuid,
            creation: {
              date: {
                string: index['creation.date.string']
              }
            }
          }));
        } catch (error) {
          console.error(`Failed to fetch live indices for running node ${node.name}:`, error);
          // Fall back to cached data if live fetch fails
          if (cachedNodeData.indices) {
            indicesArray = Array.isArray(cachedNodeData.indices) 
              ? cachedNodeData.indices 
              : Object.entries(cachedNodeData.indices).map(([indexName, indexData]) => ({
                  index: indexName,
                  'docs.count': indexData.doc_count?.toString() || '0',
                  'store.size': indexData.store_size ? `${indexData.store_size}b` : '0b',
                  docCount: indexData.doc_count || 0,
                  health: 'yellow', // Indicate data might be stale
                  status: 'open',
                  uuid: indexName,
                  creation: {
                    date: {
                      string: new Date().toISOString()
                    }
                  }
                }));
          }
        }
      } else {
        // For offline nodes, use cached data
        if (cachedNodeData.indices) {
          indicesArray = Array.isArray(cachedNodeData.indices) 
            ? cachedNodeData.indices 
            : Object.entries(cachedNodeData.indices).map(([indexName, indexData]) => ({
                index: indexName,
                'docs.count': indexData.doc_count?.toString() || '0',
                'store.size': indexData.store_size ? `${indexData.store_size}b` : '0b',
                docCount: indexData.doc_count || 0,
                health: 'green',
                status: 'open',
                uuid: indexName,
                creation: {
                  date: {
                    string: new Date().toISOString()
                  }
                }
              }));
        }
      }

      return {
        ...node,
        nodeUrl,
        indices: indicesArray,
        lastCacheUpdate: cachedNodeData.last_updated || null,
        cacheStatus: node.isRunning ? 'live' : 'cached'
      };
    }));

    // Create indicesByNodes format for compatibility
    const indicesByNodes = {};
    enhancedNodes.forEach(node => {
      indicesByNodes[node.name] = {
        nodeUrl: node.nodeUrl,
        isRunning: node.isRunning,
        indices: node.indices, // This is now guaranteed to be an array
        timestamp: node.lastCacheUpdate,
        error: refreshedCache[node.name]?.error || null
      };
    });
    
    res.json({
      ...clusterStatus,
      nodes: enhancedNodes,
      indicesByNodes
    });
  } catch (error) {
    console.error("Error getting local nodes status:", error);
    res.status(500).json({ error: "Failed to get local nodes status: " + error.message });
  }
});

// POST refresh local nodes data and indices cache
router.post("/local-nodes/refresh", verifyJwt, async (req, res) => {
  try {
    console.log('🔄 Performing smart refresh of local nodes data and indices cache...');
    
    // Use smart refresh that only updates running nodes
    const config = getConfig();
    const refreshedCache = await refreshCacheForRunningNodes(config);
    
    // Get fresh cluster status
    const clusterStatus = await clusterManager.getClusterStatus();
    
    // Enhance nodes with refreshed indices information
    const enhancedNodes = clusterStatus.nodes.map(node => {
      const nodeUrl = `http://${node.host}:${node.port}`;
      const cachedNodeData = refreshedCache[node.name] || {};
      
      return {
        ...node,
        nodeUrl,
        indices: cachedNodeData.indices || [],
        lastCacheUpdate: cachedNodeData.timestamp || null
      };
    });
    
    // Create indicesByNodes format for compatibility
    const indicesByNodes = {};
    enhancedNodes.forEach(node => {
      indicesByNodes[node.name] = {
        nodeUrl: node.nodeUrl,
        isRunning: node.isRunning,
        indices: node.indices,
        timestamp: node.lastCacheUpdate
      };
    });
    
    const runningNodesCount = Object.values(refreshedCache).filter(node => node.isRunning).length;
    
    res.json({
      message: `Smart refresh: Updated ${runningNodesCount} running nodes, using cache for offline nodes.`,
      ...clusterStatus,
      nodes: enhancedNodes,
      indicesByNodes
    });
  } catch (error) {
    console.error("Error during smart refresh of local nodes data:", error);
    res.status(500).json({ error: "Failed to refresh local nodes data: " + error.message });
  }
});

// GET the content of a node's configuration file
router.get("/:nodeName/config", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  try {
    const configContent = await clusterManager.getNodeConfigContent(nodeName);
    res.type('text/plain'); // Set content type to plain text
    res.send(configContent);
  } catch (error) {
    console.error(`Error fetching config for node ${nodeName}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET the list of indices for a specific node
router.get("/:nodeName/indices", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig || !nodeConfig.http || !nodeConfig.network) {
      return res.status(404).json({ error: `Configuration for node ${nodeName} not found.` });
    }

    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require('../elasticsearch/client');
    const nodeClient = getSingleNodeClient(nodeUrl);

    const indicesResponse = await nodeClient.cat.indices({
      format: "json",
      h: "index,status,health,docs.count,store.size,creation.date.string,uuid",
      s: "index:asc"
    });

    const { formatBytes } = require('../utils/format');
    const formattedIndices = indicesResponse.map((index) => ({
      ...index,
      docCount: parseInt(index['docs.count'], 10) || 0,
    }));

    res.json(formattedIndices);
  } catch (error) {
    console.error(`Error fetching indices for node ${nodeName}:`, error);
    res.status(500).json({ error: "Failed to fetch indices: " + error.message });
  }
});

// Create an index on a specific node
router.post("/:nodeName/indices", verifyJwt, async (req, res) => {
  const { nodeName } = req.params;
  const { indexName, shards, replicas } = req.body;

  if (!indexName) {
    return res.status(400).json({ error: "Index name is required." });
  }

  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig) {
      return res.status(404).json({ error: `Node '${nodeName}' not found.` });
    }
    
    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require('../elasticsearch/client');
    const nodeClient = getSingleNodeClient(nodeUrl);

    await nodeClient.indices.create({
      index: indexName,
      wait_for_active_shards: '1',
      body: {
        settings: {
          "index.routing.allocation.require.custom_id": nodeName,
          number_of_shards: shards || 1,
          number_of_replicas: replicas || 0,
        },
      },
    });

    // After successful index creation, refresh persistent cache
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `creating index ${indexName} on node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after creating index:`, cacheError.message);
    }

    res.status(201).json({ message: `Index '${indexName}' created successfully on node '${nodeName}'.` });
  } catch (error) {
    console.error(`Error creating index on node ${nodeName}:`, error);
    res.status(500).json({ error: "Failed to create index.", details: error.message });
  }
});

// Delete an index from a specific node
router.delete("/:nodeName/indices/:indexName", verifyJwt, async (req, res) => {
  const { nodeName, indexName } = req.params;

  if (!indexName) {
    return res.status(400).json({ error: "Index name is required." });
  }

  try {
    const nodeConfig = await clusterManager.getNodeConfig(nodeName);
    if (!nodeConfig) {
      return res.status(404).json({ error: `Node '${nodeName}' not found.` });
    }
    
    const nodeUrl = `http://${nodeConfig.network.host}:${nodeConfig.http.port}`;
    const { getSingleNodeClient } = require('../elasticsearch/client');
    const nodeClient = getSingleNodeClient(nodeUrl);

    await nodeClient.indices.delete({
      index: indexName,
    });

    // After successful deletion, refresh persistent cache
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `deleting index ${indexName} on node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after deleting index:`, cacheError.message);
    }

    res.json({ message: `Index '${indexName}' deleted successfully from node '${nodeName}'.` });
  } catch (error) {
    console.error(`Error deleting index ${indexName} on node ${nodeName}:`, error);
    if (error.meta && error.meta.statusCode === 404) {
      res.status(404).json({ error: `Index '${indexName}' not found on node '${nodeName}'.` });
    } else {
      res.status(500).json({ error: "Failed to delete index.", details: error.message });
    }
  }
});

// Validate node configuration before creation
router.post("/nodes/validate", verifyJwt, async (req, res) => {
  try {
    const { nodeConfig, originalName } = req.body;
    const configToValidate = nodeConfig || req.body;

    if (!configToValidate || !configToValidate.name) {
      return res.status(400).json({ error: "Node name is required" });
    }

    // Pass the originalName to the validation function if it exists (i.e., we are editing)
    const validation = await validateNodePorts(configToValidate, originalName || null);
    
    res.json({
      valid: validation.valid,
      conflicts: validation.conflicts,
      suggestions: validation.suggestions
    });
  } catch (error) {
    console.error("Error validating node configuration:", error);
    res.status(500).json({ error: "Failed to validate node configuration: " + error.message });
  }
});

// GET individual node details
router.get("/nodes/:nodeName", verifyJwt, async (req, res) => {
  try {
    console.log(`🔍 Retrieving details for node: ${req.params.nodeName}`);
    const { nodeName } = req.params;
    
    // Get cluster status to find the node (same source as local-nodes endpoint)
    const clusterStatus = await clusterManager.getClusterStatus();
    console.log(`📝 Cluster has ${clusterStatus.nodes.length} nodes`);
    
    // Find the node by name
    const nodeData = clusterStatus.nodes.find(node => node.name === nodeName);
    
    if (!nodeData) {
      console.log(`❌ Node "${nodeName}" not found in cluster status`);
      return res.status(404).json({ error: `Node "${nodeName}" not found` });
    }
    
    console.log(`✅ Found node "${nodeName}"`);
    
    // Build node URL for compatibility
    const nodeUrl = `http://${nodeData.host}:${nodeData.port}`;
    
    res.json({
      nodeUrl,
      ...nodeData
    });
  } catch (error) {
    console.error("Error getting node details:", error);
    res.status(500).json({ error: "Failed to get node details: " + error.message });
  }
});

// Move node to a new location
router.post('/nodes/:nodeName/move', verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { newPath, preserveData } = req.body;

    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).json({ error: "New path is required" });
    }

    console.log(`🚚 Moving node "${nodeName}" to: ${newPath}`);
    
    // Ensure node is stopped before moving
    const isRunning = await clusterManager.isNodeRunning(nodeName);
    if (isRunning) {
      return res.status(409).json({ 
        error: "Cannot move a running node. Please stop the node first.",
        reason: 'node_running'
      });
    }

    // Check if destination exists and handle conflicts
    const fs = require('fs').promises;
    const path = require('path');
    
    const destinationExists = await fs.access(newPath).then(() => true).catch(() => false);
    if (destinationExists) {
      return res.status(409).json({
        error: `Destination path "${newPath}" already exists`,
        reason: 'destination_exists'
      });
    }

    const moveResult = await clusterManager.moveNode(nodeName, newPath, preserveData);
    
    // Update metadata
    const nodeMetadata = getConfig('nodeMetadata') || {};
    const currentMetadata = Object.values(nodeMetadata).find(m => m.name === nodeName);
    
    if (currentMetadata) {
      const nodeUrl = Object.keys(nodeMetadata).find(url => nodeMetadata[url].name === nodeName);
      if (nodeUrl) {
        nodeMetadata[nodeUrl] = {
          ...currentMetadata,
          dataPath: moveResult.newDataPath,
          logsPath: moveResult.newLogsPath,
          configPath: moveResult.newConfigPath,
          servicePath: moveResult.newServicePath
        };
        await setConfig('nodeMetadata', nodeMetadata);
      }
    }

    // Refresh persistent indices cache after node move
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `moving node ${nodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after moving node:`, cacheError.message);
    }

    res.json({
      message: `Node "${nodeName}" moved successfully to ${newPath}`,
      newPaths: moveResult
    });

  } catch (error) {
    console.error(`Error moving node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to move node: " + error.message });
  }
});

// Copy node to a new location with a new name
router.post('/nodes/:nodeName/copy', verifyJwt, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { newNodeName, newPath, copyData } = req.body;

    if (!newNodeName || typeof newNodeName !== 'string') {
      return res.status(400).json({ error: "New node name is required" });
    }

    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).json({ error: "New path is required" });
    }

    console.log(`📋 Copying node "${nodeName}" to "${newNodeName}" at: ${newPath}`);

    // Check if new node name already exists
    const existingMetadata = getConfig('nodeMetadata') || {};
    const nodeExists = Object.values(existingMetadata).some(m => m.name === newNodeName);
    if (nodeExists) {
      return res.status(409).json({
        error: `Node with name "${newNodeName}" already exists`,
        reason: 'node_name_exists'
      });
    }

    // Check if destination exists
    const fs = require('fs').promises;
    const destinationExists = await fs.access(newPath).then(() => true).catch(() => false);
    if (destinationExists) {
      return res.status(409).json({
        error: `Destination path "${newPath}" already exists`,
        reason: 'destination_exists'
      });
    }

    const copyResult = await clusterManager.copyNode(nodeName, newNodeName, newPath, copyData);
    
    // Add new node to configuration
    const currentNodes = getConfig('elasticsearchNodes') || [];
    const newNodeUrl = copyResult.nodeUrl;
    const updatedNodes = [...currentNodes, newNodeUrl];
    await setConfig('elasticsearchNodes', updatedNodes);

    // Store new node metadata
    const currentMetadata = getConfig('nodeMetadata') || {};
    currentMetadata[newNodeUrl] = {
      name: newNodeName,
      configPath: copyResult.configPath,
      servicePath: copyResult.servicePath,
      dataPath: copyResult.dataPath,
      logsPath: copyResult.logsPath,
      cluster: copyResult.cluster,
      host: copyResult.host,
      port: copyResult.port,
      transportPort: copyResult.transportPort,
      roles: copyResult.roles
    };
    await setConfig('nodeMetadata', currentMetadata);

    // Refresh persistent indices cache after node copy
    try {
      const config = getConfig();
      await refreshCacheAndSync(config, `copying node ${nodeName} to ${newNodeName}`);
    } catch (cacheError) {
      console.warn(`⚠️ Failed to refresh persistent indices cache after copying node:`, cacheError.message);
    }

    res.json({
      message: `Node "${nodeName}" copied successfully to "${newNodeName}"`,
      newNode: copyResult
    });

  } catch (error) {
    console.error(`Error copying node ${req.params.nodeName}:`, error);
    res.status(500).json({ error: "Failed to copy node: " + error.message });
  }
});

// Manual node metadata verification endpoint (for testing/manual cleanup)
router.post('/nodes/verify-metadata', verifyJwt, async (req, res) => {
  try {
    console.log('🔍 Manual node metadata verification requested');
    await clusterManager.verifyNodeMetadata();
    res.json({ 
      message: 'Node metadata verification completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during manual metadata verification:', error);
    res.status(500).json({ error: "Failed to verify node metadata: " + error.message });
  }
});

// GET node disk usage and stats
router.get("/nodes/:nodeName/stats", verifyJwt, async (req, res) => {
  try {
    console.log(`🔍 Retrieving stats for node: ${req.params.nodeName}`);
    const { nodeName } = req.params;
    
    // Get the Elasticsearch client
    const es = getES();
    
    // Get node stats specifically for this node
    const nodeStats = await es.nodes.stats({
      metric: ['fs', 'os', 'jvm'],
      node_id: nodeName
    });
    
    // If no stats found for the exact node name, try to find by node name
    let targetNodeStats = null;
    const nodeIds = Object.keys(nodeStats.nodes);
    
    if (nodeIds.length === 0) {
      // Try to find the node by name in the cluster
      const nodesInfo = await es.nodes.info();
      const nodeEntry = Object.entries(nodesInfo.nodes).find(([id, info]) => info.name === nodeName);
      
      if (nodeEntry) {
        const [nodeId] = nodeEntry;
        const specificStats = await es.nodes.stats({
          metric: ['fs', 'os', 'jvm'],
          node_id: nodeId
        });
        targetNodeStats = specificStats.nodes[nodeId];
      }
    } else {
      // Use the first (and likely only) node in the response
      targetNodeStats = nodeStats.nodes[nodeIds[0]];
    }
    
    if (!targetNodeStats) {
      return res.status(404).json({ error: `No statistics found for node "${nodeName}"` });
    }
    
    // Format disk information
    const diskInfo = targetNodeStats.fs && targetNodeStats.fs.data ? 
      targetNodeStats.fs.data.map(disk => ({
        path: disk.path,
        total: disk.total_in_bytes,
        free: disk.free_in_bytes,
        available: disk.available_in_bytes,
        used: disk.total_in_bytes - disk.free_in_bytes,
        usedPercent: Math.round(((disk.total_in_bytes - disk.free_in_bytes) / disk.total_in_bytes) * 100)
      })) : [];
    
    // Format OS information if available
    const osInfo = targetNodeStats.os ? {
      cpu: targetNodeStats.os.cpu,
      mem: targetNodeStats.os.mem,
      swap: targetNodeStats.os.swap
    } : null;
    
    // Format JVM information if available
    const jvmInfo = targetNodeStats.jvm ? {
      heap_used_percent: targetNodeStats.jvm.mem.heap_used_percent,
      heap_used: targetNodeStats.jvm.mem.heap_used_in_bytes,
      heap_max: targetNodeStats.jvm.mem.heap_max_in_bytes
    } : null;
    
    res.json({
      nodeName,
      diskInfo,
      osInfo,
      jvmInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Error getting node stats:", error);
    res.status(500).json({ error: "Failed to get node statistics: " + error.message });
  }
});


module.exports = router;
