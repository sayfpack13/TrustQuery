import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faServer, faInfoCircle, faFileAlt, faDatabase, faCircleInfo, faPlus, faTrash, faExclamationTriangle, faHdd, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../../../api/axiosClient';

export default function NodeDetailsModal({ show, onClose, node, formatBytes, enhancedNodesData = {}, onRefreshNodes, disabled = false }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [nodeIndices, setNodeIndices] = useState([]);
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [indicesError, setIndicesError] = useState(null);
  const [usingCachedData, setUsingCachedData] = useState(true);
  const [showCreateIndexForm, setShowCreateIndexForm] = useState(false);
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);
  const [isDeletingIndex, setIsDeletingIndex] = useState(null);
  const [isRefreshingIndices, setIsRefreshingIndices] = useState(false);
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexShards, setNewIndexShards] = useState('1');
  const [newIndexReplicas, setNewIndexReplicas] = useState('0');
  
  // Disk usage state
  const [diskStats, setDiskStats] = useState(null);
  const [diskStatsLoading, setDiskStatsLoading] = useState(false);
  const [diskStatsError, setDiskStatsError] = useState(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState(null);

  // Ref to track if a refresh operation is in progress to prevent race conditions
  const refreshInProgress = useRef(false);

  // Add validation for form inputs
  const isValidIndexName = newIndexName.trim().length > 0 && !/[A-Z\s]/.test(newIndexName);
  const isValidShards = parseInt(newIndexShards) > 0;
  const isValidReplicas = parseInt(newIndexReplicas) >= 0;
  const isFormValid = isValidIndexName && isValidShards && isValidReplicas;

  // Fetch cached indices from prop instead of API
  const fetchCachedNodeIndices = useCallback(() => {
    if (!node?.name) return;
    
    try {
      const nodeData = enhancedNodesData[node.name];
      
      if (nodeData && nodeData.indices) {
        // Convert indices object to array format expected by the UI
        const indicesArray = Array.isArray(nodeData.indices) 
          ? nodeData.indices 
          : Object.entries(nodeData.indices).map(([indexName, indexData]) => ({
              index: indexName,
              'docs.count': indexData.doc_count?.toString() || '0',
              'store.size': indexData.store_size ? `${indexData.store_size}b` : '0b',
              docCount: indexData.doc_count || 0,
              storeSize: indexData.store_size || 0,
              health: 'green', // Default value since cache doesn't store health
              status: 'open', // Default value since cache doesn't store status
              uuid: indexName, // Use index name as fallback UUID for cache
              creation: {
                date: {
                  string: new Date().toISOString() // Fallback date
                }
              }
            }));
        
        setNodeIndices(indicesArray);
        setUsingCachedData(!nodeData.isRunning); // Use cached data if node is not running
        setIndicesError(nodeData.error || null);
      } else {
        setNodeIndices([]);
        setIndicesError(nodeData?.error || 'No data available');
      }
    } catch (error) {
      console.error("Failed to load node indices", error);
      setIndicesError('Failed to load indices data');
      setNodeIndices([]);
    }
  }, [enhancedNodesData, node?.name]);

  // Fetch live indices directly from node (fallback or explicit refresh)  
  const fetchLiveNodeIndices = useCallback(async (showLoading = true) => {
    if (node) {
      if (showLoading) setIndicesLoading(true);
      setIndicesError(null);
      setUsingCachedData(false);
      
      try {
        const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/indices`);
        setNodeIndices(response.data || []);
      } catch (error) {
        console.error("Failed to load live node indices", error);
        setIndicesError(error.response?.data?.error || 'Failed to load indices');
        setNodeIndices([]);
      } finally {
        if (showLoading) setIndicesLoading(false);
      }
    }
  }, [node?.name]);

  // Primary fetch function - uses cached data by default
  const fetchNodeIndices = useCallback((showLoading = true, forceLive = false) => {
    if (forceLive) {
      return fetchLiveNodeIndices(showLoading);
    } else {
      if (showLoading) setIndicesLoading(true);
      try {
        fetchCachedNodeIndices();
      } catch (error) {
        console.error("Error in fetchNodeIndices:", error);
        setIndicesError('Failed to fetch indices data');
      } finally {
        if (showLoading) setIndicesLoading(false);
      }
    }
  }, [fetchLiveNodeIndices, fetchCachedNodeIndices]);

  // Manual refresh function for the retry button
  const handleManualRefresh = useCallback(async () => {
    if (refreshInProgress.current) return;
    
    setIsRefreshingIndices(true);
    refreshInProgress.current = true;
    
    try {
      if (node.isRunning) {
        // For running nodes, fetch live data first, then update cache
        await fetchLiveNodeIndices(false);
        
        // Trigger a centralized cache refresh
        if (onRefreshNodes) {
          await onRefreshNodes(true);
        }
      } else {
        // For offline nodes, just update from cached data
        fetchCachedNodeIndices();
      }
    } catch (error) {
      console.error("Manual refresh failed:", error);
      setIndicesError(error.response?.data?.error || 'Refresh failed');
    } finally {
      setIsRefreshingIndices(false);
      refreshInProgress.current = false;
    }
  }, [node?.isRunning, fetchLiveNodeIndices, fetchCachedNodeIndices, onRefreshNodes]);

  const fetchDiskStats = useCallback(async () => {
    if (node && node.isRunning) {
      setDiskStatsLoading(true);
      setDiskStatsError(null);
      
      try {
        const response = await axiosClient.get(`/api/admin/cluster-advanced/nodes/${node.name}/stats`);
        setDiskStats(response.data);
      } catch (error) {
        console.error("Failed to load disk stats", error);
        setDiskStatsError(error.response?.data?.error || 'Failed to load disk statistics');
        setDiskStats(null);
      } finally {
        setDiskStatsLoading(false);
      }
    } else {
      setDiskStats(null);
      setDiskStatsError(null);
    }
  }, [node?.name, node?.isRunning]);

  // Update indices when enhancedNodesData changes (for cached data updates)
  useEffect(() => {
    if (activeTab === 'indices' && node && !refreshInProgress.current) {
      fetchCachedNodeIndices();
    }
  }, [enhancedNodesData, activeTab, node?.name, fetchCachedNodeIndices]);

  // Primary tab content loading effect
  useEffect(() => {
    if (activeTab === 'configuration' && node) {
      const fetchConfig = async () => {
        setConfigLoading(true);
        try {
          const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/config`);
          setConfigContent(response.data);
        } catch (error) {
          setConfigContent('Failed to load configuration.');
        } finally {
          setConfigLoading(false);
        }
      };
      fetchConfig();
    } else if (activeTab === 'indices' && node && !refreshInProgress.current) {
      fetchNodeIndices();
    } else if (activeTab === 'overview' && node) {
      fetchDiskStats();
    }
  }, [activeTab, node?.name, fetchNodeIndices, fetchDiskStats]);

  // Hide create index form if node stops running
  useEffect(() => {
    if (node && !node.isRunning && showCreateIndexForm) {
      setShowCreateIndexForm(false);
    }
  }, [node?.isRunning, showCreateIndexForm]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!show) {
      setActiveTab('overview');
      setShowCreateIndexForm(false);
      setNewIndexName('');
      setNewIndexShards('1');
      setNewIndexReplicas('0');
      setShowDeleteModal(false);
      setIndexToDelete(null);
      setIndicesError(null);
      setIsDeletingIndex(null);
      setDiskStats(null);
      setDiskStatsError(null);
    }
  }, [show]);

  const handleCreateIndex = async () => {
    if (!isFormValid || refreshInProgress.current || isCreatingIndex) {
      return;
    }

    refreshInProgress.current = true;
    setIsCreatingIndex(true);
    setIndicesError(null); // Clear any previous errors
    
    try {
      const response = await axiosClient.post(`/api/admin/cluster-advanced/${node.name}/indices`, {
        indexName: newIndexName.trim(),
        shards: parseInt(newIndexShards),
        replicas: parseInt(newIndexReplicas),
      });
      
      // Reset form and close
      setShowCreateIndexForm(false);
      setNewIndexName('');
      setNewIndexShards('1');
      setNewIndexReplicas('0');
      
      // Backend already refreshes cache after index creation, so we:
      // 1. Get fresh live data for the modal immediately
      // 2. Wait briefly for backend to settle
      // 3. Refresh centralized data once to update other components
      
      // Get fresh live data for the modal immediately
      await fetchLiveNodeIndices(false);
      
      // Wait for backend cache update to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
      
      // Show success feedback (you could replace with a toast notification)
      console.log(`✅ Index '${newIndexName.trim()}' created successfully`);
    } catch (error) {
      console.error("Failed to create index", error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create index';
      setIndicesError(`Failed to create index: ${errorMessage}`);
      
      // Don't close the form on error, let user retry
      setShowCreateIndexForm(true);
    } finally {
      setIsCreatingIndex(false);
      refreshInProgress.current = false;
    }
  };

  const handleDeleteClick = (index) => {
    setIndexToDelete(index);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!indexToDelete || refreshInProgress.current || isDeletingIndex) {
      return;
    }

    refreshInProgress.current = true;
    setIsDeletingIndex(indexToDelete.index);
    setIndicesError(null); // Clear any previous errors
    
    try {
      // Use the correct node-specific API endpoint
      await axiosClient.delete(`/api/admin/cluster-advanced/${node.name}/indices/${indexToDelete.index}`);
      
      // Backend already refreshes cache after index deletion, so we:
      // 1. Update local modal state with fresh data
      // 2. Wait briefly for backend cache to settle
      // 3. Refresh centralized data once to update other components
      
      // Get fresh live data for the modal immediately
      await fetchLiveNodeIndices(false);
      
      // Wait for backend cache update to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
      
      // Show success feedback
      console.log(`✅ Index '${indexToDelete.index}' deleted successfully`);
    } catch (err) {
      console.error("Error deleting index", err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete index';
      setIndicesError(`Failed to delete index: ${errorMessage}`);
      
      // For delete errors, we might want to show an alert as well since it's a destructive operation
      alert(`Failed to delete index '${indexToDelete.index}': ${errorMessage}`);
    } finally {
      setShowDeleteModal(false);
      setIndexToDelete(null);
      setIsDeletingIndex(null);
      refreshInProgress.current = false;
    }
  };

  // Listen for cache refresh events - but don't trigger fetch if we just updated
  useEffect(() => {
    const handleCacheRefresh = () => {
      // Only refresh if we're not in the middle of a refresh operation
      if (activeTab === 'indices' && node && !refreshInProgress.current) {
        fetchCachedNodeIndices(); // Use cached data refresh instead of API call
      }
    };

    window.addEventListener('indicesCacheRefreshed', handleCacheRefresh);
    return () => {
      window.removeEventListener('indicesCacheRefreshed', handleCacheRefresh);
    };
  }, [activeTab, node, fetchCachedNodeIndices]); // Fixed dependencies

  if (!show || !node) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-neutral-700 p-4 rounded-lg">
                <h4 className="text-lg font-semibold text-white mb-2">Node Status</h4>
                <p className={`text-lg font-bold ${node.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                  {node.isRunning ? 'Running' : 'Stopped'}
                </p>
              </div>
              <div className="bg-neutral-700 p-4 rounded-lg">
                <h4 className="text-lg font-semibold text-white mb-2">Cluster</h4>
                <p className="text-lg text-neutral-300">{node.cluster || 'trustquery-cluster'}</p>
              </div>
              <div className="bg-neutral-700 p-4 rounded-lg col-span-1 md:col-span-2">
                <h4 className="text-lg font-semibold text-white mb-2">Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(node.roles).filter(([, enabled]) => enabled).map(([role]) => (
                    <span key={role} className="bg-primary text-white px-3 py-1 text-sm rounded-full">{role}</span>
                  ))}
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-xl font-semibold text-white mb-4 flex items-center">
                <FontAwesomeIcon icon={faHdd} className="mr-2" />
                Disk Usage
              </h4>
              {!node.isRunning ? (
                <div className="p-4 bg-amber-600 rounded-lg border border-amber-500">
                  <p className="text-amber-100 text-sm">Node must be running to view disk statistics.</p>
                </div>
              ) : diskStatsLoading ? (
                <div className="flex items-center text-neutral-400">
                  <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
                  Loading disk statistics...
                </div>
              ) : diskStatsError ? (
                <div className="p-4 bg-red-600 rounded-lg border border-red-500">
                  <p className="text-red-100 text-sm">{diskStatsError}</p>
                  <button
                    onClick={fetchDiskStats}
                    className="mt-2 bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : diskStats && diskStats.diskInfo && diskStats.diskInfo.length > 0 ? (
                <div className="space-y-3">
                  {diskStats.diskInfo.map((disk, index) => (
                    <div key={index} className="bg-neutral-700 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-white">{disk.path}</span>
                        <span className="text-sm text-neutral-300">{disk.usedPercent}% used</span>
                      </div>
                      <div className="w-full bg-neutral-800 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            disk.usedPercent > 90 ? 'bg-red-500' :
                            disk.usedPercent > 75 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${disk.usedPercent}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-neutral-400 mt-1">
                        <span>Used: {(disk.used / (1024**3)).toFixed(1)} GB</span>
                        <span>Free: {(disk.free / (1024**3)).toFixed(1)} GB</span>
                        <span>Total: {(disk.total / (1024**3)).toFixed(1)} GB</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-400">No disk usage information available.</p>
              )}
            </div>
          </div>
        );
      case 'indices':
        if (indicesLoading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading indices...
            </div>
          );
        }
        return (
          <div>
            {!node.isRunning && ( 
              <div className="mb-4 p-4 bg-amber-600 rounded-lg border border-amber-500">
                <div className="flex items-center space-x-3">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-100 text-xl" />
                  <div>
                    <h4 className="text-amber-100 font-semibold">Node Not Running</h4>
                    <p className="text-amber-200 text-sm">
                      Index operations are disabled. Start the node to manage indices.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {indicesError && (
              <div className="mb-4 p-4 bg-red-600 rounded-lg border border-red-500">
                <div className="flex items-start space-x-3">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-100 text-lg mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-red-100 font-semibold mb-1">Error Loading Indices</h4>
                    <p className="text-red-200 text-sm mb-2">
                      {indicesError}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleManualRefresh}
                        disabled={disabled || isRefreshingIndices || refreshInProgress.current}
                        className="bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded text-sm disabled:opacity-50 flex items-center"
                      >
                        <FontAwesomeIcon 
                          icon={faCircleNotch} 
                          className={`mr-1 ${isRefreshingIndices ? 'fa-spin' : ''}`} 
                        />
                        {isRefreshingIndices ? 'Retrying...' : 'Retry'}
                      </button>
                      {node.isRunning && (
                        <button
                          onClick={() => fetchLiveNodeIndices(true)}
                          disabled={disabled || indicesLoading || refreshInProgress.current}
                          className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          Force Live Fetch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center">
                Indices on {node.name}
                {(indicesLoading || isRefreshingIndices) && (
                  <FontAwesomeIcon icon={faCircleNotch} className="fa-spin ml-2 text-blue-400" />
                )}
              </h3>
              <div className="flex items-center space-x-2">
                {/* Cache status indicator */}
                <div className="flex items-center space-x-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    node.isRunning 
                      ? (usingCachedData ? 'bg-yellow-400' : 'bg-green-400')
                      : 'bg-blue-400'
                  }`}></span>
                  <span className="text-xs text-neutral-400">
                    {node.isRunning 
                      ? (usingCachedData ? 'Smart Cache' : 'Live') 
                      : 'Cached (Offline)'}
                  </span>
                </div>
                
                {/* Refresh button */}
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshingIndices || refreshInProgress.current}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  title="Refresh indices data"
                >
                  <FontAwesomeIcon 
                    icon={faCircleNotch} 
                    className={`mr-1 ${isRefreshingIndices ? 'fa-spin' : ''}`} 
                  />
                  {isRefreshingIndices ? 'Refreshing...' : 'Refresh'}
                </button>
                
                {/* Create index button */}
                {node.isRunning ? (
                  <button
                    onClick={() => setShowCreateIndexForm(!showCreateIndexForm)}
                    disabled={disabled || isCreatingIndex || refreshInProgress.current}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <FontAwesomeIcon 
                      icon={isCreatingIndex ? faCircleNotch : faPlus} 
                      className={`mr-2 ${isCreatingIndex ? 'fa-spin' : ''}`} 
                    />
                    {isCreatingIndex ? 'Creating...' : 'Create Index'}
                  </button>
                ) : (
                  <button
                    disabled
                    className="bg-gray-600 cursor-not-allowed text-gray-400 px-4 py-2 rounded-lg text-sm"
                    title="Start the node to create indices"
                  >
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Create Index
                  </button>
                )}
              </div>
            </div>
            
            {showCreateIndexForm && (
              <div className="bg-neutral-700 p-6 rounded-lg mb-4 shadow-lg border border-neutral-600 max-w-lg mx-auto">
                <h4 className="text-xl font-bold mb-4 text-primary flex items-center">
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  Create New Index
                </h4>
                <form onSubmit={e => { e.preventDefault(); handleCreateIndex(); }}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-200 mb-1" htmlFor="index-name">Index Name</label>
                    <input
                      id="index-name"
                      type="text"
                      value={newIndexName}
                      onChange={(e) => setNewIndexName(e.target.value)}
                      placeholder="e.g. logs-2025"
                      autoFocus
                      className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 transition-all ${
                        newIndexName && !isValidIndexName 
                          ? 'border-red-500 focus:ring-red-500' 
                          : 'border-neutral-600 focus:ring-blue-500'
                      }`}
                    />
                    {newIndexName && !isValidIndexName && (
                      <p className="text-red-400 text-xs mt-1">
                        Index name must be lowercase, no spaces or uppercase letters
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-1" htmlFor="index-shards">Shards</label>
                      <input
                        id="index-shards"
                        type="number"
                        value={newIndexShards}
                        onChange={(e) => setNewIndexShards(e.target.value)}
                        min="1"
                        className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 transition-all ${
                          !isValidShards 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-neutral-600 focus:ring-blue-500'
                        }`}
                      />
                      {!isValidShards && (
                        <p className="text-red-400 text-xs mt-1">Must be at least 1</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-1" htmlFor="index-replicas">Replicas</label>
                      <input
                        id="index-replicas"
                        type="number"
                        value={newIndexReplicas}
                        onChange={(e) => setNewIndexReplicas(e.target.value)}
                        min="0"
                        className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 transition-all ${
                          !isValidReplicas 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-neutral-600 focus:ring-blue-500'
                        }`}
                      />
                      {!isValidReplicas && (
                        <p className="text-red-400 text-xs mt-1">Must be 0 or greater</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowCreateIndexForm(false)}
                      className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 text-white font-medium transition-colors"
                      disabled={isCreatingIndex}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded bg-primary hover:bg-blue-500 text-white font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600 flex items-center gap-2"
                      disabled={disabled || isCreatingIndex || !node.isRunning || !isFormValid}
                      title={
                        !node.isRunning ? "Node must be running to create indices" : 
                        !isFormValid ? "Please fix validation errors" : ""
                      }
                    >
                      {isCreatingIndex ? <FontAwesomeIcon icon={faCircleNotch} spin /> : <FontAwesomeIcon icon={faPlus} />} 
                      {isCreatingIndex ? 'Creating...' : 'Create Index'}
                    </button>
                  </div>
                </form>
              </div>
            )}
            
            <div className="relative">
              <table className="w-full text-neutral-100 bg-neutral-600 rounded-lg">
                <thead className="bg-neutral-500">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">Health</th>
                    <th className="text-left py-3 px-4 font-semibold">Index</th>
                    <th className="text-left py-3 px-4 font-semibold">Docs</th>
                    <th className="text-left py-3 px-4 font-semibold">Storage</th>
                    <th className="text-left py-3 px-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nodeIndices.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-neutral-400">
                        {indicesLoading || isRefreshingIndices ? (
                          <div className="flex items-center justify-center">
                            <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
                            Loading indices...
                          </div>
                        ) : indicesError ? (
                          'Error loading indices - see message above'
                        ) : (
                          'No indices found on this node'
                        )}
                      </td>
                    </tr>
                  ) : (
                    nodeIndices.map(index => (
                      <tr key={index.uuid || index.index} className="border-b border-neutral-500">
                        <td className="py-3 px-4">
                          <span className={`inline-block w-3 h-3 rounded-full ${
                            index.health === 'green' ? 'bg-green-500' : 
                            index.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                          }`}></span>
                        </td>
                        <td className="py-3 px-4 font-medium">{index.index}</td>
                        <td className="py-3 px-4">
                          {(index.docCount !== undefined 
                            ? index.docCount 
                            : parseInt(index['docs.count'], 10) || 0
                          ).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">{index['store.size'] || '0b'}</td>
                        <td className="py-3 px-4">
                          <button 
                            onClick={() => handleDeleteClick(index)} 
                            className="text-red-500 hover:text-red-400 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors p-1"
                            disabled={disabled || !node.isRunning || isDeletingIndex === index.index || isCreatingIndex || refreshInProgress.current}
                            title={
                              !node.isRunning ? "Start the node to delete indices" : 
                              isDeletingIndex === index.index ? "Deleting..." : 
                              isCreatingIndex ? "Wait for index creation to complete" :
                              refreshInProgress.current ? "Wait for refresh to complete" :
                              "Delete index"
                            }
                          >
                            {isDeletingIndex === index.index ? (
                              <FontAwesomeIcon icon={faCircleNotch} spin />
                            ) : (
                              <FontAwesomeIcon icon={faTrash} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              
              {/* Loading overlay for table updates */}
              {(indicesLoading || isRefreshingIndices) && nodeIndices.length > 0 && (
                <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center rounded-lg">
                  <div className="bg-neutral-800 px-4 py-2 rounded-lg border border-neutral-600 flex items-center">
                    <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2 text-blue-400" />
                    <span className="text-white text-sm">Updating indices...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Last update timestamp */}
            {nodeIndices.length > 0 && (
              <div className="text-xs text-neutral-400 mt-2 text-right">
                {node.isRunning 
                  ? `Live data • Updated: ${new Date().toLocaleTimeString()}`
                  : `Cached data • Node offline`
                }
              </div>
            )}
          </div>
        );
      case 'configuration':
        if (configLoading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading configuration...
            </div>
          );
        }
        return (
          <div>
            <h3 className="text-xl font-semibold text-white mb-4">elasticsearch.yml</h3>
            <pre className="bg-neutral-900 p-4 rounded-lg text-sm text-neutral-300 overflow-x-auto">
              <code>{configContent}</code>
            </pre>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
        <div className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-neutral-600">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-neutral-700">
            <h2 className="text-2xl font-semibold text-white flex items-center">
              <FontAwesomeIcon icon={faServer} className="mr-3 text-primary" />
              Manage Node: {node.name}
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
              <FontAwesomeIcon icon={faTimes} size="lg" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-700">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'overview' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('indices')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'indices' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faDatabase} className="mr-2" />
              Indices
            </button>
            <button
              onClick={() => setActiveTab('configuration')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'configuration' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faFileAlt} className="mr-2" />
              Configuration
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
          <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-3 text-red-500" />
              Confirm Deletion
            </h3>
            <p className="text-neutral-300 mb-6">
              Are you sure you want to delete the index <span className="font-bold text-white">{indexToDelete?.index}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg">
                Delete
              </button>
                            <button onClick={() => setShowDeleteModal(false)} className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}