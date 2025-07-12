// === frontend/src/pages/AdminDashboard.jsx ===
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import buttonStyles from "../components/ButtonStyles";

// Simple usePrevious implementation
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

// Improved polling: track polling per node, and stop polling if a node task is running
const nodePollingRefs = {};
function pollNodeStatus(nodeName, desiredStatus, clusterManagement, tasksList, maxAttempts = 10, interval = 2000) {
  if (nodePollingRefs[nodeName]) return; // Already polling for this node
  let attempts = 0;
  let stopped = false;
  nodePollingRefs[nodeName] = true;
  const poll = async () => {
    attempts++;
    // If a task is running for this node, stop polling
    const taskRunning = tasksList.some(
      (task) => task.nodeName === nodeName && !task.completed && task.status !== 'error'
    );
    if (taskRunning) {
      stopped = true;
      delete nodePollingRefs[nodeName];
      return;
    }
    await clusterManagement.fetchLocalNodes(true);
    const node = clusterManagement.localNodes.find(n => n.name === nodeName);
    if (node && node.status === desiredStatus) {
      // Node reached desired status, stop polling
      stopped = true;
      delete nodePollingRefs[nodeName];
      return;
    }
    if (attempts < maxAttempts && !stopped) {
      setTimeout(poll, interval);
    } else {
      delete nodePollingRefs[nodeName];
    }
  };
  poll();
}

// Debounce node refreshes triggered by task completion
const nodeRefreshDebounceRef = { timer: null, nodes: new Set() };

export default function AdminDashboard() {
  // Track setup completion
  const [setupCompleted, setSetupCompleted] = useState(false);
  
  // Setup wizard state
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  
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
  const [showLocalNodeManager, setShowLocalNodeManager] = useState(false);
  const [localNodeManagerMode, setLocalNodeManagerMode] = useState('create'); // 'create' or 'edit'
  const [nodeToEdit, setNodeToEdit] = useState(null);
  const [showNodeDetailsModal, setShowNodeDetailsModal] = useState(false);
  const [nodeDetailsModalNode, setNodeDetailsModalNode] = useState(null);
  const [nodeDetailsModalData, setNodeDetailsModalData] = useState({ stats: null, indices: null, config: null, loading: false, error: null });

  // === Loading state tracking ===
  const [isInitializing, setIsInitializing] = useState(true);

  // Custom hook for cluster management
  const clusterManagement = useClusterManagement(showNotification, fetchAllTasks);

  // Fetch tasks on mount and check first time use
  useEffect(() => {
    const initializeDashboard = async () => {
      setIsInitializing(true);
      try {
        await Promise.all([
          fetchAllTasks(),
          clusterManagement.fetchClusters(), // Fetch clusters on mount
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
        showNotification(
          "error",
          "Failed to initialize dashboard",
          faExclamationTriangle
        );
      } finally {
        setIsInitializing(false);
      }
    };
    initializeDashboard();
  }, [fetchAllTasks]);

  // Fetch additional data when cluster tab is active
  useEffect(() => {
    if (activeTab === "cluster" || activeTab === "files") {
      clusterManagement.fetchLocalNodes(); // No force refresh for background/tab change
    }
    // Only depend on activeTab to prevent infinite API calls
  }, [activeTab]);

  // Handler to open LocalNodeManager in create mode
  const handleOpenCreateNode = () => {
    setNodeToEdit(null);
    setLocalNodeManagerMode('create');
    setShowLocalNodeManager(true);
  };

  // Handler to open LocalNodeManager in edit mode
  const handleEditNode = (node) => {
    setNodeToEdit(node);
    setLocalNodeManagerMode('edit');
    setShowLocalNodeManager(true);
  };

  // Handler to open NodeDetailsModal
  const handleOpenNodeDetails = async (node) => {
    setShowNodeDetailsModal(true);
    setNodeDetailsModalNode(node);
    // If node is running, fetch live data
    if (node.status === 'running') {
      setNodeDetailsModalData({ stats: null, indices: null, config: null, loading: true, error: null, fromCache: false });
      try {
        const token = localStorage.getItem("token");
        const [statsRes, indicesRes, configRes] = await Promise.all([
          axiosClient.get(`/api/admin/node-management/nodes/${node.name}/stats`, { headers: { Authorization: `Bearer ${token}` } }),
          axiosClient.get(`/api/admin/node-management/${node.name}/indices`, { headers: { Authorization: `Bearer ${token}` } }),
          axiosClient.get(`/api/admin/node-management/${node.name}/config`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setNodeDetailsModalData({
          stats: statsRes.data,
          indices: indicesRes.data,
          config: configRes.data,
          loading: false,
          error: null,
          fromCache: false,
        });
      } catch (error) {
        setNodeDetailsModalData({ stats: null, indices: null, config: null, loading: false, error: error.message || "Failed to fetch node details", fromCache: false });
      }
    } else {
      // Use cached data
      const cached = clusterManagement.enhancedNodesData[node.name] || {};
      // Generate config string from metadata
      const meta = {
        name: node.name,
        cluster: node.cluster || 'trustquery-cluster',
        host: node.host || 'localhost',
        port: node.port || 9200,
        transportPort: node.transportPort || 9300,
        dataPath: node.dataPath || '',
        logsPath: node.logsPath || '',
        roles: node.roles || { master: true, data: true, ingest: true },
      };
      const configString = `# Elasticsearch Configuration for ${meta.name}\n# Generated from metadata (node is offline)\n\n# Cluster settings\ncluster.name: ${meta.cluster}\nnode.name: ${meta.name}\n\n# Network settings\nnetwork.host: ${meta.host}\nhttp.port: ${meta.port}\ntransport.port: ${meta.transportPort}\n\n# Path settings\npath.data: ${meta.dataPath}\npath.logs: ${meta.logsPath}\n\n# Node roles\nnode.roles: [${Object.entries(meta.roles).filter(([, v]) => v).map(([k]) => k).join(', ')}]\n\n# Custom attribute for shard allocation\nnode.attr.custom_id: ${meta.name}\n\n# Discovery settings\ndiscovery.type: single-node\n\n# Memory settings\nbootstrap.memory_lock: false\n\n# Security settings (basic)\nxpack.security.enabled: false\nxpack.security.transport.ssl.enabled: false\nxpack.security.http.ssl.enabled: false\n`;
      setNodeDetailsModalData({
        stats: null, // Optionally use cached stats if available
        indices: cached.indices || [],
        config: configString,
        loading: false,
        error: null,
        fromCache: true,
      });
    }
  };

  // Handler to close NodeDetailsModal
  const handleCloseNodeDetails = () => {
    setShowNodeDetailsModal(false);
    setNodeDetailsModalNode(null);
  };

  // Handler to close LocalNodeManager
  const handleCloseLocalNodeManager = () => {
    setShowLocalNodeManager(false);
    setNodeToEdit(null);
    setLocalNodeManagerMode('create');
    // No need to call fetchLocalNodes here as it's already called in the createLocalNode/updateLocalNode functions
  };

  // Overlay lockout if setup is not completed and wizard is not open
  const showLockout = !setupCompleted && !showSetupWizard && !isInitializing;

  const prevTasksList = usePrevious(tasksList);

  // Store clusterManagement in a ref to avoid dependency issues
  const clusterManagementRef = useRef(clusterManagement);
  useEffect(() => {
    clusterManagementRef.current = clusterManagement;
  }, [clusterManagement]);

  useEffect(() => {
    if (!prevTasksList) return;
    let nodesToRefresh = new Set();
    tasksList.forEach((task) => {
      const prevTask = prevTasksList.find((t) => t.taskId === task.taskId);
      // Only trigger polling/refresh if this task was not completed before, but is now completed, and is a node start/stop
      if (
        prevTask &&
        prevTask.status !== 'completed' &&
        task.status === 'completed' &&
        (task.type === 'Start Node' || task.type === 'Stop Node') &&
        task.nodeName &&
        // Only trigger if not already polling for this node
        !nodePollingRefs[task.nodeName]
      ) {
        // Determine desired status
        const desiredStatus = task.type === 'Start Node' ? 'running' : 'stopped';
        pollNodeStatus(task.nodeName, desiredStatus, clusterManagementRef.current, tasksList);
        nodesToRefresh.add(task.nodeName);
      }
    });
    if (nodesToRefresh.size > 0) {
      // Merge with any nodes already queued for refresh
      nodesToRefresh.forEach(n => nodeRefreshDebounceRef.nodes.add(n));
      if (nodeRefreshDebounceRef.timer) clearTimeout(nodeRefreshDebounceRef.timer);
      nodeRefreshDebounceRef.timer = setTimeout(() => {
        clusterManagement.fetchLocalNodes(true); // Only here use force refresh
        nodeRefreshDebounceRef.nodes.clear();
      }, 500);
    }
  }, [tasksList, prevTasksList, clusterManagement]);

  const handleRefreshNodesAndModal = async (force = false) => {
    await clusterManagement.fetchLocalNodes(force);
    if (showNodeDetailsModal && nodeDetailsModalNode) {
      setNodeDetailsModalData({ stats: null, indices: null, config: null, loading: true, error: null });
      try {
        const token = localStorage.getItem("token");
        const [statsRes, indicesRes, configRes] = await Promise.all([
          axiosClient.get(`/api/admin/node-management/nodes/${nodeDetailsModalNode.name}/stats`, { headers: { Authorization: `Bearer ${token}` } }),
          axiosClient.get(`/api/admin/node-management/${nodeDetailsModalNode.name}/indices`, { headers: { Authorization: `Bearer ${token}` } }),
          axiosClient.get(`/api/admin/node-management/${nodeDetailsModalNode.name}/config`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setNodeDetailsModalData({
          stats: statsRes.data,
          indices: indicesRes.data,
          config: configRes.data,
          loading: false,
          error: null,
        });
      } catch (error) {
        setNodeDetailsModalData({ stats: null, indices: null, config: null, loading: false, error: error.message || "Failed to fetch node details" });
      }
    }
  };

  // Memoize props for children to avoid unnecessary re-renders
  const clusterManagementProps = useMemo(() => ({
    localNodes: clusterManagement.localNodes,
    enhancedNodesData: clusterManagement.enhancedNodesData,
    clusterLoading: clusterManagement.clusterLoading,
    nodeActionLoading: clusterManagement.nodeActionLoading,
    fetchLocalNodes: clusterManagement.fetchLocalNodes,
    handleDeleteLocalNode: clusterManagement.handleDeleteLocalNode,
    handleStartLocalNode: clusterManagement.handleStartLocalNode,
    handleStopLocalNode: clusterManagement.handleStopLocalNode,
    clustersList: clusterManagement.clustersList,
    clustersLoading: clusterManagement.clustersLoading,
    clusterActionLoading: clusterManagement.clusterActionLoading,
    fetchClusters: clusterManagement.fetchClusters,
    updateCluster: clusterManagement.updateCluster,
    deleteCluster: clusterManagement.deleteCluster,
    createCluster: clusterManagement.createCluster,
    selectedCluster: clusterManagement.selectedCluster,
    setSelectedCluster: clusterManagement.setSelectedCluster,
    tasksList,
    showNotification,
    fetchAllTasks,
    setShowLocalNodeManager: handleOpenCreateNode,
    onEditNode: handleEditNode,
    onOpenNodeDetails: handleOpenNodeDetails,
    isAnyTaskRunning
  }), [
    clusterManagement.localNodes,
    clusterManagement.enhancedNodesData,
    clusterManagement.clusterLoading,
    clusterManagement.nodeActionLoading,
    clusterManagement.fetchLocalNodes,
    clusterManagement.handleDeleteLocalNode,
    clusterManagement.handleStartLocalNode,
    clusterManagement.handleStopLocalNode,
    clusterManagement.clustersList,
    clusterManagement.clustersLoading,
    clusterManagement.clusterActionLoading,
    clusterManagement.fetchClusters,
    clusterManagement.updateCluster,
    clusterManagement.deleteCluster,
    clusterManagement.createCluster,
    clusterManagement.selectedCluster,
    clusterManagement.setSelectedCluster,
    tasksList,
    showNotification,
    fetchAllTasks,
    handleOpenCreateNode,
    handleEditNode,
    handleOpenNodeDetails,
    isAnyTaskRunning
  ]);

  const filesManagementProps = useMemo(() => ({
    showNotification,
    isAnyTaskRunning,
    setTasksList,
    setCurrentRunningTaskId,
    availableNodes: clusterManagement.localNodes,
    enhancedNodesData: clusterManagement.enhancedNodesData,
    disabled: isAnyTaskRunning
  }), [showNotification, isAnyTaskRunning, setTasksList, setCurrentRunningTaskId, clusterManagement.localNodes, clusterManagement.enhancedNodesData]);

  const accountManagementProps = useMemo(() => ({
    showNotification,
    isAnyTaskRunning,
    enhancedNodesData: clusterManagement.enhancedNodesData,
    clustersList: clusterManagement.clustersList,
    disabled: isAnyTaskRunning
  }), [showNotification, isAnyTaskRunning, clusterManagement.enhancedNodesData, clusterManagement.clustersList]);

  return (
    <div className="bg-neutral-900 text-neutral-100 min-h-screen p-8 font-sans relative">
      {/* Notification banner */}
      {notification.isVisible && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-lg shadow-2xl flex items-center space-x-3 transition-transform duration-300 ease-out transform ${notification.isVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-20 opacity-0"
            } ${notification.type === "success" ? "bg-green-600 text-white" : ""
            } ${notification.type === "error" ? "bg-red-600 text-white" : ""} ${notification.type === "info" ? "bg-primary text-white" : ""
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
            <FontAwesomeIcon
              icon={faCircleNotch}
              className="fa-spin text-4xl text-primary mb-4"
            />
            <p className="text-xl text-neutral-300">
              Initializing Admin Dashboard...
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Lockout overlay if setup not completed */}
          {showLockout && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-80">
              <FontAwesomeIcon
                icon={faCog}
                spin
                className="text-5xl text-blue-400 mb-6"
              />
              <h2 className="text-3xl font-bold text-white mb-2">
                Complete Initial Setup
              </h2>
              <p className="text-lg text-neutral-300 mb-6 max-w-xl text-center">
                The TrustQuery setup wizard must be completed before you can use
                the admin dashboard.
                <br />
                Please follow the guided setup to configure your environment.
              </p>
              <button
                className={buttonStyles.primary}
                onClick={() => setShowSetupWizard(true)}
              >
                Launch Setup Wizard
              </button>
            </div>
          )}
          <div className="max-w-12xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-neutral-900 shadow-2xl rounded-xl border border-neutral-700">
            <h1 className="text-5xl font-extrabold text-primary mb-4">
              Admin Dashboard
            </h1>

            {/* Tab Navigation */}
            <div className="mb-8 border-b border-neutral-700">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setupCompleted && setActiveTab("cluster")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 flex items-center justify-center ${activeTab === "cluster"
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
                    } ${!setupCompleted ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!setupCompleted}
                >
                  Node Management
                </button>
                <button
                  onClick={() =>
                    setupCompleted && setActiveTab("configuration")
                  }
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 flex items-center justify-center ${activeTab === "configuration"
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
                    } ${!setupCompleted ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!setupCompleted}
                >
                  Configuration
                </button>
                <button
                  onClick={() => setupCompleted && setActiveTab("files")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 flex items-center justify-center ${activeTab === "files"
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
                    } ${!setupCompleted ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!setupCompleted}
                >
                  File Management
                </button>

                <button
                  onClick={() => setupCompleted && setActiveTab("accounts")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 flex items-center justify-center ${activeTab === "accounts"
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
                    } ${!setupCompleted ? "opacity-50 cursor-not-allowed" : ""}`}
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

            {/* Main content area */}
            <div className="mt-8">
              {/* Files Management Tab */}
              {activeTab === "files" && (
                <FilesManagement {...filesManagementProps} />
              )}

              {/* Cluster Management Tab */}
              {activeTab === "cluster" && (
                <ClusterManagement {...clusterManagementProps} />
              )}

              {/* Account Management Tab */}
              {activeTab === "accounts" && (
                <AccountManagement {...accountManagementProps} />
              )}

              {/* Configuration Tab */}
              {activeTab === "configuration" && (
                <ConfigurationManagement
                  showNotification={showNotification}
                  enhancedNodesData={clusterManagement.enhancedNodesData}
                  setShowSetupWizard={setShowSetupWizard}
                  onRefreshIndices={clusterManagement.fetchLocalNodes}
                />
              )}
            </div>
          </div>

          {/* Modals Section - Moved outside main container for proper overlay */}
          {/* Local Node Manager */}
          {showLocalNodeManager && (
            <LocalNodeManager
              isOpen={showLocalNodeManager}
              onClose={handleCloseLocalNodeManager}
              clusterManagement={clusterManagement}
              mode={localNodeManagerMode}
              nodeToEdit={nodeToEdit}
              showNotification={showNotification}
            />
          )}

          {/* NodeDetailsModal */}
          {showNodeDetailsModal && nodeDetailsModalNode && (
            <NodeDetailsModal
              show={showNodeDetailsModal}
              onClose={handleCloseNodeDetails}
              node={nodeDetailsModalNode}
              stats={nodeDetailsModalData.stats}
              indices={nodeDetailsModalData.indices}
              configContent={nodeDetailsModalData.config}
              loading={nodeDetailsModalData.loading}
              error={nodeDetailsModalData.error}
              fromCache={nodeDetailsModalData.fromCache}
              enhancedNodesData={clusterManagement.enhancedNodesData}
              onRefreshNodes={handleRefreshNodesAndModal}
            />
          )}

          {/* Cluster Setup Wizard */}
          {showSetupWizard && (
            <ClusterSetupWizard
              isOpen={showSetupWizard}
              onClose={() => setShowSetupWizard(false)}
              onComplete={() => {
                setShowSetupWizard(false);
                setSetupCompleted(true); // Instantly unlock dashboard after /initialize
                clusterManagement.fetchClusters(); // Refresh clusters after setup
                showNotification(
                  "success",
                  "Cluster setup completed successfully!",
                  faCheckCircle
                );
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
