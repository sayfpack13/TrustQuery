import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faServer,
  faInfoCircle,
  faCog,
  faPlus,
  faSpinner,
  faCircle,
  faExclamationCircle,
  faPencilAlt,
  faTrash,
  faDatabase,
  faFolder,
  faHdd,
  faCubes,
  faNetworkWired,
  faChartLine,
  faClock,
  faMemory,
  faSitemap,
  faEdit,
  faCheck,
  faTimes,
  faSync,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import axiosClient from "../../../api/axiosClient";
import { formatBytes } from "../../../utils/format";
import buttonStyles from "../../../components/ButtonStyles";

export default function ClusterManagement({
  localNodes,
  enhancedNodesData: enhancedNodesDataProp,
  clusterLoading,
  nodeActionLoading,
  fetchLocalNodes,
  handleStartLocalNode,
  handleStopLocalNode,
  handleDeleteLocalNode,
  setShowLocalNodeManager,
  isAnyTaskRunning,
  onEditNode,
  onOpenNodeDetails,
  showNotification,
  clustersList = [],
  clustersLoading = false,
  clusterActionLoading = [],
  fetchClusters,
  createCluster,
  updateCluster,
  deleteCluster,
}) {
  // Use the enhanced data from the hook instead of local state
  const enhancedNodesData = enhancedNodesDataProp || {};

  // Loading state for metadata verification
  const [isVerifyingMetadata, setIsVerifyingMetadata] = useState(false);
  // Add state for delete confirmation modal and loading state for node deletion
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState(null);
  const [deletingNodeName, setDeletingNodeName] = useState(null); // Track which node is being deleted

  // Add state for cluster filtering
  const [selectedCluster, setSelectedCluster] = useState("all");

  // Keep selectedCluster in sync with clustersList (array of objects)
  useEffect(() => {
    if (
      selectedCluster !== "all" &&
      (!clustersList.some((c) => c.name === selectedCluster) ||
        clustersList.length === 0)
    ) {
      setSelectedCluster("all");
    }
  }, [clustersList, selectedCluster]);

  // Add state for cluster management
  const [showCreateClusterModal, setShowCreateClusterModal] = useState(false);
  const [newClusterName, setNewClusterName] = useState("");
  const [editingCluster, setEditingCluster] = useState(null);
  const [editedClusterName, setEditedClusterName] = useState("");
  const [showDeleteClusterModal, setShowDeleteClusterModal] = useState(false);
  const [clusterToDelete, setClusterToDelete] = useState(null);
  const [targetClusterForMove, setTargetClusterForMove] = useState("");

  // Helper function to get enhanced data for a node
  const getEnhancedNodeData = (nodeName) => {
    return enhancedNodesData[nodeName] || {};
  };

  // Helper function to format node roles
  const formatNodeRoles = (roles) => {
    if (!roles) return [];
    return Object.entries(roles)
      .filter(([, enabled]) => enabled)
      .map(([role]) => role);
  };

  // Helper function to calculate total documents across all indices
  const getTotalDocuments = (nodeData) => {
    if (!nodeData.indices || !Array.isArray(nodeData.indices)) return 0;
    return nodeData.indices.reduce((total, index) => {
      return total + (index["doc.count"] || 0);
    }, 0);
  };

  // Helper function to calculate total storage across all indices
  const getTotalStorage = (nodeData) => {
    if (!nodeData.indices || !Array.isArray(nodeData.indices)) return 0;
    return nodeData.indices.reduce((total, index) => {
      if (index["store.size"]) return total + index["store.size"];
      return total;
    }, 0);
  };

  // Helper function to format last update time
  const formatLastUpdate = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Improved metadata verification with loading state
  const handleVerifyMetadata = async () => {
    if (isVerifyingMetadata) return; // Prevent double operations

    setIsVerifyingMetadata(true);
    try {
      showNotification(
        "info",
        "Verifying node metadata...",
        faCircleNotch,
        true
      );
      const response = await axiosClient.post(
        "/api/admin/cluster-advanced/nodes/verify-metadata"
      );
      showNotification(
        "success",
        "Node metadata verification completed successfully",
        faCog
      );
      // Refresh the nodes list after verification
      await fetchLocalNodes();
      await fetchClusters();
    } catch (error) {
      showNotification(
        "error",
        `Failed to verify metadata: ${
          error.response?.data?.error || error.message
        }`,
        faExclamationCircle
      );
    } finally {
      setIsVerifyingMetadata(false);
    }
  };

  // Add handler for delete button click
  const handleDeleteClick = (node) => {
    setNodeToDelete(node);
    setShowDeleteModal(true);
  };

  // Add handler for confirming deletion
  const confirmDelete = async () => {
    if (!nodeToDelete) return;
    setDeletingNodeName(nodeToDelete.name);
    try {
      await handleDeleteLocalNode(nodeToDelete.name);
    } finally {
      setShowDeleteModal(false);
      setNodeToDelete(null);
      setDeletingNodeName(null);
    }
  };

  // Use clustersList prop for filter dropdown
  const getAllClusters = () => {
    return ["all", ...clustersList.map((c) => c.name)];
  };

  // Add a function to filter nodes by cluster
  const getFilteredNodes = () => {
    if (selectedCluster === "all") {
      return localNodes;
    }
    return localNodes.filter((node) => node.cluster === selectedCluster);
  };

  // Handle creating a new cluster
  const handleCreateCluster = async () => {
    if (!newClusterName.trim()) return;
    try {
      await createCluster(newClusterName);
      setNewClusterName("");
      setShowCreateClusterModal(false);
      await fetchClusters();
      await fetchLocalNodes();
    } catch (error) {
      // Error is already handled in the hook
    }
  };

  // Handle editing a cluster
  const handleEditCluster = (cluster) => {
    setEditingCluster(cluster);
    setEditedClusterName(cluster.name);
  };

  // Handle saving edited cluster
  const handleSaveClusterEdit = async () => {
    if (!editingCluster || !editedClusterName.trim()) return;
    try {
      await updateCluster(editingCluster.name, editedClusterName);
      setEditingCluster(null);
      setEditedClusterName("");
      await fetchClusters();
      await fetchLocalNodes();
    } catch (error) {
      // Error is already handled in the hook
    }
  };

  // Handle deleting a cluster
  const handleDeleteClusterClick = (cluster) => {
    setClusterToDelete(cluster);
    setShowDeleteClusterModal(true);

    // Set default target cluster (first available that's not the one being deleted)
    const availableTargets = clustersList.filter(
      (c) => c.name !== cluster.name
    );
    if (availableTargets.length > 0) {
      setTargetClusterForMove(availableTargets[0].name);
    } else {
      setTargetClusterForMove("trustquery-cluster");
    }
  };

  // Handle confirming cluster deletion
  const confirmDeleteCluster = async () => {
    if (!clusterToDelete) return;
    try {
      await deleteCluster(clusterToDelete.name, targetClusterForMove);
      setClusterToDelete(null);
      setShowDeleteClusterModal(false);
      setTargetClusterForMove("");
      await fetchClusters();
      await fetchLocalNodes();
    } catch (error) {
      // Error is already handled in the hook
    }
  };

  return (
    <>
      {/* Cluster Management Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white flex items-center">
            <FontAwesomeIcon icon={faSitemap} className="mr-3 text-primary" />
            Cluster Management
          </h2>

          <div className="flex space-x-3">
            <button
              onClick={() => setShowCreateClusterModal(true)}
              className={buttonStyles.primary}
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Create New Cluster
            </button>
            <button
              onClick={fetchClusters}
              className={buttonStyles.refresh}
              disabled={clustersLoading}
            >
              <FontAwesomeIcon
                icon={faRefresh}
                className={`mr-2 ${clustersLoading ? "fa-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {clustersLoading ? (
          <div className="flex justify-center items-center py-12">
            <FontAwesomeIcon
              icon={faSpinner}
              spin
              className="text-3xl text-purple-500 mr-3"
            />
            <span className="text-lg text-neutral-300">
              Loading clusters...
            </span>
          </div>
        ) : clustersList.length === 0 ? (
          <div className="text-center py-10">
            <FontAwesomeIcon
              icon={faSitemap}
              className="text-5xl text-neutral-500 mb-4"
            />
            <p className="text-neutral-400 text-lg mb-4">No clusters found</p>
            <p className="text-neutral-500 mb-6">
              Create your first cluster to organize your nodes
            </p>
            <button
              onClick={() => setShowCreateClusterModal(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg transition duration-150 ease-in-out"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-2" />
              Create Your First Cluster
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clustersList.map((cluster) => (
                <div
                  key={cluster.name}
                  className={`bg-neutral-700 rounded-xl p-5 border-2 ${
                    cluster.name === "trustquery-cluster"
                      ? "border-blue-500"
                      : "border-purple-500"
                  }`}
                >
                  {editingCluster && editingCluster.name === cluster.name ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-neutral-300">
                        Edit Cluster Name
                      </label>
                      <input
                        type="text"
                        value={editedClusterName}
                        onChange={(e) => setEditedClusterName(e.target.value)}
                        className="w-full p-2 bg-neutral-800 border border-neutral-600 rounded text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        placeholder="Enter new cluster name"
                      />
                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={handleSaveClusterEdit}
                          disabled={
                            !editedClusterName.trim() ||
                            clusterActionLoading.includes(cluster.name)
                          }
                          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {clusterActionLoading.includes(cluster.name) ? (
                            <FontAwesomeIcon
                              icon={faCircleNotch}
                              spin
                              className="mr-1"
                            />
                          ) : (
                            <FontAwesomeIcon icon={faCheck} className="mr-1" />
                          )}
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingCluster(null);
                            setEditedClusterName("");
                          }}
                          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg transition-colors"
                          disabled={clusterActionLoading.includes(cluster.name)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold text-white flex items-center">
                          <FontAwesomeIcon
                            icon={
                              cluster.name === "trustquery-cluster"
                                ? faSitemap
                                : faCubes
                            }
                            className={`mr-2 ${
                              cluster.name === "trustquery-cluster"
                                ? "text-blue-400"
                                : "text-purple-400"
                            }`}
                          />
                          {cluster.name}
                          {cluster.name === "trustquery-cluster" && (
                            <span className="ml-2 text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                              Default
                            </span>
                          )}
                        </h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditCluster(cluster)}
                            disabled={
                              cluster.name === "trustquery-cluster" ||
                              clusterActionLoading.includes(cluster.name)
                            }
                            className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              cluster.name === "trustquery-cluster"
                                ? "Cannot edit default cluster"
                                : "Edit cluster"
                            }
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button
                            onClick={() => handleDeleteClusterClick(cluster)}
                            disabled={
                              cluster.name === "trustquery-cluster" ||
                              clusterActionLoading.includes(cluster.name)
                            }
                            className="text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              cluster.name === "trustquery-cluster"
                                ? "Cannot delete default cluster"
                                : "Delete cluster"
                            }
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-300">Nodes:</span>
                          <span className="text-white font-medium">
                            {cluster.nodeCount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-300">Status:</span>
                          <div className="flex items-center">
                            <div
                              className={`w-2 h-2 rounded-full mr-2 ${
                                cluster.nodeCount > 0
                                  ? "bg-green-500"
                                  : "bg-neutral-500"
                              }`}
                            ></div>
                            <span className="text-white">
                              {cluster.nodeCount > 0 ? "Active" : "Empty"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            setSelectedCluster(cluster.name);
                            // Scroll to the nodes section
                            const nodesSection =
                              document.getElementById("nodes-section");
                            if (nodesSection) {
                              nodesSection.scrollIntoView({
                                behavior: "smooth",
                              });
                            }
                          }}
                          className={
                            buttonStyles.neutral +
                            " w-full flex items-center justify-center"
                          }
                        >
                          <FontAwesomeIcon icon={faServer} className="mr-2" />
                          View Nodes
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Node Management Section */}
      <section
        id="nodes-section"
        className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white">Node Management</h2>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowLocalNodeManager(true)}
              className={buttonStyles.primary}
            >
              <FontAwesomeIcon icon={faServer} className="mr-2" />
              Create New Node
            </button>
            <button
              onClick={fetchLocalNodes}
              className={buttonStyles.refresh}
              disabled={clusterLoading}
            >
              <FontAwesomeIcon
                icon={faRefresh}
                className={`mr-2 ${clusterLoading ? "fa-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={handleVerifyMetadata}
              className={buttonStyles.neutral}
              disabled={clusterLoading}
              title="Verify and clean up node metadata"
            >
              <FontAwesomeIcon
                icon={isVerifyingMetadata ? faSpinner : faCog}
                className={"mr-2" + (isVerifyingMetadata ? " fa-spin" : "")}
              />
              {isVerifyingMetadata ? "Verifying..." : "Verify Metadata"}
            </button>
          </div>
        </div>

        {/* Create Cluster Modal */}
        {showCreateClusterModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
            <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600 max-w-md w-full">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                <FontAwesomeIcon
                  icon={faSitemap}
                  className="mr-3 text-purple-500"
                />
                Create New Cluster
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Cluster Name
                </label>
                <input
                  type="text"
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  className="w-full p-3 bg-neutral-900 border border-neutral-700 rounded text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  placeholder="Enter cluster name"
                />
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  onClick={handleCreateCluster}
                  disabled={!newClusterName.trim()}
                  className={buttonStyles.primary}
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  <span>Create Cluster</span>
                </button>
                <button
                  onClick={() => {
                    setShowCreateClusterModal(false);
                    setNewClusterName("");
                  }}
                  className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Cluster Modal */}
        {showDeleteClusterModal && clusterToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
            <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600 max-w-lg w-full">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                <FontAwesomeIcon
                  icon={faExclamationCircle}
                  className="mr-3 text-red-500"
                />
                Delete Cluster
              </h3>
              <p className="text-neutral-300 mb-4">
                Are you sure you want to delete the cluster{" "}
                <span className="font-bold text-white">
                  {clusterToDelete.name}
                </span>
                ?
              </p>

              {clusterToDelete.nodeCount > 0 && (
                <div className="mb-6 p-4 bg-amber-900 bg-opacity-50 rounded-lg border border-amber-700">
                  <div className="flex items-start">
                    <FontAwesomeIcon
                      icon={faExclamationCircle}
                      className="text-amber-400 mt-1 mr-3"
                    />
                    <div>
                      <h4 className="text-amber-200 font-medium mb-2">
                        Cluster contains {clusterToDelete.nodeCount} nodes
                      </h4>
                      <p className="text-amber-300 text-sm mb-3">
                        These nodes must be moved to another cluster. Please
                        select a target cluster:
                      </p>
                      <select
                        value={targetClusterForMove}
                        onChange={(e) =>
                          setTargetClusterForMove(e.target.value)
                        }
                        className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      >
                        {clustersList
                          .filter((c) => c.name !== clusterToDelete.name)
                          .map((cluster) => (
                            <option key={cluster.name} value={cluster.name}>
                              {cluster.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <button
                  onClick={confirmDeleteCluster}
                  className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  disabled={clusterActionLoading.includes(clusterToDelete.name)}
                >
                  {clusterActionLoading.includes(clusterToDelete.name) ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} spin />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faTrash} />
                      <span>Delete Cluster</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteClusterModal(false);
                    setClusterToDelete(null);
                    setTargetClusterForMove("");
                  }}
                  className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg transition-colors"
                  disabled={clusterActionLoading.includes(
                    clusterToDelete?.name
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Global Statistics Banner */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Nodes */}
          <div className="bg-neutral-700 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {(localNodes || []).length}
                </div>
                <div className="text-sm text-neutral-300">Total Nodes</div>
              </div>
              <div className="bg-blue-600 p-3 rounded-full">
                <FontAwesomeIcon
                  icon={faServer}
                  className="text-white text-lg"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              {(localNodes || []).filter((n) => n.isRunning).length} running,{" "}
              {(localNodes || []).filter((n) => !n.isRunning).length} stopped
            </div>
          </div>

          {/* Total Indices */}
          <div className="bg-neutral-700 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {clusterLoading ? (
                    <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                  ) : (
                    Object.values(enhancedNodesData).reduce(
                      (total, nodeData) =>
                        total +
                        (nodeData.indices ? nodeData.indices.length : 0),
                      0
                    )
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Indices</div>
              </div>
              <div className="bg-purple-600 p-3 rounded-full">
                <FontAwesomeIcon
                  icon={faDatabase}
                  className="text-white text-lg"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              Across all nodes
            </div>
          </div>

          {/* Total Documents */}
          <div className="bg-neutral-700 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {clusterLoading ? (
                    <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                  ) : (
                    Object.values(enhancedNodesData)
                      .reduce(
                        (total, nodeData) =>
                          total + getTotalDocuments(nodeData),
                        0
                      )
                      .toLocaleString()
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Documents</div>
              </div>
              <div className="bg-green-600 p-3 rounded-full">
                <FontAwesomeIcon
                  icon={faChartLine}
                  className="text-white text-lg"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              Indexed documents
            </div>
          </div>

          {/* Total Storage */}
          <div className="bg-neutral-700 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {clusterLoading ? (
                    <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                  ) : (
                    (() => {
                      const totalBytes = Object.values(
                        enhancedNodesData
                      ).reduce(
                        (total, nodeData) => total + getTotalStorage(nodeData),
                        0
                      );
                      return formatBytes(totalBytes);
                    })()
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Storage</div>
              </div>
              <div className="bg-orange-600 p-3 rounded-full">
                <FontAwesomeIcon icon={faHdd} className="text-white text-lg" />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              Index storage used
            </div>
          </div>
        </div>

        {/* Cluster Health Summary */}
        {localNodes && localNodes.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-neutral-700 to-neutral-800 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-4 h-4 rounded-full ${
                      (localNodes || []).filter((n) => n.isRunning).length ===
                      localNodes.length
                        ? "bg-green-500 animate-pulse"
                        : (localNodes || []).filter((n) => n.isRunning).length >
                          0
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span className="text-white font-medium">
                    {(localNodes || []).filter((n) => n.isRunning).length ===
                    localNodes.length
                      ? "All Systems Operational"
                      : (localNodes || []).filter((n) => n.isRunning).length > 0
                      ? "Partial Operations"
                      : "Systems Offline"}
                  </span>
                </div>

                {/* Quick Stats */}
                <div className="hidden md:flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon icon={faCubes} className="text-blue-400" />
                    <span className="text-neutral-300">
                      {
                        [
                          ...new Set(
                            (localNodes || []).map(
                              (n) => n.cluster || "trustquery-cluster"
                            )
                          ),
                        ].length
                      }{" "}
                      cluster
                      {[
                        ...new Set(
                          (localNodes || []).map(
                            (n) => n.cluster || "trustquery-cluster"
                          )
                        ),
                      ].length !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon
                      icon={faNetworkWired}
                      className="text-green-400"
                    />
                    <span className="text-neutral-300">
                      {
                        [
                          ...new Set(
                            (localNodes || []).map((n) => `${n.host}:${n.port}`)
                          ),
                        ].length
                      }{" "}
                      endpoint
                      {[
                        ...new Set(
                          (localNodes || []).map((n) => `${n.host}:${n.port}`)
                        ),
                      ].length !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>
                  {!clusterLoading &&
                    Object.keys(enhancedNodesData).length > 0 && (
                      <div className="flex items-center space-x-2">
                        <FontAwesomeIcon
                          icon={faDatabase}
                          className="text-purple-400"
                        />
                        <span className="text-neutral-300">
                          {
                            Object.values(enhancedNodesData).filter(
                              (nodeData) =>
                                nodeData.indices && nodeData.indices.length > 0
                            ).length
                          }{" "}
                          active node
                          {Object.values(enhancedNodesData).filter(
                            (nodeData) =>
                              nodeData.indices && nodeData.indices.length > 0
                          ).length !== 1
                            ? "s"
                            : ""}{" "}
                          with data
                        </span>
                      </div>
                    )}
                </div>
              </div>

              <div className="text-xs text-neutral-400">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        {/* Status Banner */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  (localNodes || []).length > 0 ? "bg-green-500" : "bg-gray-500"
                }`}
              ></div>
              <span className="text-neutral-300 text-sm">
                Configured Nodes:{" "}
                <span className="text-white font-medium">
                  {(localNodes || []).length}
                </span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  (localNodes || []).filter((n) => n.isRunning).length > 0
                    ? "bg-green-500"
                    : "bg-amber-500"
                }`}
              ></div>
              <span className="text-neutral-300 text-sm">
                Running:{" "}
                <span className="text-white font-medium">
                  {(localNodes || []).filter((n) => n.isRunning).length}
                </span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  (localNodes || []).filter((n) => !n.isRunning).length > 0
                    ? "bg-red-500"
                    : "bg-gray-500"
                }`}
              ></div>
              <span className="text-neutral-300 text-sm">
                Stopped:{" "}
                <span className="text-white font-medium">
                  {(localNodes || []).filter((n) => !n.isRunning).length}
                </span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-neutral-300 text-sm">
                Mode:{" "}
                <span className="text-blue-300 font-medium">
                  Local Management
                </span>
              </span>
            </div>
            {localNodes && localNodes.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span className="text-neutral-300 text-sm">
                  Clusters:{" "}
                  <span className="text-purple-300 font-medium">
                    {
                      [
                        ...new Set(
                          (localNodes || []).map(
                            (n) => n.cluster || "trustquery-cluster"
                          )
                        ),
                      ].length
                    }
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
              {[
                ...new Set(
                  (localNodes || []).map(
                    (n) => n.cluster || "trustquery-cluster"
                  )
                ),
              ].map((cluster) => {
                const clusterNodes = (localNodes || []).filter(
                  (n) => (n.cluster || "trustquery-cluster") === cluster
                );
                const runningCount = clusterNodes.filter(
                  (n) => n.isRunning
                ).length;
                return (
                  <div
                    key={cluster}
                    className="bg-neutral-800 px-3 py-1 rounded-lg border border-neutral-600"
                  >
                    <span className="text-neutral-300 text-sm">
                      <span className="text-purple-300 font-medium">
                        {cluster}
                      </span>
                      <span className="ml-2">
                        ({runningCount}/{clusterNodes.length} running)
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3">
          {clusterLoading && (!localNodes || localNodes.length === 0) ? (
            <div className="text-center py-8 text-neutral-400">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading node information...
            </div>
          ) : (
            <div className="space-y-8">
              {/* Local Nodes Management */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Local Node Management
                </h3>
                {localNodes && localNodes.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-neutral-300">
                      Filter by cluster:
                    </label>
                    <select
                      value={selectedCluster}
                      onChange={(e) => setSelectedCluster(e.target.value)}
                      className="p-2 text-sm bg-neutral-800 border border-neutral-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {getAllClusters().map((cluster) => (
                        <option key={cluster} value={cluster}>
                          {cluster === "all" ? "All Clusters" : cluster}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!localNodes || localNodes.length === 0 ? (
                <div className="text-center py-8">
                  <FontAwesomeIcon
                    icon={faServer}
                    className="text-6xl text-neutral-500 mb-4"
                  />
                  <p className="text-neutral-400 mb-4">
                    No nodes configured yet
                  </p>
                  <p className="text-neutral-500 text-sm mb-6">
                    Start by creating your first Elasticsearch node. TrustQuery
                    will guide you through the setup process.
                  </p>
                  <button
                    onClick={() => setShowLocalNodeManager(true)}
                    className={buttonStyles.primary}
                  >
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Create Your First Node
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {getFilteredNodes().map((node) => {
                    const isLoading = (nodeActionLoading || []).includes(
                      node.name
                    );
                    const enhancedData = getEnhancedNodeData(node.name);
                    const totalDocs = getTotalDocuments(enhancedData);
                    const totalStorage = getTotalStorage(enhancedData);
                    const indicesCount = enhancedData.indices
                      ? enhancedData.indices.length
                      : 0;
                    const nodeRoles = formatNodeRoles(node.roles);

                    return (
                      <div
                        key={node.name}
                        className={`bg-neutral-800 rounded-2xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out border-2 ${
                          node.isRunning
                            ? indicesCount > 0
                              ? "border-green-500"
                              : "border-yellow-500"
                            : "border-red-500"
                        }`}
                      >
                        <div className="p-6">
                          {/* Node Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-4">
                              <div className="bg-primary p-3 rounded-full relative">
                                <FontAwesomeIcon
                                  icon={faServer}
                                  className="text-white text-xl"
                                />
                                {/* Health indicator badge */}
                                <div
                                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-neutral-800 ${
                                    node.isRunning
                                      ? indicesCount > 0
                                        ? "bg-green-500"
                                        : "bg-yellow-500"
                                      : "bg-red-500"
                                  }`}
                                  title={
                                    node.isRunning
                                      ? indicesCount > 0
                                        ? "Healthy - Running with data"
                                        : "Warning - Running but no indices"
                                      : "Offline - Node not running"
                                  }
                                ></div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center">
                                    <FontAwesomeIcon
                                      icon={faServer}
                                      className={`mr-2 ${
                                        node.isRunning
                                          ? "text-green-400"
                                          : "text-neutral-400"
                                      }`}
                                    />
                                    <h4 className="font-medium text-white">
                                      {node.name}
                                    </h4>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="text-sm text-neutral-400">
                                    {node.description ||
                                      `${node.host}:${node.port}`}
                                  </div>
                                  <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded ml-2">
                                    {node.cluster || "trustquery-cluster"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Node Status */}
                          <div className="mb-4 pb-4 border-b border-neutral-700">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faCircle}
                                  className={`${
                                    node.isRunning
                                      ? "text-green-500"
                                      : "text-red-500"
                                  } text-xs`}
                                />
                                <span className="text-sm font-semibold text-white">
                                  {node.isRunning ? "Running" : "Stopped"}
                                </span>
                              </div>
                              {enhancedData.lastCacheUpdate && (
                                <div
                                  className="text-xs text-neutral-500"
                                  title={new Date(
                                    enhancedData.lastCacheUpdate
                                  ).toLocaleString()}
                                >
                                  {node.isRunning
                                    ? "Live"
                                    : `Cached ${formatLastUpdate(
                                        enhancedData.lastCacheUpdate
                                      )}`}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Node Details */}
                          <div className="space-y-3 mb-4">
                            {/* Roles */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faCubes}
                                  className="text-blue-400 text-sm"
                                />
                                <span className="text-sm text-neutral-300">
                                  Roles:
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {nodeRoles.map((role) => (
                                  <span
                                    key={role}
                                    className="bg-blue-600 text-white text-xs px-2 py-1 rounded"
                                  >
                                    {role}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Memory */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faMemory}
                                  className="text-purple-400 text-sm"
                                />
                                <span className="text-sm text-neutral-300">
                                  Memory:
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm text-white font-medium">
                                  {node.heapSize || "Default"}
                                </span>
                                {node.isRunning && enhancedData.memory && (
                                  <div className="text-xs text-neutral-400">
                                    {formatBytes(enhancedData.memory.heapUsed)}{" "}
                                    / {formatBytes(enhancedData.memory.heapMax)}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Network */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faNetworkWired}
                                  className="text-green-400 text-sm"
                                />
                                <span className="text-sm text-neutral-300">
                                  Network:
                                </span>
                              </div>
                              <span className="text-sm text-white font-mono">
                                {node.host}:{node.port}
                              </span>
                            </div>

                            {/* Indices Count */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon
                                  icon={faDatabase}
                                  className="text-purple-400 text-sm"
                                />
                                <span className="text-sm text-neutral-300">
                                  Indices:
                                </span>
                              </div>
                              <span className="text-sm text-white font-medium">
                                {clusterLoading ? (
                                  <FontAwesomeIcon
                                    icon={faSpinner}
                                    className="fa-spin"
                                  />
                                ) : (
                                  indicesCount
                                )}
                              </span>
                            </div>

                            {/* Total Documents */}
                            {totalDocs > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <FontAwesomeIcon
                                    icon={faChartLine}
                                    className="text-yellow-400 text-sm"
                                  />
                                  <span className="text-sm text-neutral-300">
                                    Documents:
                                  </span>
                                </div>
                                <span className="text-sm text-white font-medium">
                                  {totalDocs.toLocaleString()}
                                </span>
                              </div>
                            )}

                            {/* Total Storage */}
                            {totalStorage > 0 && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <FontAwesomeIcon
                                    icon={faHdd}
                                    className="text-orange-400 text-sm"
                                  />
                                  <span className="text-sm text-neutral-300">
                                    Storage:
                                  </span>
                                </div>
                                <span className="text-sm text-white font-medium">
                                  {formatBytes(totalStorage)}
                                </span>
                              </div>
                            )}

                            {/* Data Path */}
                            {node.dataPath && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <FontAwesomeIcon
                                    icon={faFolder}
                                    className="text-amber-400 text-sm"
                                  />
                                  <span className="text-sm text-neutral-300">
                                    Data:
                                  </span>
                                </div>
                                <span
                                  className="text-xs text-neutral-400 font-mono truncate max-w-32"
                                  title={node.dataPath}
                                >
                                  {node.dataPath.split("\\").pop() ||
                                    node.dataPath.split("/").pop()}
                                </span>
                              </div>
                            )}

                            {/* Last Update */}
                            {enhancedData.lastCacheUpdate && (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <FontAwesomeIcon
                                    icon={faClock}
                                    className="text-gray-400 text-sm"
                                  />
                                  <span className="text-sm text-neutral-300">
                                    Last Update:
                                  </span>
                                </div>
                                <span className="text-sm text-white font-medium">
                                  {formatLastUpdate(
                                    enhancedData.lastCacheUpdate
                                  )}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="mt-6 flex items-center justify-between space-x-2">
                            <div className="flex space-x-2">
                              {node.isRunning ? (
                                <button
                                  onClick={() => handleStopLocalNode(node.name)}
                                  disabled={isLoading}
                                  className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-neutral-600 disabled:cursor-not-allowed"
                                >
                                  {isLoading ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                  ) : (
                                    "Stop"
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleStartLocalNode(node.name)
                                  }
                                  disabled={isLoading}
                                  className={buttonStyles.create}
                                >
                                  {isLoading ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                  ) : (
                                    "Start"
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => onOpenNodeDetails(node)}
                                className={buttonStyles.primary}
                                disabled={false}
                              >
                                Manage
                              </button>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => onEditNode(node)}
                                className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Edit Node"
                                disabled={false}
                              >
                                <FontAwesomeIcon icon={faPencilAlt} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(node)}
                                className={`text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                  deletingNodeName === node.name
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                                aria-label="Delete Node"
                                disabled={deletingNodeName === node.name}
                              >
                                {deletingNodeName === node.name ? (
                                  <FontAwesomeIcon icon={faCircleNotch} spin />
                                ) : (
                                  <FontAwesomeIcon icon={faTrash} />
                                )}
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
          )}
        </div>
      </section>

      {/* Add Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
          <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600 max-w-lg w-full">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
              <FontAwesomeIcon
                icon={faExclamationCircle}
                className="mr-3 text-red-500"
              />
              Confirm Node Deletion
            </h3>
            <p className="text-neutral-300 mb-2">
              Are you sure you want to permanently delete node{" "}
              <span className="font-bold text-white">{nodeToDelete?.name}</span>
              ?
            </p>
            <p className="text-red-400 text-sm mb-6">
              This action will delete all node data and configuration. This
              cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={confirmDelete}
                className={buttonStyles.delete}
                disabled={deletingNodeName === nodeToDelete?.name}
              >
                <FontAwesomeIcon
                  icon={
                    deletingNodeName === nodeToDelete?.name
                      ? faCircleNotch
                      : faTrash
                  }
                  className={
                    "mr-2" +
                    (deletingNodeName === nodeToDelete?.name ? " fa-spin" : "")
                  }
                />
                <span>Delete Node</span>
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg transition-colors"
                disabled={deletingNodeName === nodeToDelete?.name}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
