import React from "react";
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
                <div className={`w-3 h-3 rounded-full ${localNodes.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Configured Nodes: <span className="text-white font-medium">{localNodes.length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${localNodes.filter(n => n.isRunning).length > 0 ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Running: <span className="text-white font-medium">{localNodes.filter(n => n.isRunning).length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${localNodes.filter(n => !n.isRunning).length > 0 ? 'bg-red-500' : 'bg-gray-500'}`}></div>
                <span className="text-neutral-300 text-sm">
                  Stopped: <span className="text-white font-medium">{localNodes.filter(n => !n.isRunning).length}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-neutral-300 text-sm">
                  Mode: <span className="text-blue-300 font-medium">Local Management</span>
                </span>
              </div>
              {localNodes.length > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-neutral-300 text-sm">
                    Clusters: <span className="text-purple-300 font-medium">
                      {[...new Set(localNodes.map(n => n.cluster || 'trustquery-cluster'))].length}
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
          {localNodes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-600">
              <div className="flex flex-wrap gap-2">
                {[...new Set(localNodes.map(n => n.cluster || 'trustquery-cluster'))].map(cluster => {
                  const clusterNodes = localNodes.filter(n => (n.cluster || 'trustquery-cluster') === cluster);
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

        {clusterLoading && localNodes.length === 0 ? (
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
              
              {localNodes.length === 0 ? (
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
                  {localNodes.map((node) => {
                    const isLoading = nodeActionLoading.includes(node.name);
                        
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
                  {nodeDisks[selectedNodeForDisks].map((disk, index) => {
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

      {/* Elasticsearch Management Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white">
            Elasticsearch Management
          </h2>
          <div className="flex space-x-3">
            <button
              onClick={fetchESData}
              className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
              disabled={esLoading}
            >
              <FontAwesomeIcon 
                icon={faCircleNotch} 
                className={`mr-2 ${esLoading ? 'fa-spin' : ''}`} 
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Cluster Health Info */}
        {esHealth && (
          <div className="mb-6 p-4 bg-neutral-700 rounded-lg">
            <h3 className="text-xl font-semibold text-white mb-3">Cluster Health</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-neutral-400">Status:</span>
                <span className={`ml-2 px-2 py-1 rounded ${
                  esHealth?.cluster?.status === 'green' ? 'bg-green-600' :
                  esHealth?.cluster?.status === 'yellow' ? 'bg-yellow-600' : 'bg-red-600'
                } text-white`}>
                  {esHealth?.cluster?.status?.toUpperCase() || 'UNKNOWN'}
                </span>
              </div>
              <div>
                <span className="text-neutral-400">Nodes:</span>
                <span className="ml-2 text-white">{esHealth?.cluster?.numberOfNodes || 0}</span>
              </div>
              <div>
                <span className="text-neutral-400">Documents:</span>
                <span className="ml-2 text-white">{esHealth?.storage?.documentCount?.toLocaleString() || '0'}</span>
              </div>
              <div>
                <span className="text-neutral-400">Storage:</span>
                <span className="ml-2 text-white">{esHealth?.storage?.totalSizeReadable || 'Unknown'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Index Info */}
        <div className="mb-6 p-4 bg-neutral-700 rounded-lg">
          <h3 className="text-xl font-semibold text-white mb-3">Current Index for Operations</h3>
          <div className="text-lg">
            <span className="text-neutral-400">Selected Index:</span>
            <span className="ml-2 px-3 py-1 bg-primary text-white rounded-lg font-semibold">
              {selectedIndex}
            </span>
            <span className="ml-3 text-sm text-neutral-400">
              (All new data and operations will use this index)
            </span>
          </div>
        </div>

        {/* Indices List */}
        {esLoading ? (
          <div className="text-center py-8 text-neutral-400">
            <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
            Loading Elasticsearch data...
          </div>
        ) : esIndices.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <p className="mb-4">No indices found. Create your first index to get started.</p>
            <button
              onClick={() => openESModal("create")}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg"
            >
              Create Index
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-neutral-100 bg-neutral-600 rounded-lg">
              <thead className="bg-neutral-500">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Index Name</th>
                  <th className="text-left py-3 px-4 font-semibold">Documents</th>
                  <th className="text-left py-3 px-4 font-semibold">Size</th>
                  <th className="text-left py-3 px-4 font-semibold">Health</th>
                  <th className="text-left py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {esIndices.map((index, idx) => (
                  <tr key={idx} className="bg-neutral-800 border-b border-neutral-700 hover:bg-neutral-600">
                    <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">
                      {index.name || 'Unknown'}
                    </th>
                    <td className="px-6 py-4">
                      {index.docCount || 0}
                    </td>
                    <td className="px-6 py-4">
                      {index.storeSize || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        index.health === 'green' ? 'bg-green-600' :
                        index.health === 'yellow' ? 'bg-yellow-600' : 'bg-red-600'
                      } text-white`}>
                        {index.health?.toUpperCase() || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {selectedIndex !== index.name && (
                          <button
                            onClick={() => handleSelectIndex(index.name)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
                          >
                            Select
                          </button>
                        )}
                        <button
                          onClick={() => handleGetIndexDetails(index.name)}
                          className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => openESModal("delete", { indexName: index.name })}
                          className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
                          disabled={isAnyTaskRunning}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
