// === frontend/src/pages/AdminDashboard.jsx ===
import React, { useState, useEffect, useCallback, useRef } from "react";
import axiosClient from "../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import ClusterSetupWizard from "../components/ClusterSetupWizard";
import LocalNodeManager from "../components/LocalNodeManager";
import { useClusterManagement } from "../hooks/useClusterManagement";
import { useElasticsearchManagement } from "../hooks/useElasticsearchManagement";

// Import new components
import { useAdminDashboard } from "./AdminDashboard/hooks/useAdminDashboard";
import FilesManagement from "./AdminDashboard/components/FilesManagement";
import ClusterManagement from "./AdminDashboard/components/ClusterManagement";
import ConfigurationManagement from "./AdminDashboard/components/ConfigurationManagement";
import AccountManagement from "./AdminDashboard/components/AccountManagement";
import TaskDetails from "./AdminDashboard/components/TaskDetails";
import NodeDetailsModal from "./AdminDashboard/components/NodeDetailsModal";

export default function AdminDashboard({ onLogout }) {
  // Use shared dashboard hooks
  const {
    notification,
    error,
    tasksList,
    currentRunningTaskId,
    isAnyTaskRunning,
    showNotification,
    hideNotification,
    fetchAllTasks,
    handleTaskAction,
    estimateRemainingTime,
    removeTask,
    setCurrentRunningTaskId,
    setTasksList,
  } = useAdminDashboard();

  // Custom hooks for cluster and Elasticsearch management
  const clusterManagement = useClusterManagement(showNotification);
  const elasticsearchManagement = useElasticsearchManagement(showNotification);

  // === Tab Navigation State ===
  const [activeTab, setActiveTab] = useState("cluster"); // 'files', 'cluster', 'accounts', 'configuration'

  // === Elasticsearch Management State ===
  const [showESModal, setShowESModal] = useState(false);
  const [esModalType, setEsModalType] = useState(""); // 'create', 'delete', 'reindex', 'details'
  const [esModalData, setEsModalData] = useState({});
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexShards, setNewIndexShards] = useState("1");
  const [newIndexReplicas, setNewIndexReplicas] = useState("0");
  const [reindexSource, setReindexSource] = useState("");
  const [reindexDest, setReindexDest] = useState("");
  const [indexDetails, setIndexDetails] = useState(null);

  // === Advanced Node Configuration State ===
  const [showClusterWizard, setShowClusterWizard] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showLocalNodeManager, setShowLocalNodeManager] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState(null);
  const [showNodeDetailsModal, setShowNodeDetailsModal] = useState(false);
  const [selectedNodeForDetails, setSelectedNodeForDetails] = useState(null);

  // === Loading state tracking ===
  const [isInitializing, setIsInitializing] = useState(true);

  // Fetch tasks on mount
  useEffect(() => {
    const initializeDashboard = async () => {
      setIsInitializing(true);
      try {
        await Promise.all([
          fetchAllTasks(),
          clusterManagement.fetchLocalNodes()
        ]);
      } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        showNotification("error", "Failed to initialize dashboard", faExclamationTriangle);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeDashboard();
  }, [fetchAllTasks]);

  // Fetch additional data when cluster tab is active
  useEffect(() => {
    if (activeTab === "cluster") {
      // Refresh local nodes (which includes cluster info if available)
      clusterManagement.fetchLocalNodes();
    }
  }, [activeTab]); // Remove clusterManagement.fetchLocalNodes from dependency array to prevent loops

  // Helper function to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ES Modal functions
  const openESModal = (type, data = {}) => {
    setEsModalType(type);
    setEsModalData(data);
    setShowESModal(true);
  };

  const closeESModal = () => {
    setShowESModal(false);
    setEsModalType("");
    setEsModalData({});
    setNewIndexName("");
    setNewIndexShards("1");
    setNewIndexReplicas("0");
    setReindexSource("");
    setReindexDest("");
    setIndexDetails(null);
  };

  const handleCreateIndex = async () => {
    if (!newIndexName.trim()) {
      showNotification("error", "Index name is required", faExclamationTriangle);
      return;
    }

    // Validate index name
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(newIndexName)) {
      showNotification("error", "Index name must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores", faExclamationTriangle);
      return;
    }

    try {
      await elasticsearchManagement.handleCreateIndex(newIndexName, newIndexShards, newIndexReplicas);
      closeESModal();
      elasticsearchManagement.fetchESData();
    } catch (err) {
      console.error("Failed to create index:", err);
      // Error already shown by elasticsearchManagement.handleCreateIndex
    }
  };

  const handleGetIndexDetails = async (indexName) => {
    const details = await elasticsearchManagement.fetchIndexDetails(indexName);
    if (details) {
      setIndexDetails(details);
      openESModal('details', { indexName });
    }
  };

  const handleReindex = async () => {
    if (!reindexSource.trim() || !reindexDest.trim()) {
      showNotification("error", "Both source and destination indices are required", faExclamationTriangle);
      return;
    }

    if (reindexSource === reindexDest) {
      showNotification("error", "Source and destination indices must be different", faExclamationTriangle);
      return;
    }

    try {
      await elasticsearchManagement.handleReindexData(reindexSource, reindexDest);
      closeESModal();
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to reindex", faExclamationTriangle);
    }
  };

  const handleEditNode = async (node) => {
    console.log("handleEditNode called with node:", node);
    console.log("Node structure:", JSON.stringify(node, null, 2));
    
    if (!node || !node.name) {
      showNotification("error", "Invalid node data - missing node name", faExclamationTriangle);
      console.error("handleEditNode received invalid node:", node);
      console.error("Node object keys:", node ? Object.keys(node) : "null");
      return;
    }
    
    try {
      console.log(`Opening edit modal for node: ${node.name}`);
      // Fetch latest node details before editing
      const latestNodeDetails = await clusterManagement.getNodeDetails(node.name);
      setNodeToEdit(latestNodeDetails);
      setShowLocalNodeManager(true);
    } catch (error) {
      console.error("Error fetching node details for editing:", error);
      showNotification("error", "Failed to fetch node details: " + (error.response?.data?.error || error.message), faExclamationTriangle);
    }
  };

  const handleOpenNodeDetails = (node) => {
    if (!node) {
      showNotification("error", "Invalid node data", faExclamationTriangle);
      return;
    }
    setSelectedNodeForDetails(node);
    setShowNodeDetailsModal(true);
  };

  const handleCloseNodeDetails = () => {
    setSelectedNodeForDetails(null);
    setShowNodeDetailsModal(false);
  };

  useEffect(() => {
    // Node-specific ES data management is now handled in ClusterManagement component
    // We only need to refresh local nodes data when nodes are available
    if (activeTab === "cluster" && clusterManagement.localNodes && clusterManagement.localNodes.length > 0) {
      // Optional: Refresh nodes periodically if needed, but only if there are running nodes
      const runningNodes = clusterManagement.localNodes.filter(n => n.isRunning);
      if (runningNodes.length > 0) {
        const interval = setInterval(() => {
          clusterManagement.fetchLocalNodes();
        }, 60000); // Every minute instead of 30 seconds for better performance
        
        return () => clearInterval(interval);
      }
    }
  }, [clusterManagement.localNodes, activeTab]);

  return (
    <div className="bg-neutral-900 text-neutral-100 min-h-screen p-8 font-sans">
      {/* Notification banner */}
      {notification.isVisible && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-lg shadow-2xl flex items-center space-x-3 transition-transform duration-300 ease-out transform ${
            notification.isVisible ? "translate-y-0 opacity-100" : "-translate-y-20 opacity-0"
          } ${
            notification.type === "success" ? "bg-green-600 text-white" : ""
          } ${notification.type === "error" ? "bg-red-600 text-white" : ""} ${
            notification.type === "info" ? "bg-primary text-white" : ""
          }`}
        >
          <FontAwesomeIcon
            icon={notification.icon}
            className={`${notification.isLoading ? "fa-spin" : ""} text-xl`}
          />
          <p className="font-semibold">{notification.message}</p>
          <button
            onClick={hideNotification}
            className="text-white ml-2 text-xl opacity-75 hover:opacity-100 transition-opacity"
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading state for initial dashboard load */}
      {isInitializing ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <FontAwesomeIcon icon={faCircleNotch} className="fa-spin text-4xl text-primary mb-4" />
            <p className="text-xl text-neutral-300">Initializing Admin Dashboard...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-12xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-neutral-900 shadow-2xl rounded-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-10 pb-4 border-b border-neutral-700">
          <h1 className="text-5xl font-extrabold text-primary">
            Admin Dashboard
          </h1>
          <button
            onClick={onLogout}
            className="bg-red-700 hover:bg-red-600 text-white px-6 py-2.5 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 transform hover:scale-105 active:scale-95"
          >
            Logout
          </button>
        </div>
        
        {/* Tab Navigation */}
        <div className="mb-8 border-b border-neutral-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("files")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "files"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              File Management
            </button>
            <button
              onClick={() => setActiveTab("cluster")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "cluster"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Node Management
            </button>
            <button
              onClick={() => setActiveTab("configuration")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "configuration"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Configuration
            </button>
            <button
              onClick={() => setActiveTab("accounts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "accounts"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Account Management
            </button>
          </nav>
        </div>

        {/* Task Details Component */}
        <TaskDetails 
          tasks={tasksList} 
          removeTask={removeTask}
          estimateRemainingTime={estimateRemainingTime}
        />

        {/* File Management Tab */}
        {activeTab === "files" && (
          <FilesManagement 
            showNotification={showNotification}
            isAnyTaskRunning={isAnyTaskRunning}
            showEditModal={false} // Files management doesn't have edit modal
            setTasksList={setTasksList}
            setCurrentRunningTaskId={setCurrentRunningTaskId}
          />
        )}

        {/* Node Management Tab */}
        {activeTab === "cluster" && (
          <ClusterManagement 
            // Local node state
            localNodes={clusterManagement.localNodes}
            nodeDisks={{}} // No longer used, but keeping for backward compatibility
            diskPreferences={{}} // No longer used, but keeping for backward compatibility
            clusterLoading={clusterManagement.clusterLoading}
            nodeActionLoading={clusterManagement.nodeActionLoading}
            selectedNodeForDisks={null} // No longer used
            setSelectedNodeForDisks={() => {}} // No longer used
            fetchLocalNodes={clusterManagement.fetchLocalNodes}
            fetchNodeStats={() => {}} // No longer used
            fetchDiskPreferences={() => {}} // No longer used
            handleStartLocalNode={clusterManagement.handleStartLocalNode}
            handleStopLocalNode={clusterManagement.handleStopLocalNode}
            handleDeleteLocalNode={clusterManagement.handleDeleteLocalNode}
            handleSetPreferredDisk={() => {}} // No longer used
            // ES state - these are handled by node-specific components now
            esIndices={[]} // Legacy - now handled per node
            selectedIndex={null} // Legacy - now handled per node
            esHealth={null} // Legacy - now handled per node
            esLoading={false} // Legacy - now handled per node
            fetchESData={() => {}} // Legacy - now handled per node
            handleCreateIndex={handleCreateIndex} // Legacy fallback
            handleDeleteIndex={() => {}} // Legacy - now handled per node
            handleSelectIndex={() => {}} // Legacy - now handled per node
            handleReindexData={handleReindex} // Legacy fallback
            handleGetIndexDetails={handleGetIndexDetails} // Legacy fallback
            openESModal={openESModal} // Legacy fallback
            // Modal controls
            setShowClusterWizard={setShowClusterWizard}
            setShowLocalNodeManager={setShowLocalNodeManager}
            // Other
            isAnyTaskRunning={isAnyTaskRunning}
            formatBytes={formatBytes}
            onEditNode={handleEditNode}
            onOpenNodeDetails={handleOpenNodeDetails}
            showNotification={showNotification}
          />
        )}

        {/* Configuration Tab */}
        {activeTab === "configuration" && (
          <ConfigurationManagement 
            showNotification={showNotification}
            esIndices={elasticsearchManagement.esIndices}
            availableSearchIndices={elasticsearchManagement.availableSearchIndices}
            setAvailableSearchIndices={elasticsearchManagement.setAvailableSearchIndices}
          />
        )}

        {/* Account Management Tab */}
        {activeTab === "accounts" && (
          <AccountManagement 
            showNotification={showNotification}
            isAnyTaskRunning={isAnyTaskRunning}
          />
        )}
      </div>

      {/* Modals Section - Moved outside main container for proper overlay */}
      {/* Local Node Manager */}
      {showLocalNodeManager && (
        <LocalNodeManager
          isOpen={showLocalNodeManager}
          onClose={() => {
            setShowLocalNodeManager(false);
            setNodeToEdit(null); // Reset on close
          }}
          clusterManagement={clusterManagement}
          nodeToEdit={nodeToEdit}
          mode={nodeToEdit ? 'edit' : 'create'}
        />
      )}

      {/* Cluster Setup Wizard */}
      {showClusterWizard && (
        <ClusterSetupWizard
          isOpen={showClusterWizard}
          onClose={() => setShowClusterWizard(false)}
          onComplete={() => {
            setShowClusterWizard(false);
            // Refresh local nodes (which includes cluster info if available)
            clusterManagement.fetchLocalNodes();
          }}
        />
      )}

      {/* Advanced Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Add Node - Advanced Configuration</h3>
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="text-neutral-400 hover:text-red-400 text-3xl transition-colors"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Node URL
                </label>
                <input
                  type="url"
                  value={clusterManagement.newNodeUrl}
                  onChange={(e) => clusterManagement.setNewNodeUrl(e.target.value)}
                  placeholder="http://localhost:9200"
                  className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-neutral-400 mt-1">
                  Enter the complete URL including protocol (http/https) and port
                </p>
              </div>
              
              <div className="bg-neutral-800 p-3 rounded-md">
                <p className="text-sm text-neutral-300">
                  <strong>Quick Add:</strong> This will add the node to your cluster configuration. 
                  For complex setups with custom node configurations, use the Cluster Setup Wizard instead.
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddNodeModal(false)}
                  className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    clusterManagement.handleAddNode();
                    setShowAddNodeModal(false);
                  }}
                  disabled={!clusterManagement.newNodeUrl.trim()}
                  className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Node
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Elasticsearch Index Modal */}
      {showESModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">
                {esModalType === "create" && "Create New Index"}
                {esModalType === "reindex" && "Reindex Data"}
                {esModalType === "details" && `Index Details: ${esModalData.indexName}`}
              </h3>
              <button
                onClick={closeESModal}
                className="text-neutral-400 hover:text-red-400 text-3xl transition-colors"
              >
                &times;
              </button>
            </div>

            {/* Create Index Modal */}
            {esModalType === "create" && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="new-index-name" className="block text-sm font-medium text-neutral-300 mb-2">
                    Index Name
                  </label>
                  <input
                    type="text"
                    id="new-index-name"
                    value={newIndexName}
                    onChange={(e) => setNewIndexName(e.target.value)}
                    placeholder="Enter index name (lowercase, no spaces)"
                    className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-sm text-neutral-400 mt-1">
                    Index names will be automatically formatted (lowercase, special characters replaced with underscores)
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-index-shards" className="block text-sm font-medium text-neutral-300 mb-2">
                      Number of Shards
                    </label>
                    <input
                      type="number"
                      id="new-index-shards"
                      value={newIndexShards}
                      onChange={(e) => setNewIndexShards(e.target.value)}
                      min="1"
                      max="1000"
                      placeholder="1"
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-sm text-neutral-400 mt-1">
                      Range: 1-1000 (default: 1)
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="new-index-replicas" className="block text-sm font-medium text-neutral-300 mb-2">
                      Number of Replicas
                    </label>
                    <input
                      type="number"
                      id="new-index-replicas"
                      value={newIndexReplicas}
                      onChange={(e) => setNewIndexReplicas(e.target.value)}
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-sm text-neutral-400 mt-1">
                      Range: 0-100 (default: 0)
                    </p>
                  </div>
                </div>
                
                <div className="bg-neutral-800 p-3 rounded-md">
                  <p className="text-sm text-neutral-300">
                    <strong>Note:</strong> Shards determine how data is distributed across nodes. Replicas provide data redundancy and can improve search performance. 
                    For most use cases, 1 shard and 0-1 replicas are sufficient for small to medium datasets.
                  </p>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={handleCreateIndex}
                    className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      !newIndexName.trim() || 
                      isAnyTaskRunning ||
                      parseInt(newIndexShards) < 1 || 
                      parseInt(newIndexShards) > 1000 ||
                      parseInt(newIndexReplicas) < 0 || 
                      parseInt(newIndexReplicas) > 100 ||
                      !(clusterManagement.localNodes || []).some(node => node.isRunning)
                    }
                    title={!(clusterManagement.localNodes || []).some(node => node.isRunning) ? "Start at least one node to create indices" : ""}
                  >
                    Create Index
                  </button>
                  <button
                    onClick={closeESModal}
                    className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Details Modal */}
            {esModalType === "details" && indexDetails && (
              <div>
                <div className="border-b border-neutral-700 mb-4">
                  <nav className="flex space-x-4">
                    {['Settings', 'Mappings', 'Stats'].map(tabName => (
                      <button
                        key={tabName}
                        onClick={() => setEsModalData({ ...esModalData, activeDetailsTab: tabName.toLowerCase() })}
                        className={`py-2 px-4 font-medium text-sm transition-colors ${
                          (esModalData.activeDetailsTab || 'settings') === tabName.toLowerCase()
                            ? 'border-b-2 border-primary text-primary'
                            : 'border-transparent text-neutral-400 hover:text-white'
                        }`}
                      >
                        {tabName}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="space-y-4 text-neutral-300">
                  {/* Settings Tab */}
                  {(esModalData.activeDetailsTab || 'settings') === 'settings' && (
                    <SettingsDisplay settings={indexDetails.settings} />
                  )}
                  {/* Mappings Tab */}
                  {(esModalData.activeDetailsTab || 'settings') === 'mappings' && (
                    <MappingsDisplay mappings={indexDetails.mappings} />
                  )}
                  {/* Stats Tab */}
                  {(esModalData.activeDetailsTab || 'settings') === 'stats' && (
                    <StatsDisplay stats={indexDetails.stats} />
                  )}
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    onClick={closeESModal}
                    className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Reindex Modal */}
            {esModalType === "reindex" && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="reindex-source" className="block text-sm font-medium text-neutral-300 mb-2">
                    Source Index
                  </label>
                  <select
                    id="reindex-source"
                    value={reindexSource}
                    onChange={(e) => setReindexSource(e.target.value)}
                    className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select source index</option>
                    {elasticsearchManagement.esIndices.map((index) => (
                      <option key={index.index} value={index.index}>
                        {index.index} ({(index['docs.count'] || 0).toLocaleString()} docs)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reindex-dest" className="block text-sm font-medium text-neutral-300 mb-2">
                    Destination Index
                  </label>
                  <select
                    id="reindex-dest"
                    value={reindexDest}
                    onChange={(e) => setReindexDest(e.target.value)}
                    className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select destination index</option>
                    {elasticsearchManagement.esIndices.map((index) => (
                      <option key={index.index} value={index.index}>
                        {index.index}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded-lg p-4 mt-4">
                  <p className="text-yellow-200 text-sm">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                    Warning: Reindexing will copy all documents from the source index to the destination index. 
                    If the destination index already contains data, the documents will be merged.
                  </p>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={handleReindex}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      !reindexSource || 
                      !reindexDest || 
                      reindexSource === reindexDest || 
                      isAnyTaskRunning ||
                      !(clusterManagement.localNodes || []).some(node => node.isRunning)
                    }
                    title={!(clusterManagement.localNodes || []).some(node => node.isRunning) ? "Start at least one node to perform reindexing" : ""}
                  >
                    Start Reindexing
                  </button>
                  <button
                    onClick={closeESModal}
                    className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <NodeDetailsModal 
        show={showNodeDetailsModal}
        onClose={handleCloseNodeDetails}
        node={selectedNodeForDetails}
        nodeDisks={{}} // Legacy - now handled differently
        formatBytes={formatBytes}
      />
        </>
      )}
    </div>
  );
}

// Helper component for displaying settings in a structured way
const SettingsDisplay = ({ settings }) => {
  const renderValue = (value) => {
    if (typeof value === 'object' && value !== null) {
      return (
        <pre className="bg-neutral-700 p-2 rounded-md text-sm">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return <span className="font-mono">{String(value)}</span>;
  };

  return (
    <div className="bg-neutral-900 p-4 rounded-lg space-y-2">
      {Object.entries(settings.index).map(([key, value]) => (
        <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start py-2 border-b border-neutral-800">
          <span className="font-semibold text-neutral-400 capitalize">{key.replace(/_/g, ' ')}</span>
          <div className="text-white col-span-2 bg-neutral-800 p-2 rounded-md text-sm">
            {renderValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper component for displaying mappings
const MappingsDisplay = ({ mappings }) => {
  if (!mappings || !mappings.properties || Object.keys(mappings.properties).length === 0) {
    return (
      <div className="bg-neutral-900 p-4 rounded-lg text-center text-neutral-400">
        No explicit mappings defined for this index.
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 p-4 rounded-lg space-y-4">
      {Object.entries(mappings.properties).map(([fieldName, fieldDetails]) => (
        <div key={fieldName} className="bg-neutral-800 p-4 rounded-lg">
          <h5 className="font-bold text-lg text-primary mb-2">{fieldName}</h5>
          <div className="pl-4 border-l-2 border-neutral-600 space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold text-neutral-300">Type:</span>
              <span className="font-mono bg-blue-900 text-blue-300 px-2 py-1 rounded-md text-sm">{fieldDetails.type}</span>
            </div>
            {fieldDetails.fields && (
              <div>
                <p className="font-semibold mt-2 text-neutral-300">Sub-fields:</p>
                <div className="pl-4 mt-2 space-y-2">
                  {Object.entries(fieldDetails.fields).map(([subFieldName, subFieldDetails]) => (
                    <div key={subFieldName} className="bg-neutral-700 p-2 rounded-md">
                      <p className="font-semibold text-neutral-400">{subFieldName}</p>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Type:</span>
                        <span>{subFieldDetails.type}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Analyzer:</span>
                        <span>{subFieldDetails.analyzer}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper component for displaying stats
const StatsDisplay = ({ stats }) => {
  const renderStats = (statsObj) => {
    return Object.entries(statsObj).map(([statName, statValue]) => {
      if (typeof statValue === 'object' && statValue !== null) {
        return (
          <div key={statName} className="col-span-1 md:col-span-2">
            <h6 className="font-semibold text-neutral-300 capitalize mt-2">{statName.replace(/_/g, ' ')}</h6>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 pl-4 border-l-2 border-neutral-700">
              {renderStats(statValue)}
            </div>
          </div>
        );
      }
      return (
        <div key={statName} className="flex justify-between border-b border-neutral-800 py-1">
          <span className="font-semibold text-neutral-400 capitalize">{statName.replace(/_/g, ' ')}</span>
          <span className="text-white font-mono">{statValue.toLocaleString()}</span>
        </div>
      );
    });
  };

  return (
    <div className="bg-neutral-900 p-4 rounded-lg space-y-6">
      {Object.entries(stats).map(([category, categoryStats]) => (
        <div key={category}>
          <h5 className="font-bold text-lg text-primary capitalize mb-2">{category}</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 pl-4">
            {renderStats(categoryStats)}
          </div>
        </div>
      ))}
    </div>
  );
};
