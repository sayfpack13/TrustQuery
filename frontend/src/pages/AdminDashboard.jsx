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
  faCog,
} from "@fortawesome/free-solid-svg-icons";
import LocalNodeManager from "../components/LocalNodeManager";
import ClusterSetupWizard from "../components/ClusterSetupWizard";
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
  // First time use detection
  const [firstTimeCheck, setFirstTimeCheck] = useState(true);
  // Track setup completion
  const [setupCompleted, setSetupCompleted] = useState(false);
  // Use shared dashboard hooks
  const {
    notification,
    tasksList,
    isAnyTaskRunning,
    showNotification,
    hideNotification,
    fetchAllTasks,
    estimateRemainingTime,
    removeTask,
    setCurrentRunningTaskId,
    setTasksList,
  } = useAdminDashboard();

  // === Tab Navigation State ===
  const [activeTab, setActiveTab] = useState("cluster"); // 'files', 'cluster', 'accounts', 'configuration'

  // === Advanced Node Configuration State ===
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showLocalNodeManager, setShowLocalNodeManager] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState(null);
  const [showNodeDetailsModal, setShowNodeDetailsModal] = useState(false);
  const [selectedNodeForDetails, setSelectedNodeForDetails] = useState(null);

  // === Loading state tracking ===
  const [isInitializing, setIsInitializing] = useState(true);
  // const [showSetupBanner, setShowSetupBanner] = useState(true); // REMOVE setup banner state

  // Custom hook for cluster management
  const clusterManagement = useClusterManagement(showNotification);

  // Fetch tasks on mount and check first time use
  useEffect(() => {
    const initializeDashboard = async () => {
      setIsInitializing(true);
      try {
        await Promise.all([
          fetchAllTasks(),
          clusterManagement.fetchLocalNodes()
        ]);
        // Check first time use and setup completion from backend
        const status = await axiosClient.get("/api/setup-wizard/status");
        if (status.data) {
          setSetupCompleted(!!status.data.setupCompleted);
          if (status.data.isFirstTimeUse) {
            setShowSetupWizard(true);
          }
        }
      } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        showNotification("error", "Failed to initialize dashboard", faExclamationTriangle);
      } finally {
        setIsInitializing(false);
        setFirstTimeCheck(false);
      }
    };
    initializeDashboard();
  }, [fetchAllTasks]);

  // Fetch additional data when cluster tab is active (only if data is stale)
  useEffect(() => {
    // Only fetch cluster data if we don't have any nodes loaded yet
    // This prevents unnecessary API calls when switching between tabs
    if ((activeTab === "cluster" || activeTab === "files") && 
        !clusterManagement.clusterLoading && 
        (!clusterManagement.localNodes || clusterManagement.localNodes.length === 0)) {
      clusterManagement.fetchLocalNodes();
    }
  }, [activeTab]); // Remove clusterManagement.fetchLocalNodes from dependency array to prevent loops

  // (REMOVED) Hide setup banner if nodes are configured



  // REMOVE: Setup wizard notification/banner from dashboard UI. It is now only accessible from the Configuration tab.

  const handleEditNode = async (node) => {
    if (!node || !node.name) {
      showNotification("error", "Invalid node data - missing node name", faExclamationTriangle);
      return;
    }
    
    try {
      // Fetch latest node details before editing
      const latestNodeDetails = await clusterManagement.getNodeDetails(node.name);
      setNodeToEdit(latestNodeDetails);
      setShowLocalNodeManager(true);
    } catch (error) {
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

  // Removed periodic refreshing - data will be refreshed on-demand through user actions

  // Overlay lockout if setup is not completed and wizard is not open
  const showLockout = !setupCompleted && !showSetupWizard && !isInitializing;

  return (
    <div className="bg-neutral-900 text-neutral-100 min-h-screen p-8 font-sans relative">
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
          {/* Lockout overlay if setup not completed */}
          {showLockout && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-80">
              <FontAwesomeIcon icon={faCog} spin className="text-5xl text-blue-400 mb-6" />
              <h2 className="text-3xl font-bold text-white mb-2">Complete Initial Setup</h2>
              <p className="text-lg text-neutral-300 mb-6 max-w-xl text-center">
                The TrustQuery setup wizard must be completed before you can use the admin dashboard.<br />
                Please follow the guided setup to configure your environment.
              </p>
              <button
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg text-lg font-semibold shadow-lg"
                onClick={() => setShowSetupWizard(true)}
              >
                Launch Setup Wizard
              </button>
            </div>
          )}
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
        
      {/* System Setup Banner removed: Setup Wizard is now only accessible from the Configuration tab */}
        
        {/* Tab Navigation */}
        <div className="mb-8 border-b border-neutral-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setupCompleted && setActiveTab("cluster")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "cluster"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              } ${!setupCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!setupCompleted}
            >
              Node Management
            </button>
                        <button
              onClick={() => setupCompleted && setActiveTab("files")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "files"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              } ${!setupCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!setupCompleted}
            >
              File Management
            </button>
            <button
              onClick={() => setupCompleted && setActiveTab("configuration")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "configuration"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              } ${!setupCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!setupCompleted}
            >
              Configuration
            </button>
            <button
              onClick={() => setupCompleted && setActiveTab("accounts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "accounts"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              } ${!setupCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!setupCompleted}
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
            showEditModal={false}
            setTasksList={setTasksList}
            setCurrentRunningTaskId={setCurrentRunningTaskId}
            availableNodes={clusterManagement.localNodes || []}
            enhancedNodesData={clusterManagement.enhancedNodesData || {}}
            disabled={!setupCompleted}
          />
        )}

        {/* Node Management Tab */}
        {activeTab === "cluster" && (
          <ClusterManagement 
            localNodes={clusterManagement.localNodes}
            enhancedNodesData={clusterManagement.enhancedNodesData}
            clusterLoading={clusterManagement.clusterLoading}
            nodeActionLoading={clusterManagement.nodeActionLoading}
            fetchLocalNodes={clusterManagement.fetchLocalNodes}
            handleStartLocalNode={clusterManagement.handleStartLocalNode}
            handleStopLocalNode={clusterManagement.handleStopLocalNode}
            handleDeleteLocalNode={clusterManagement.handleDeleteLocalNode}
            setShowLocalNodeManager={setupCompleted ? setShowLocalNodeManager : () => {}}
            isAnyTaskRunning={isAnyTaskRunning}
            onEditNode={setupCompleted ? handleEditNode : () => {}}
            onOpenNodeDetails={setupCompleted ? handleOpenNodeDetails : () => {}}
            showNotification={showNotification}
            disabled={!setupCompleted}
          />
        )}

        {/* Configuration Tab */}
        {activeTab === "configuration" && (
          <ConfigurationManagement 
            showNotification={showNotification}
            enhancedNodesData={clusterManagement.enhancedNodesData || {}}
            setShowSetupWizard={setupCompleted ? setShowSetupWizard : () => {}}
            disabled={!setupCompleted}
          />
        )}

        {/* Account Management Tab */}
        {activeTab === "accounts" && (
          <AccountManagement 
            showNotification={showNotification}
            isAnyTaskRunning={isAnyTaskRunning}
            enhancedNodesData={clusterManagement.enhancedNodesData || {}}
            disabled={!setupCompleted}
          />
        )}
      </div>

      {/* Modals Section - Moved outside main container for proper overlay */}
      {/* Local Node Manager */}
      {showLocalNodeManager && setupCompleted && (
        <LocalNodeManager
          isOpen={showLocalNodeManager}
          onClose={() => {
            setShowLocalNodeManager(false);
            setNodeToEdit(null);
          }}
          clusterManagement={clusterManagement}
          nodeToEdit={nodeToEdit}
          mode={nodeToEdit ? 'edit' : 'create'}
          disabled={!setupCompleted}
        />
      )}



      {/* Advanced Add Node Modal */}
      {showAddNodeModal && setupCompleted && (
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
                  disabled={!setupCompleted}
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
                  onClick={() => {
                    if (setupCompleted) {
                      clusterManagement.handleAddNode();
                      setShowAddNodeModal(false);
                    }
                  }}
                  disabled={!clusterManagement.newNodeUrl.trim() || !setupCompleted}
                  className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Node
                </button>
                                <button
                  onClick={() => setShowAddNodeModal(false)}
                  className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out"
                  disabled={!setupCompleted}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NodeDetailsModal 
        show={showNodeDetailsModal && setupCompleted}
        onClose={handleCloseNodeDetails}
        node={selectedNodeForDetails}
        enhancedNodesData={clusterManagement.enhancedNodesData || {}}
        onRefreshNodes={clusterManagement.fetchLocalNodes}
        disabled={!setupCompleted}
      />

      {/* Cluster Setup Wizard */}
      {showSetupWizard && (
        <ClusterSetupWizard
          isOpen={showSetupWizard}
          onClose={() => setShowSetupWizard(false)}
          onComplete={() => {
            setShowSetupWizard(false);
            setSetupCompleted(true); // Instantly unlock dashboard after /initialize
            clusterManagement.fetchLocalNodes(); // Refresh nodes after setup
            showNotification("success", "Cluster setup completed successfully!", faCheckCircle);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}


