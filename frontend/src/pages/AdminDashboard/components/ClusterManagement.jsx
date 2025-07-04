import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faServer,
  faInfoCircle,
  faStop,
  faCog,
  faFileAlt,
  faPlus,
  faPlay,
  faTrash,
  faHdd,
  faMemory,
  faMicrochip,
  faSpinner,
  faCircle,
  faExclamationCircle,
  faPencilAlt,
} from "@fortawesome/free-solid-svg-icons";
import NodeDetailsModal from "./NodeDetailsModal";
import axiosClient from "../../../api/axiosClient";

export default function ClusterManagement({
  // Local node state
  localNodes,
  nodeDisks,
  diskPreferences,
  clusterLoading,
  selectedNodeForDisks,
  setSelectedNodeForDisks,
  fetchLocalNodes,
  fetchNodeStats,
  fetchDiskPreferences,
  handleStartLocalNode,
  handleStopLocalNode,
  handleDeleteLocalNode,
  handleSetPreferredDisk,
  // ES state
  esIndices,
  selectedIndex,
  esHealth,
  esLoading,
  fetchESData,
  handleCreateIndex,
  handleDeleteIndex,
  handleSelectIndex,
  handleReindexData,
  handleGetIndexDetails,
  openESModal,
  // Modal controls
  setShowClusterWizard,
  setShowLocalNodeManager,
  // Other
  isAnyTaskRunning,
  formatBytes,
  onEditNode,
  nodeActionLoading,
  onOpenNodeDetails,
}) {
  const getNodeStats = (nodeName) => {
    return null; // Stats are no longer fetched this way
  };

  return (
    <>

      {/* Node Management Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white">
            Node Management
          </h2>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowLocalNodeManager(true)}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
            >
              <FontAwesomeIcon icon={faServer} className="mr-2" />
              Create New Node
            </button>
            <button
              onClick={fetchLocalNodes}
              className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
              disabled={clusterLoading}
            >
              <FontAwesomeIcon 
                icon={faCircleNotch} 
                className={`mr-2 ${clusterLoading ? 'fa-spin' : ''}`} 
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Banner */}
        <div className="mb-6 p-4 bg-neutral-700 rounded-lg border border-neutral-600">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${(localNodes || []).length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Configured Nodes: <span className="text-white font-medium">{(localNodes || []).length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${(localNodes || []).filter(n => n.isRunning).length > 0 ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Running: <span className="text-white font-medium">{(localNodes || []).filter(n => n.isRunning).length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${(localNodes || []).filter(n => !n.isRunning).length > 0 ? 'bg-red-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Stopped: <span className="text-white font-medium">{(localNodes || []).filter(n => !n.isRunning).length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-neutral-300 text-sm">
                  Mode: <span className="text-blue-300 font-medium">Local Management</span>
                </span>
              </div>
              {localNodes && localNodes.length > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-neutral-300 text-sm">
                    Clusters: <span className="text-purple-300 font-medium">
                      {[...new Set((localNodes || []).map(n => n.cluster || 'trustquery-cluster'))].length}
                    </span>
                  </span>
                </div>
              )}
            </div>
            {clusterLoading && (
              <div className="flex items-center space-x-2 text-neutral-400 text-sm">
                <FontAwesomeIcon icon={faCircleNotch} className="fa-spin" />
                <span>Updating status...</span>
              </div>
            )}
          </div>
          
          {/* Cluster breakdown */}
          {localNodes && localNodes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-600">
              <div className="flex flex-wrap gap-2">
                {[...new Set((localNodes || []).map(n => n.cluster || 'trustquery-cluster'))].map(cluster => {
                  const clusterNodes = (localNodes || []).filter(n => (n.cluster || 'trustquery-cluster') === cluster);
                  const runningCount = clusterNodes.filter(n => n.isRunning).length;
                  return (
                    <div key={cluster} className="bg-neutral-800 px-3 py-1 rounded-lg border border-neutral-600">
                      <span className="text-neutral-300 text-sm">
                        <span className="text-purple-300 font-medium">{cluster}</span>
                        <span className="ml-2">({runningCount}/{clusterNodes.length} running)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {clusterLoading && (!localNodes || localNodes.length === 0) ? (
          <div className="text-center py-8 text-neutral-400">
            <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
            Loading node information...
          </div>
        ) : (
          <div className="space-y-8">
            {/* Local Nodes Management */}
            <div className="p-6 bg-neutral-700 rounded-lg">
              <h3 className="text-xl font-semibold text-white mb-4">Node Management</h3>
              <p className="text-blue-200 text-sm mb-4">
                Manage all locally configured nodes with full control over their lifecycle and configuration.
              </p>
              
              {(!localNodes || localNodes.length === 0) ? (
                <div className="text-center py-8">
                  <FontAwesomeIcon icon={faServer} className="text-6xl text-neutral-500 mb-4" />
                  <p className="text-neutral-400 mb-4">No nodes configured yet</p>
                  <p className="text-neutral-500 text-sm mb-6">
                    Start by creating your first Elasticsearch node. TrustQuery will guide you through the setup process.
                  </p>
                  <button
                    onClick={() => setShowLocalNodeManager(true)}
                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg transition duration-150 ease-in-out"
                  >
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Create Your First Node
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {(localNodes || []).map((node) => {
                    const isLoading = (nodeActionLoading || []).includes(node.name);
                        
                        return (
                      <div
                        key={node.name}
                        className="bg-neutral-800 rounded-2xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out"
                      >
                        <div className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="bg-primary p-3 rounded-full">
                                <FontAwesomeIcon icon={faServer} className="text-white text-xl" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white">{node.name}</h3>
                                <div className="text-sm text-neutral-400">
                                  {node.description || `Node running at ${node.host}:${node.port}`}
                                    </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                  Cluster: {node.cluster}
                                </div>
                              </div>
                            </div>
                          </div>
                            
                          {/* Node Status */}
                          <div className="mt-4 pt-4 border-t border-neutral-700">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faCircle}
                                  className={`${
                                    node.isRunning ? "text-green-500" : "text-red-500"
                                  } text-xs`}
                                />
                                <span className="text-sm font-semibold">
                                  {node.isRunning ? "Running" : "Stopped"}
                                </span>
                              </div>
                                  </div>
                                </div>
                            
                            {/* Actions */}
                          <div className="mt-6 flex items-center justify-between space-x-2">
                            <div className="flex space-x-2">
                              {node.isRunning ? (
                                <button
                                  onClick={() => handleStopLocalNode(node.name)}
                                  disabled={isLoading}
                                  className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                  {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Stop'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartLocalNode(node.name)}
                                  disabled={isLoading}
                                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                  {isLoading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Start'}
                                </button>
                              )}
                              <button
                                onClick={() => onOpenNodeDetails(node)}
                                className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                              >
                                Manage
                              </button>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => onEditNode(node)}
                                className="text-neutral-400 hover:text-white transition-colors"
                                aria-label="Edit Node"
                              >
                                <FontAwesomeIcon icon={faPencilAlt} />
                              </button>
                              <button
                                onClick={() => handleDeleteLocalNode(node.name)}
                                className="text-neutral-400 hover:text-red-500 transition-colors"
                                aria-label="Delete Node"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          </div>
                        </div>
                              </div>
                        );
                      })}
                </div>
              )}
            </div>

            {/* Disk Management for Selected Node */}
            {selectedNodeForDisks && nodeDisks[selectedNodeForDisks] && (
              <div className="p-6 bg-neutral-700 rounded-lg">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Disk Paths for Node: {selectedNodeForDisks}
                </h3>
                <div className="space-y-4">
                  {(nodeDisks[selectedNodeForDisks] || []).map((disk, index) => {
                    const usagePercent = ((disk.used / disk.total) * 100).toFixed(1);
                    const isPreferred = diskPreferences[selectedNodeForDisks] === disk.path;
                    
                    return (
                      <div key={index} className="p-4 bg-neutral-600 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-white">{disk.path}</h4>
                            {isPreferred && (
                              <span className="inline-block mt-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                                PREFERRED PATH
                              </span>
                            )}
                          </div>
                          {!isPreferred && (
                            <button
                              onClick={() => handleSetPreferredDisk(selectedNodeForDisks, disk.path)}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
                            >
                              Set as Preferred
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-neutral-400">Total:</span>
                            <span className="ml-2 text-white">{formatBytes(disk.total)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-400">Used:</span>
                            <span className="ml-2 text-white">{formatBytes(disk.used)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-400">Available:</span>
                            <span className="ml-2 text-white">{formatBytes(disk.available)}</span>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-neutral-400">Usage</span>
                            <span className={`${usagePercent > 90 ? 'text-red-400' : usagePercent > 70 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {usagePercent}%
                            </span>
                          </div>
                          <div className="w-full bg-neutral-800 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${usagePercent > 90 ? 'bg-red-600' : usagePercent > 70 ? 'bg-yellow-600' : 'bg-green-600'}`}
                              style={{ width: `${usagePercent}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Elasticsearch Management Section - Per Node */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white">
            Elasticsearch Management - Indices by Node
          </h2>
        </div>

        {/* No Running Nodes Warning */}
        {!(localNodes || []).some(node => node.isRunning) && (
          <div className="mb-6 p-4 bg-amber-600 rounded-lg border border-amber-500">
            <div className="flex items-center space-x-3">
              <FontAwesomeIcon icon={faExclamationCircle} className="text-amber-100 text-xl" />
              <div>
                <h3 className="text-amber-100 font-semibold">No Running Nodes</h3>
                <p className="text-amber-200 text-sm">
                  Elasticsearch operations are disabled. Start at least one node to manage indices and perform searches.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Node-specific Index Management */}
        {(localNodes || []).length > 0 ? (
          <div className="space-y-6">
            {(localNodes || []).map((node) => (
              <NodeIndicesSection 
                key={node.name}
                node={node}
                isAnyTaskRunning={isAnyTaskRunning}
                onOpenNodeDetails={onOpenNodeDetails}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-400">
            <p className="mb-4">No nodes found. Create your first node to get started with Elasticsearch.</p>
            <button
              onClick={() => setShowLocalNodeManager(true)}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg"
            >
              Create Node
            </button>
          </div>
        )}
      </section>
    </>
  );
}

// NodeIndicesSection Component for individual node index management
function NodeIndicesSection({ node, isAnyTaskRunning, onOpenNodeDetails }) {
  const [nodeIndices, setNodeIndices] = useState([]);
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [showCreateIndexForm, setShowCreateIndexForm] = useState(false);
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexShards, setNewIndexShards] = useState('1');
  const [newIndexReplicas, setNewIndexReplicas] = useState('0');

  const fetchNodeIndices = async () => {
    if (!node.isRunning) {
      setNodeIndices([]);
      return;
    }
    
    setIndicesLoading(true);
    try {
      const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/indices`);
      setNodeIndices(response.data || []);
    } catch (error) {
      console.error(`Failed to load indices for node ${node.name}:`, error);
      setNodeIndices([]);
    } finally {
      setIndicesLoading(false);
    }
  };

  const handleCreateIndex = async () => {
    if (!newIndexName.trim()) {
      return;
    }

    setIsCreatingIndex(true);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/${node.name}/indices`, {
        indexName: newIndexName,
        shards: newIndexShards,
        replicas: newIndexReplicas,
      });
      setShowCreateIndexForm(false);
      setNewIndexName('');
      setNewIndexShards('1');
      setNewIndexReplicas('0');
      fetchNodeIndices(); // Refresh the list
    } catch (error) {
      console.error("Failed to create index", error);
    } finally {
      setIsCreatingIndex(false);
    }
  };

  const handleDeleteIndex = async (indexName) => {
    if (!window.confirm(`Are you sure you want to delete index "${indexName}" from node ${node.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await axiosClient.delete(`/api/admin/cluster-advanced/${node.name}/indices/${indexName}`);
      fetchNodeIndices(); // Refresh the list
    } catch (error) {
      console.error("Failed to delete index", error);
    }
  };

  // Fetch indices when node becomes running or when component mounts
  React.useEffect(() => {
    fetchNodeIndices();
  }, [node.isRunning, node.name]);

  // Hide create index form if node stops running
  React.useEffect(() => {
    if (!node.isRunning && showCreateIndexForm) {
      setShowCreateIndexForm(false);
    }
  }, [node.isRunning, showCreateIndexForm]);

  return (
    <div className="bg-neutral-700 p-6 rounded-lg border border-neutral-600">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="text-xl font-semibold text-white flex items-center">
            <FontAwesomeIcon icon={faServer} className="mr-2 text-primary" />
            {node.name}
          </h3>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
            node.isRunning ? 'bg-green-600' : 'bg-red-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              node.isRunning ? 'bg-green-200' : 'bg-red-200'
            }`}></div>
            <span className="text-white text-sm font-medium">
              {node.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onOpenNodeDetails(node)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
          >
            <FontAwesomeIcon icon={faInfoCircle} className="mr-1" />
            Details
          </button>
          {node.isRunning && (
            <button
              onClick={() => setShowCreateIndexForm(!showCreateIndexForm)}
              className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
              disabled={isAnyTaskRunning}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1" />
              Create Index
            </button>
          )}
          <button
            onClick={fetchNodeIndices}
            className="bg-primary hover:bg-button-hover-bg text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={indicesLoading || !node.isRunning}
          >
            <FontAwesomeIcon 
              icon={faCircleNotch} 
              className={`mr-1 ${indicesLoading ? 'fa-spin' : ''}`} 
            />
            Refresh
          </button>
        </div>
      </div>

      {!node.isRunning && (
        <div className="mb-4 p-3 bg-amber-600 rounded-lg border border-amber-500">
          <div className="flex items-center space-x-2">
            <FontAwesomeIcon icon={faExclamationCircle} className="text-amber-100" />
            <p className="text-amber-200 text-sm">
              Node is not running. Start the node to view and manage indices.
            </p>
          </div>
        </div>
      )}

      {showCreateIndexForm && node.isRunning && (
        <div className="mb-4 p-4 bg-neutral-800 rounded-lg border border-neutral-500">
          <h4 className="text-lg font-semibold text-white mb-3">Create New Index on {node.name}</h4>
          <div className="space-y-3">
            <input
              type="text"
              value={newIndexName}
              onChange={(e) => setNewIndexName(e.target.value)}
              placeholder="Enter index name"
              className="w-full p-3 rounded-md bg-neutral-900 text-white border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={newIndexShards}
                onChange={(e) => setNewIndexShards(e.target.value)}
                placeholder="Shards"
                min="1"
                className="w-full p-3 rounded-md bg-neutral-900 text-white border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                value={newIndexReplicas}
                onChange={(e) => setNewIndexReplicas(e.target.value)}
                placeholder="Replicas"
                min="0"
                className="w-full p-3 rounded-md bg-neutral-900 text-white border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4 space-x-3">
            <button 
              onClick={() => setShowCreateIndexForm(false)} 
              className="bg-neutral-600 hover:bg-neutral-500 px-4 py-2 rounded text-white transition duration-150 ease-in-out"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateIndex} 
              className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-white transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600" 
              disabled={isCreatingIndex || !newIndexName.trim()}
            >
              {isCreatingIndex ? <FontAwesomeIcon icon={faCircleNotch} spin /> : 'Create Index'}
            </button>
          </div>
        </div>
      )}

      {node.isRunning && (
        <>
          {indicesLoading ? (
            <div className="text-center py-6 text-neutral-400">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading indices for {node.name}...
            </div>
          ) : nodeIndices.length === 0 ? (
            <div className="text-center py-6 text-neutral-400">
              <p className="mb-3">No indices found on this node.</p>
              <button
                onClick={() => setShowCreateIndexForm(true)}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm transition duration-150 ease-in-out"
                disabled={isAnyTaskRunning}
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1" />
                Create First Index
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-neutral-100 bg-neutral-600 rounded-lg">
                <thead className="bg-neutral-500">
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold text-sm">Health</th>
                    <th className="text-left py-2 px-3 font-semibold text-sm">Index</th>
                    <th className="text-left py-2 px-3 font-semibold text-sm">Docs</th>
                    <th className="text-left py-2 px-3 font-semibold text-sm">Storage</th>
                    <th className="text-left py-2 px-3 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nodeIndices.map((index, idx) => (
                    <tr key={index.uuid || idx} className="border-b border-neutral-500 hover:bg-neutral-600">
                      <td className="py-2 px-3">
                        <span className={`inline-block w-3 h-3 rounded-full ${
                          index.health === 'green' ? 'bg-green-500' : 
                          index.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></span>
                      </td>
                      <td className="py-2 px-3 font-medium">{index.index}</td>
                      <td className="py-2 px-3">{parseInt(index['docs.count']) || 0}</td>
                      <td className="py-2 px-3">{index['store.size'] || '0b'}</td>
                      <td className="py-2 px-3">
                        <button 
                          onClick={() => handleDeleteIndex(index.index)} 
                          className="text-red-500 hover:text-red-400 transition duration-150 ease-in-out disabled:text-gray-500 disabled:cursor-not-allowed"
                          disabled={isAnyTaskRunning}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
