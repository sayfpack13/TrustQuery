import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';

export const useClusterManagement = (showNotification) => {
  // State for locally managed node configurations
  const [localNodes, setLocalNodes] = useState([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [nodeActionLoading, setNodeActionLoading] = useState([]);

  // State for node creation/editing form
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
    ingest: true,
  });

  // Available clusters (derived from existing nodes + default)
  const clusters = useMemo(() => {
    const existingClusters = localNodes && Array.isArray(localNodes) ? [...new Set(localNodes.map(n => n.cluster || 'trustquery-cluster'))] : [];
    if (!existingClusters.includes('trustquery-cluster')) {
      existingClusters.unshift('trustquery-cluster');
    }
    return existingClusters;
  }, [localNodes]);

  // Use ref to store the notification function to avoid dependency changes
  const showNotificationRef = useRef(showNotification);
  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  // Fetch all locally managed node configurations
  const fetchLocalNodes = useCallback(async () => {
    setClusterLoading(true);
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes');
      setLocalNodes(response.data.nodes || []);
    } catch (error) {
      console.error('Error fetching local nodes:', error);
      showNotificationRef.current('error', 'Failed to fetch local node configuration', faExclamationTriangle);
    } finally {
      setClusterLoading(false);
    }
  }, []);

  // Reset form function
  const resetNodeForm = useCallback(() => {
    setNewNodeName('');
    setNewNodeHost('localhost');
    setNewNodePort('9200');
    setNewNodeTransportPort('9300');
    setNewNodeCluster('trustquery-cluster');
    setNewNodeDataPath('');
    setNewNodeLogsPath('');
    setNewNodeRoles({
      master: true,
      data: true,
      ingest: true,
    });
  }, []);

  const createLocalNode = useCallback(async (nodeConfig) => {
    try {
      const config = nodeConfig || {
        name: newNodeName,
        host: newNodeHost,
        port: parseInt(newNodePort),
        transportPort: parseInt(newNodeTransportPort),
        cluster: newNodeCluster,
        dataPath: newNodeDataPath,
        logsPath: newNodeLogsPath,
        roles: newNodeRoles
      };
      
      await axiosClient.post('/api/admin/cluster-advanced/nodes', config);
      showNotificationRef.current('success', `Node "${config.name}" created successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
      
      // Reset form if using form data
      if (!nodeConfig) {
        resetNodeForm();
      }
    } catch (error) {
      console.error('Error creating node:', error);
      showNotificationRef.current('error', `Failed to create node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
      throw error; // Re-throw to allow form to handle error state
    }
  }, [fetchLocalNodes, newNodeName, newNodeHost, newNodePort, newNodeTransportPort, newNodeCluster, newNodeDataPath, newNodeLogsPath, newNodeRoles, resetNodeForm]);

  const updateLocalNode = useCallback(async (nodeName, updates) => {
    try {
      await axiosClient.put(`/api/admin/cluster-advanced/nodes/${nodeName}`, updates);
      showNotificationRef.current('success', `Node "${nodeName}" updated successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
    } catch (error) {
      console.error('Error updating node:', error);
      showNotificationRef.current('error', `Failed to update node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
      throw error; // Re-throw
    }
  }, [fetchLocalNodes]);

  const handleDeleteLocalNode = async (nodeName) => {
    if (!window.confirm(`Are you sure you want to permanently delete node "${nodeName}" and all its data? This cannot be undone.`)) return;

    setNodeActionLoading(prev => [...prev, nodeName]);
    try {
      await axiosClient.delete(`/api/admin/cluster-advanced/nodes/${nodeName}`);
      showNotificationRef.current('success', `Node "${nodeName}" and its data deleted successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
    } catch (error) {
      console.error(`Error deleting node ${nodeName}:`, error);
      showNotificationRef.current('error', `Failed to delete node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const handleStartLocalNode = async (nodeName) => {
    setNodeActionLoading(prev => [...prev, nodeName]);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/start`);
      showNotificationRef.current('success', `Node "${nodeName}" is starting...`, faCheckCircle);
      // Optimistically update UI or wait for fetch
      setTimeout(fetchLocalNodes, 3000); // Give it a moment to start
    } catch (error) {
      console.error(`Error starting node ${nodeName}:`, error);
      showNotificationRef.current('error', `Failed to start node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const handleStopLocalNode = async (nodeName) => {
    setNodeActionLoading(prev => [...prev, nodeName]);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/stop`);
      showNotificationRef.current('success', `Node "${nodeName}" is stopping...`, faCheckCircle);
      // Optimistically update UI or wait for fetch
      setTimeout(fetchLocalNodes, 2000); // Give it a moment to stop
    } catch (error) {
      console.error(`Error stopping node ${nodeName}:`, error);
      showNotificationRef.current('error', `Failed to stop node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const createCluster = useCallback(async (clusterName) => {
    try {
      // For now, we'll just add it to the cluster list when a node is created with it
      // This could be extended to actually register clusters on the backend
      showNotificationRef.current('success', `Cluster "${clusterName}" will be created when first node is added`, faCheckCircle);
    } catch (error) {
      console.error('Error creating cluster:', error);
      showNotificationRef.current('error', `Failed to create cluster: ${error.message}`, faExclamationTriangle);
    }
  }, []);

  return {
    localNodes,
    clusterLoading,
    nodeActionLoading,
    fetchLocalNodes,
    createLocalNode,
    updateLocalNode,
    handleDeleteLocalNode,
    handleStartLocalNode,
    handleStopLocalNode,
    // Form state
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
    clusters,
    createCluster,
    resetNodeForm
  };
};
