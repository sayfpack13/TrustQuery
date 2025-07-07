import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { faExclamationTriangle, faCheckCircle, faCircleNotch } from '@fortawesome/free-solid-svg-icons';

export const useClusterManagement = (showNotification, onCacheRefreshed = null) => {
  // State for locally managed node configurations
  const [localNodes, setLocalNodes] = useState([]);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [nodeActionLoading, setNodeActionLoading] = useState([]);
  const [enhancedNodesData, setEnhancedNodesData] = useState({});

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

  // Memory management state
  const [newNodeHeapSize, setNewNodeHeapSize] = useState('');
  const [systemMemoryInfo, setSystemMemoryInfo] = useState(null);

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
  const fetchLocalNodes = useCallback(async (forceRefresh = false) => {
    setClusterLoading(true);
    try {
      const url = forceRefresh 
        ? '/api/admin/cluster-advanced/local-nodes?forceRefresh=true'
        : '/api/admin/cluster-advanced/local-nodes';
      const response = await axiosClient.get(url);
      setLocalNodes(response.data.nodes || []);
      setEnhancedNodesData(response.data.indicesByNodes || {});
    } catch (error) {
      console.error('Error fetching local nodes:', error);
      showNotificationRef.current('error', 'Failed to fetch local node configuration', faExclamationTriangle);
    } finally {
      setClusterLoading(false);
    }
  }, []);

  // Fetch system memory info
  const fetchSystemMemoryInfo = useCallback(async () => {
    try {
      const response = await axiosClient.get('/api/setup-wizard/system-memory');
      if (response.data && response.data.success) {
        setSystemMemoryInfo(response.data.memory);
      }
    } catch (error) {
      console.error('Error fetching system memory info:', error);
      showNotificationRef.current('error', 'Failed to fetch system memory information', faExclamationTriangle);
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
    setNewNodeHeapSize(''); // Reset heap size
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
        roles: newNodeRoles,
        heapSize: newNodeHeapSize // Add heap size to config
      };
      
      console.log('createLocalNode called with config:', config);
      
      const response = await axiosClient.post('/api/admin/cluster-advanced/nodes', config);
      console.log('Node creation response:', response.data);
      
      showNotificationRef.current('success', `Node "${config.name}" created successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
      
      // Reset form if using form data
      if (!nodeConfig) {
        resetNodeForm();
      }
    } catch (error) {
      console.error('Error creating node:', error);
      console.error('Error response:', error.response?.data);
      showNotificationRef.current('error', `Failed to create node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
      throw error; // Re-throw to allow form to handle error state
    }
  }, [fetchLocalNodes, newNodeName, newNodeHost, newNodePort, newNodeTransportPort, newNodeCluster, newNodeDataPath, newNodeLogsPath, newNodeRoles, newNodeHeapSize, resetNodeForm]);

  const updateLocalNode = useCallback(async (nodeName, updates) => {
    try {
      // Ensure heapSize is included in the updates if provided
      const updatesWithHeapSize = {
        ...updates,
        heapSize: updates.heapSize || newNodeHeapSize // Use provided heapSize or current state
      };
      
      await axiosClient.put(`/api/admin/cluster-advanced/nodes/${nodeName}`, updatesWithHeapSize);
      showNotificationRef.current('success', `Node "${nodeName}" updated successfully`, faCheckCircle);
      fetchLocalNodes(); // Refresh list
    } catch (error) {
      console.error('Error updating node:', error);
      
      // Handle validation conflicts specifically
      if (error.response?.status === 409 && error.response?.data?.conflicts) {
        // This is a validation error with conflicts - re-throw it so the component can handle it
        const validationError = new Error('Validation failed');
        validationError.validationData = error.response.data;
        throw validationError;
      } else if (error.response?.status === 409 && error.response?.data?.reason === 'node_running') {
        // Handle running node error specifically
        showNotificationRef.current('error', error.response?.data?.error || 'Cannot update running node', faExclamationTriangle);
        throw error; // Re-throw
      } else {
        // Handle other types of errors
        showNotificationRef.current('error', `Failed to update node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
        throw error; // Re-throw
      }
    }
  }, [fetchLocalNodes, newNodeHeapSize]);

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
      showNotificationRef.current('info', `Starting node "${nodeName}"...`, faCircleNotch, true);
      
      // Call the start endpoint
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/start`);
      
      // Poll for actual running status instead of using timeout
      const pollForNodeStart = async (maxAttempts = 20, interval = 3000) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, interval));
          
          try {
            // Use cached data for polling to reduce load
            const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes?forceRefresh=false');
            const freshNodes = response.data.nodes || [];
            const freshEnhancedData = response.data.indicesByNodes || {};
            
            // Update state with fresh data
            setLocalNodes(freshNodes);
            setEnhancedNodesData(freshEnhancedData);
            
            const targetNode = freshNodes.find(n => n.name === nodeName);
            
            if (targetNode?.isRunning) {
              showNotificationRef.current('success', `Node "${nodeName}" started successfully!`, faCheckCircle);
              
              // Cache will be automatically refreshed on next data access
              if (onCacheRefreshed) {
                onCacheRefreshed();
              }
              
              return true;
            }
          } catch (error) {
            console.warn(`Poll attempt ${attempt + 1} failed:`, error);
          }
        }
        
        // If we get here, the node didn't start within the timeout
        showNotificationRef.current('error', `Node "${nodeName}" failed to start within expected time. Check logs for details.`, faExclamationTriangle);
        await fetchLocalNodes(); // Final refresh to get actual status
        return false;
      };
      
      // Start polling and wait for result
      await pollForNodeStart();
      
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
      showNotificationRef.current('info', `Stopping node "${nodeName}"...`, faCircleNotch, true);
      
      // Call the stop endpoint
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/stop`);
      
      // Poll for actual stopped status instead of using timeout
      const pollForNodeStop = async (maxAttempts = 10, interval = 2000) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, interval));
          
          try {
            // Use cached data for polling to reduce load
            const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes?forceRefresh=false');
            const freshNodes = response.data.nodes || [];
            const freshEnhancedData = response.data.indicesByNodes || {};
            
            // Update state with fresh data
            setLocalNodes(freshNodes);
            setEnhancedNodesData(freshEnhancedData);
            
            const targetNode = freshNodes.find(n => n.name === nodeName);
            
            if (!targetNode?.isRunning) {
              showNotificationRef.current('success', `Node "${nodeName}" stopped successfully!`, faCheckCircle);
              return true;
            }
          } catch (error) {
            console.warn(`Poll attempt ${attempt + 1} failed:`, error);
          }
        }
        
        // If we get here, the node didn't stop within the timeout
        showNotificationRef.current('error', `Node "${nodeName}" failed to stop within expected time. It may still be running.`, faExclamationTriangle);
        await fetchLocalNodes(); // Final refresh to get actual status
        return false;
      };
      
      // Start polling and wait for result
      await pollForNodeStop();
      
    } catch (error) {
      console.error(`Error stopping node ${nodeName}:`, error);
      showNotificationRef.current('error', `Failed to stop node: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
    } finally {
      setNodeActionLoading(prev => prev.filter(name => name !== nodeName));
    }
  };

  const getNodeDetails = useCallback(async (nodeName) => {
    if (!nodeName) {
      console.error('getNodeDetails called with empty nodeName');
      throw new Error('Node name is required');
    }
    
    try {
      console.log(`Fetching details for node: ${nodeName}`);
      const response = await axiosClient.get(`/api/admin/cluster-advanced/nodes/${nodeName}`);
      console.log('Node details response:', response.data);
      return response.data;
    } catch (error) {
      console.error(`Error fetching details for node ${nodeName}:`, error);
      showNotificationRef.current('error', `Failed to fetch node details: ${error.response?.data?.error || error.message}`, faExclamationTriangle);
      throw error; // Re-throw for handling in the component
    }
  }, []);

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

  // Move node to a new location
  const moveNode = useCallback(async (nodeName, newPath, preserveData = true) => {
    try {
      showNotificationRef.current('info', `Moving node "${nodeName}"...`, faCircleNotch);
      
      const response = await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/move`, {
        newPath,
        preserveData
      });
      
      // Refresh the local nodes list to reflect the change
      await fetchLocalNodes();
      
      showNotificationRef.current('success', response.data.message, faCheckCircle);
      return response.data;
    } catch (error) {
      console.error(`Error moving node ${nodeName}:`, error);
      const errorMessage = error.response?.data?.error || error.message;
      showNotificationRef.current('error', `Failed to move node: ${errorMessage}`, faExclamationTriangle);
      throw error;
    }
  }, [fetchLocalNodes]);

  // Copy node to a new location with a new name
  const copyNode = useCallback(async (nodeName, newNodeName, newPath, copyData = false) => {
    try {
      showNotificationRef.current('info', `Copying node "${nodeName}" to "${newNodeName}"...`, faCircleNotch);
      
      const response = await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/copy`, {
        newNodeName,
        newPath,
        copyData
      });
      
      // Refresh the local nodes list to reflect the new node
      await fetchLocalNodes();
      
      showNotificationRef.current('success', response.data.message, faCheckCircle);
      return response.data;
    } catch (error) {
      console.error(`Error copying node ${nodeName}:`, error);
      const errorMessage = error.response?.data?.error || error.message;
      showNotificationRef.current('error', `Failed to copy node: ${errorMessage}`, faExclamationTriangle);
      throw error;
    }
  }, [fetchLocalNodes]);

  return {
    localNodes,
    enhancedNodesData,
    clusterLoading,
    nodeActionLoading,
    fetchLocalNodes,
    createLocalNode,
    updateLocalNode,
    handleDeleteLocalNode,
    handleStartLocalNode,
    handleStopLocalNode,
    getNodeDetails,
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
    newNodeHeapSize,
    setNewNodeHeapSize,
    systemMemoryInfo,
    fetchSystemMemoryInfo,
    clusters,
    createCluster,
    resetNodeForm,
    moveNode,
    copyNode
  };
};
