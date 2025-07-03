import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';

export const useClusterManagement = (showNotification) => {
  // Local node management state - primary focus
  const [localNodes, setLocalNodes] = useState([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusters, setClusters] = useState([]); // Available clusters
  const [selectedCluster, setSelectedCluster] = useState('');
  
  // Node creation/editing state
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeHost, setNewNodeHost] = useState('localhost');
  const [newNodePort, setNewNodePort] = useState('9200');
  const [newNodeTransportPort, setNewNodeTransportPort] = useState('9300');
  const [newNodeCluster, setNewNodeCluster] = useState('trustquery-cluster');
  const [newNodeDataPath, setNewNodeDataPath] = useState('');
  const [newNodeLogsPath, setNewNodeLogsPath] = useState('');
  const [newNodeRoles, setNewNodeRoles] = useState({
    master: true,
    data: true,
    ingest: true
  });
  
  // Optional Elasticsearch cluster info (when available)
  const [clusterInfo, setClusterInfo] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [nodeStats, setNodeStats] = useState({});
  const [nodeDisks, setNodeDisks] = useState({});
  const [diskPreferences, setDiskPreferences] = useState({});
  
  // Legacy compatibility
  const [newNodeUrl, setNewNodeUrl] = useState("");
  const [selectedNodeForDisks, setSelectedNodeForDisks] = useState("");
  const [newClusterName, setNewClusterName] = useState("");

  // Use ref to store the notification function to avoid dependency changes
  const showNotificationRef = useRef(showNotification);
  
  // Update ref when showNotification changes
  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  // LOCAL NODE MANAGEMENT - Primary Functions
  const fetchLocalNodes = useCallback(async () => {
    setClusterLoading(true);
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes');
      const configuredNodes = response.data.nodes || [];
      
      // Extract available clusters from nodes
      const availableClusters = [...new Set(configuredNodes.map(node => node.cluster || 'trustquery-cluster'))];
      setClusters(availableClusters);
      
      // Set default cluster if none selected
      if (!selectedCluster && availableClusters.length > 0) {
        setSelectedCluster(availableClusters[0]);
      }
      
      setLocalNodes(configuredNodes);
      
      // Optionally try to get live cluster info, but don't fail if unavailable
      try {
        const clusterResponse = await axiosClient.get('/api/admin/cluster');
        setClusterInfo(clusterResponse.data);
        setNodes(Object.values(clusterResponse.data.nodes || {}));
        setNodeDisks(clusterResponse.data.nodeDisks || {});
      } catch (clusterError) {
        console.log('Elasticsearch cluster not available (nodes can still be managed locally)');
        setClusterInfo(null);
        setNodes([]);
        setNodeDisks({});
      }
    } catch (error) {
      console.error('Error fetching local nodes:', error);
      showNotificationRef.current('error', 'Failed to fetch local node configuration', faExclamationTriangle);
    } finally {
      setClusterLoading(false);
    }
  }, [selectedCluster]); // Only depend on selectedCluster

  const createLocalNode = useCallback(async () => {
    if (!newNodeName.trim()) {
      showNotificationRef.current('error', 'Node name is required', faExclamationTriangle);
      return;
    }
    
    // Generate default paths if not provided
    const dataPath = newNodeDataPath || `C:\\elasticsearch\\${newNodeName}\\data`;
    const logsPath = newNodeLogsPath || `C:\\elasticsearch\\${newNodeName}\\logs`;
    
    const nodeConfig = {
      name: newNodeName,
      cluster: newNodeCluster,
      host: newNodeHost,
      port: newNodePort,
      transportPort: newNodeTransportPort,
      dataPath,
      logsPath,
      roles: newNodeRoles
    };
    
    try {
      await axiosClient.post('/api/admin/cluster-advanced/nodes', nodeConfig);
      showNotificationRef.current('success', `Node "${newNodeName}" created successfully`, faCheckCircle);
      
      // Reset form
      setNewNodeName('');
      setNewNodeHost('localhost');
      setNewNodePort('9200');
      setNewNodeTransportPort('9300');
      setNewNodeDataPath('');
      setNewNodeLogsPath('');
      setNewNodeRoles({ master: true, data: true, ingest: true });
      
      fetchLocalNodes();
    } catch (error) {
      console.error('Error creating node:', error);
      showNotificationRef.current('error', `Failed to create node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    }
  }, [newNodeName, newNodeCluster, newNodeHost, newNodePort, newNodeTransportPort, newNodeDataPath, newNodeLogsPath, newNodeRoles, fetchLocalNodes]);

  const updateLocalNode = useCallback(async (nodeName, updates) => {
    try {
      await axiosClient.put(`/api/admin/cluster-advanced/nodes/${nodeName}`, updates);
      showNotificationRef.current('success', `Node "${nodeName}" updated successfully`, faCheckCircle);
      fetchLocalNodes();
    } catch (error) {
      console.error('Error updating node:', error);
      showNotificationRef.current('error', `Failed to update node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    }
  }, [fetchLocalNodes]);

  const changeNodeCluster = useCallback(async (nodeName, newCluster) => {
    try {
      await axiosClient.put(`/api/admin/cluster-advanced/nodes/${nodeName}/cluster`, { cluster: newCluster });
      showNotificationRef.current('success', `Node "${nodeName}" moved to cluster "${newCluster}"`, faCheckCircle);
      fetchLocalNodes();
    } catch (error) {
      console.error('Error changing node cluster:', error);
      showNotificationRef.current('error', `Failed to change node cluster: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    }
  }, [fetchLocalNodes]);

  const createCluster = useCallback(async (clusterName) => {
    if (!clusterName.trim()) {
      showNotificationRef.current('error', 'Cluster name is required', faExclamationTriangle);
      return;
    }
    
    try {
      await axiosClient.post('/api/admin/cluster-advanced/clusters', { name: clusterName });
      showNotificationRef.current('success', `Cluster "${clusterName}" created successfully`, faCheckCircle);
      
      // Add to local clusters list
      setClusters(prev => [...prev, clusterName]);
      setSelectedCluster(clusterName);
      
      fetchLocalNodes();
    } catch (error) {
      console.error('Error creating cluster:', error);
      showNotificationRef.current('error', `Failed to create cluster: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    }
  }, [fetchLocalNodes]);

  // OPTIONAL: Legacy cluster info functions (when Elasticsearch is running)
  const fetchClusterInfo = useCallback(async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster');
      setClusterInfo(response.data);
      setNodes(Object.values(response.data.nodes));
      setNodeDisks(response.data.nodeDisks);
      setNewClusterName(response.data.clusterName);
    } catch (error) {
      console.warn('Elasticsearch cluster not accessible (this is OK if nodes are managed locally):', error);
      setClusterInfo(null);
      setNodes([]);
      setNodeDisks({});
    }
  }, []);

  const fetchNodeStats = useCallback(async () => {
    try {
      const response = await axiosClient.get('/api/admin/nodes');
      setNodeStats(response.data.stats);
    } catch (error) {
      console.warn('Node stats not available:', error);
    }
  }, []);

  const fetchDiskPreferences = useCallback(async () => {
    try {
      const preferences = {};
      for (const node of nodes) {
        const response = await axiosClient.get(`/api/admin/disks/preferred/${node.id}`);
        preferences[node.id] = response.data.preferred;
      }
      setDiskPreferences(preferences);
    } catch (error) {
      console.warn('Disk preferences not available:', error);
    }
  }, [nodes]);

  const handleSetClusterName = async () => {
    if (!newClusterName.trim()) return;
    
    try {
      await axiosClient.post('/api/admin/cluster/name', { clusterName: newClusterName });
      showNotificationRef.current('success', 'Cluster name updated successfully', faCheckCircle);
      fetchClusterInfo();
    } catch (error) {
      console.error('Error setting cluster name:', error);
      showNotificationRef.current('error', 'Failed to update cluster name', faExclamationTriangle);
    }
  };

  const handleAddNode = async () => {
    if (!newNodeUrl.trim()) return;
    
    try {
      await axiosClient.post('/api/admin/nodes', { nodeUrl: newNodeUrl });
      showNotificationRef.current('success', 'Node added successfully', faCheckCircle);
      setNewNodeUrl("");
      fetchClusterInfo();
      fetchLocalNodes();
    } catch (error) {
      console.error('Error adding node:', error);
      showNotificationRef.current('error', 'Failed to add node', faExclamationTriangle);
    }
  };

  const handleRemoveNode = async (nodeUrl) => {
    if (!window.confirm(`Are you sure you want to remove node ${nodeUrl}?`)) return;
    
    try {
      await axiosClient.delete('/api/admin/nodes', { data: { nodeUrl } });
      showNotificationRef.current('success', 'Node removed successfully', faCheckCircle);
      fetchClusterInfo();
      fetchLocalNodes();
    } catch (error) {
      console.error('Error removing node:', error);
      showNotificationRef.current('error', 'Failed to remove node', faExclamationTriangle);
    }
  };

  const [nodeActionLoading, setNodeActionLoading] = useState([]);

  const handleStartLocalNode = async (nodeName) => {
    setNodeActionLoading(prev => [...prev, nodeName]);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/start`);
      showNotificationRef.current('success', `Node "${nodeName}" started successfully`, faCheckCircle);
      fetchLocalNodes();
      fetchClusterInfo();
    } catch (error) {
      console.error('Error starting node:', error);
      showNotificationRef.current('error', `Failed to start node "${nodeName}"`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const handleStopLocalNode = async (nodeName) => {
    setNodeActionLoading(prev => [...prev, nodeName]);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/stop`);
      showNotificationRef.current('success', `Node "${nodeName}" stopped successfully`, faCheckCircle);
      fetchLocalNodes();
      fetchClusterInfo();
    } catch (error) {
      console.error('Error stopping node:', error);
      showNotificationRef.current('error', `Failed to stop node "${nodeName}"`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const handleDeleteLocalNode = async (nodeName) => {
    if (!window.confirm(`Are you sure you want to delete node "${nodeName}"? This will remove all configuration files and data.`)) return;
    
    try {
      await axiosClient.delete(`/api/admin/cluster-advanced/nodes/${nodeName}`);
      showNotificationRef.current('success', `Node "${nodeName}" deleted successfully`, faCheckCircle);
      fetchLocalNodes();
      fetchClusterInfo();
    } catch (error) {
      console.error('Error deleting node:', error);
      showNotificationRef.current('error', `Failed to delete node "${nodeName}"`, faExclamationTriangle);
    }
  };

  const handleSetWriteNode = async (nodeUrl) => {
    try {
      await axiosClient.post('/api/admin/nodes/write', { nodeUrl });
      showNotificationRef.current('success', 'Write node updated successfully', faCheckCircle);
      fetchClusterInfo();
    } catch (error) {
      console.error('Error setting write node:', error);
      showNotificationRef.current('error', 'Failed to set write node', faExclamationTriangle);
    }
  };

  const handleSetPreferredDisk = async (nodeId, diskPath) => {
    try {
      await axiosClient.post('/api/admin/disks/preferred', { nodeId, diskPath });
      showNotificationRef.current('success', 'Preferred disk path set successfully', faCheckCircle);
      fetchDiskPreferences();
    } catch (error) {
      console.error('Error setting preferred disk:', error);
      showNotificationRef.current('error', 'Failed to set preferred disk path', faExclamationTriangle);
    }
  };

  return useMemo(() => ({
    // Primary Local Node Management State
    localNodes,
    clusters,
    selectedCluster,
    setSelectedCluster,
    
    // Node Creation/Editing State
    newNodeName,
    setNewNodeName,
    newNodeHost,
    setNewNodeHost,
    newNodePort,
    setNewNodePort,
    newNodeTransportPort,
    setNewNodeTransportPort,
    newNodeCluster,
    setNewNodeCluster,
    newNodeDataPath,
    setNewNodeDataPath,
    newNodeLogsPath,
    setNewNodeLogsPath,
    newNodeRoles,
    setNewNodeRoles,
    
    // Primary Local Node Management Functions
    fetchLocalNodes,
    createLocalNode,
    updateLocalNode,
    changeNodeCluster,
    createCluster,
    handleStartLocalNode,
    handleStopLocalNode,
    handleDeleteLocalNode,
    
    // Loading State
    clusterLoading,
    
    // Optional Elasticsearch Cluster State (when available)
    clusterInfo,
    nodes,
    nodeStats,
    nodeDisks,
    diskPreferences,
    
    // Legacy compatibility state
    newNodeUrl,
    selectedNodeForDisks,
    newClusterName,
    
    // Legacy compatibility setters
    setNewNodeUrl,
    setSelectedNodeForDisks,
    setNewClusterName,
    
    // Optional/Legacy functions
    fetchClusterInfo,
    fetchNodeStats,
    fetchDiskPreferences,
    handleSetClusterName,
    handleAddNode,
    handleRemoveNode,
    handleSetWriteNode,
    handleSetPreferredDisk,
    
    // New state
    nodeActionLoading,
  }), [
    // Primary state
    localNodes,
    clusters,
    selectedCluster,
    
    // Node creation state
    newNodeName,
    newNodeHost,
    newNodePort,
    newNodeTransportPort,
    newNodeCluster,
    newNodeDataPath,
    newNodeLogsPath,
    newNodeRoles,
    
    // Primary functions
    fetchLocalNodes,
    createLocalNode,
    updateLocalNode,
    changeNodeCluster,
    createCluster,
    handleStartLocalNode,
    handleStopLocalNode,
    handleDeleteLocalNode,
    
    // Loading
    clusterLoading,
    
    // Optional state
    clusterInfo,
    nodes,
    nodeStats,
    nodeDisks,
    diskPreferences,
    
    // Legacy state
    newNodeUrl,
    selectedNodeForDisks,
    newClusterName,
    
    // Optional functions
    fetchClusterInfo,
    fetchNodeStats,
    fetchDiskPreferences,
    handleSetClusterName,
    handleAddNode,
    handleRemoveNode,
    handleSetWriteNode,
    handleSetPreferredDisk,
    
    // New state
    nodeActionLoading,
  ]);
};
