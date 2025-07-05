import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faServer, faInfoCircle, faFileAlt, faDatabase, faCircleNotch, faHdd, faPlus, faTrash, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../../../api/axiosClient';

export default function NodeDetailsModal({ show, onClose, node, onCacheRefreshed }) {
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
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexShards, setNewIndexShards] = useState('1');
  const [newIndexReplicas, setNewIndexReplicas] = useState('0');
  
  // Disk usage state
  const [diskStats, setDiskStats] = useState(null);
  const [diskStatsLoading, setDiskStatsLoading] = useState(false);
  const [diskStatsError, setDiskStatsError] = useState(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState(null);

  // Remove the useElasticsearchManagement hook since we'll use direct API calls
  // const { deleteIndex, pollTask } = useElasticsearchManagement(console.log);

  // Add validation for form inputs
  const isValidIndexName = newIndexName.trim().length > 0 && !/[A-Z\s]/.test(newIndexName);
  const isValidShards = parseInt(newIndexShards) > 0;
  const isValidReplicas = parseInt(newIndexReplicas) >= 0;
  const isFormValid = isValidIndexName && isValidShards && isValidReplicas;

  // Fetch cached indices from backend
  const fetchCachedNodeIndices = async () => {
    try {
      const response = await axiosClient.get("/api/admin/cluster-advanced/local-nodes");
      const indicesByNodes = response.data.indicesByNodes || {};
      const nodeData = indicesByNodes[node.name];
      
      if (nodeData && nodeData.indices) {
        setNodeIndices(nodeData.indices);
        setUsingCachedData(true);
        setIndicesError(nodeData.error || null);
      } else {
        setNodeIndices([]);
        setIndicesError(nodeData?.error || 'No cached data available');
      }
    } catch (error) {
      console.error("Failed to load cached indices", error);
      setIndicesError('Failed to load cached indices data');
      setNodeIndices([]);
    }
  };

  // Fetch live indices directly from node (fallback or explicit refresh)  
  const fetchLiveNodeIndices = async (showLoading = true) => {
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
  };

  // Primary fetch function - uses cached data by default
  const fetchNodeIndices = async (showLoading = true, forceLive = false) => {
    if (forceLive) {
      await fetchLiveNodeIndices(showLoading);
    } else {
      if (showLoading) setIndicesLoading(true);
      await fetchCachedNodeIndices();
      if (showLoading) setIndicesLoading(false);
    }
  };

  const fetchDiskStats = async () => {
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
  };

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
    } else if (activeTab === 'indices' && node) {
      fetchNodeIndices();
    } else if (activeTab === 'overview' && node) {
      fetchDiskStats();
    }
  }, [activeTab, node]);

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
    if (!isFormValid) {
      return;
    }

    setIsCreatingIndex(true);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/${node.name}/indices`, {
        indexName: newIndexName.trim(),
        shards: parseInt(newIndexShards),
        replicas: parseInt(newIndexReplicas),
      });
      
      // Reset form and close
      setShowCreateIndexForm(false);
      setNewIndexName('');
      setNewIndexShards('1');
      setNewIndexReplicas('0');
      
      // Refresh with live data after creation, then trigger cache refresh
      await fetchNodeIndices(false, true); // Get live data immediately        // Clear the backend cache to force fresh data on next cached request
        try {
          await axiosClient.post("/api/admin/cluster-advanced/local-nodes/refresh");
          
          // Call the callback to refresh frontend cache state  
          if (onCacheRefreshed) {
            onCacheRefreshed();
          }

          // Dispatch custom event to notify other components
          window.dispatchEvent(new CustomEvent('indicesCacheRefreshed'));
        } catch (cacheError) {
          console.error("Failed to refresh cache:", cacheError);
        }
    } catch (error) {
      console.error("Failed to create index", error);
      // Error handling could be improved with notifications
    } finally {
      setIsCreatingIndex(false);
    }
  };

  const handleDeleteClick = (index) => {
    setIndexToDelete(index);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (indexToDelete) {
      setIsDeletingIndex(indexToDelete.index);
      try {
        // Use the correct node-specific API endpoint
        await axiosClient.delete(`/api/admin/cluster-advanced/${node.name}/indices/${indexToDelete.index}`);
        
        // Refresh with live data after deletion
        await fetchNodeIndices(false); // Get updated data immediately
        
        // Refresh backend cache after deletion
        try {
          await axiosClient.post("/api/admin/cluster-advanced/local-nodes/refresh");
          
          // Call the callback to refresh frontend cache state  
          if (onCacheRefreshed) {
            onCacheRefreshed();
          }

          // Dispatch custom event to notify other components
          window.dispatchEvent(new CustomEvent('indicesCacheRefreshed'));
        } catch (cacheError) {
          console.error("Failed to refresh cache:", cacheError);
        }
      } catch (err) {
        console.error("Error deleting index", err);
        // Show error notification or alert if needed
        alert(`Failed to delete index: ${err.response?.data?.error || err.message}`);
      } finally {
        setShowDeleteModal(false);
        setIndexToDelete(null);
        setIsDeletingIndex(null);
      }
    }
  };

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
            
            {indicesError && node.isRunning && (
              <div className="mb-4 p-3 bg-red-600 rounded-lg border border-red-500">
                <div className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-100" />
                  <p className="text-red-200 text-sm">
                    {indicesError}
                  </p>
                </div>
                <button
                  onClick={() => fetchNodeIndices()}
                  className="mt-2 bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded text-sm"
                >
                  Retry
                </button>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Indices on {node.name}</h3>
              {node.isRunning ? (
                <button
                  onClick={() => setShowCreateIndexForm(!showCreateIndexForm)}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm"
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  Create Index
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
            
            {showCreateIndexForm && (
              <div className="bg-neutral-700 p-4 rounded-lg mb-4">
                <h4 className="text-lg font-semibold mb-2">New Index</h4>
                <div className="space-y-2">
                  <div>
                    <input
                      type="text"
                      value={newIndexName}
                      onChange={(e) => setNewIndexName(e.target.value)}
                      placeholder="Enter index name (lowercase, no spaces)"
                      className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 ${
                        newIndexName && !isValidIndexName 
                          ? 'border-red-500 focus:ring-red-500' 
                          : 'border-neutral-600 focus:ring-blue-500'
                      }`}
                    />
                    {newIndexName && !isValidIndexName && (
                      <p className="text-red-400 text-xs mt-1">
                        Index name must be lowercase with no spaces or special characters
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="number"
                        value={newIndexShards}
                        onChange={(e) => setNewIndexShards(e.target.value)}
                        placeholder="Shards"
                        min="1"
                        className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 ${
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
                      <input
                        type="number"
                        value={newIndexReplicas}
                        onChange={(e) => setNewIndexReplicas(e.target.value)}
                        placeholder="Replicas"
                        min="0"
                        className={`w-full p-2 rounded-md bg-neutral-800 text-white border focus:outline-none focus:ring-2 ${
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
                </div>
                <div className="flex justify-end mt-2 space-x-2">
                  <button onClick={() => setShowCreateIndexForm(false)} className="bg-neutral-600 px-3 py-1 rounded">Cancel</button>
                  <button 
                    onClick={handleCreateIndex} 
                    className="bg-primary px-3 py-1 rounded w-24 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600" 
                    disabled={isCreatingIndex || !node.isRunning || !isFormValid}
                    title={
                      !node.isRunning ? "Node must be running to create indices" : 
                      !isFormValid ? "Please fix validation errors" : ""
                    }
                  >
                    {isCreatingIndex ? <FontAwesomeIcon icon={faCircleNotch} spin /> : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
            
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
                {nodeIndices.map(index => (
                  <tr key={index.uuid} className="border-b border-neutral-500">
                    <td className="py-3 px-4">
                      <span className={`inline-block w-3 h-3 rounded-full ${index.health === 'green' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                    </td>
                    <td className="py-3 px-4">{index.index}</td>
                    <td className="py-3 px-4">{index.docCount}</td>
                    <td className="py-3 px-4">{index['store.size']}</td>
                    <td className="py-3 px-4">
                      <button 
                        onClick={() => handleDeleteClick(index)} 
                        className="text-red-500 hover:text-red-400 disabled:text-gray-500 disabled:cursor-not-allowed"
                        disabled={!node.isRunning || isDeletingIndex === index.index}
                        title={
                          !node.isRunning ? "Start the node to delete indices" : 
                          isDeletingIndex === index.index ? "Deleting..." : "Delete index"
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
                ))}
              </tbody>
            </table>
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
              <button onClick={() => setShowDeleteModal(false)} className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg">
                Cancel
              </button>
              <button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 