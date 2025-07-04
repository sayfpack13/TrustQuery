// === frontend/src/pages/AdminDashboard.jsx ===
import React, { useState, useEffect, useCallback, useRef } from "react";
import axiosClient from "../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faExclamationTriangle,
  faCheckCircle,
  faInfoCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import ClusterSetupWizard from "../components/ClusterSetupWizard";
import LocalNodeManager from "../components/LocalNodeManager";
import { useClusterManagement } from "../hooks/useClusterManagement";

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

  // === Tab Navigation State ===
  const [activeTab, setActiveTab] = useState("cluster"); // 'files', 'cluster', 'accounts', 'configuration'

  // === Advanced Node Configuration State ===
  const [showClusterWizard, setShowClusterWizard] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showLocalNodeManager, setShowLocalNodeManager] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState(null);
  const [showNodeDetailsModal, setShowNodeDetailsModal] = useState(false);
  const [selectedNodeForDetails, setSelectedNodeForDetails] = useState(null);

  // === Loading state tracking ===
  const [isInitializing, setIsInitializing] = useState(true);

  // Custom hook for cluster management
  const clusterManagement = useClusterManagement(showNotification);

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
    } else if (activeTab === "files") {
      // Fetch cluster nodes for parsing options (indices are loaded per node)
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
            icon={notification.icon || faInfoCircle}
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
            // Add cluster data for parsing options (indices are fetched per node)
            availableNodes={clusterManagement.localNodes || []}
          />
        )}

        {/* Node Management Tab */}
        {activeTab === "cluster" && (
          <ClusterManagement 
            // Local node state
            localNodes={clusterManagement.localNodes}
            clusterLoading={clusterManagement.clusterLoading}
            nodeActionLoading={clusterManagement.nodeActionLoading}
            fetchLocalNodes={clusterManagement.fetchLocalNodes}
            handleStartLocalNode={clusterManagement.handleStartLocalNode}
            handleStopLocalNode={clusterManagement.handleStopLocalNode}
            handleDeleteLocalNode={clusterManagement.handleDeleteLocalNode}
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

      <NodeDetailsModal 
        show={showNodeDetailsModal}
        onClose={handleCloseNodeDetails}
        node={selectedNodeForDetails}
        formatBytes={formatBytes}
      />
        </>
      )}
    </div>
  );
}


