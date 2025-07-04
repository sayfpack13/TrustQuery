import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';

export const useClusterManagement = (showNotification) => {
  // State for locally managed node configurations
  const [localNodes, setLocalNodes] = useState([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [nodeActionLoading, setNodeActionLoading] = useState([]);

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

  const createLocalNode = useCallback(async (nodeConfig) => {
    try {
      await axiosClient.post('/api/admin/cluster-advanced/nodes', nodeConfig);
      showNotificationRef.current('success', `Node "${nodeConfig.name}" created successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
    } catch (error) {
      console.error('Error creating node:', error);
      showNotificationRef.current('error', `Failed to create node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
      throw error; // Re-throw to allow form to handle error state
    }
  }, [fetchLocalNodes]);

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

  return {
    localNodes,
    clusterLoading,
    nodeActionLoading,
    fetchLocalNodes,
    createLocalNode,
    updateLocalNode,
    handleDeleteLocalNode,
    handleStartLocalNode,
    handleStopLocalNode
  };
};
