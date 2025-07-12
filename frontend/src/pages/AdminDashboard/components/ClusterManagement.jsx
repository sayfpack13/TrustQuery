import React, { useState, useEffect } from "react";
import { useClusterManagement } from "../../../hooks/useClusterManagement";
import axiosClient from '../../../api/axiosClient';
// Removed: import { toast } from 'react-toastify';
import buttonStyles from '../../../components/ButtonStyles';
import { formatBytes } from '../../../utils/format';
import LocalNodeManager from '../../../components/LocalNodeManager';
import {
  faSitemap,
  faCubes,
  faServer,
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
  faCheck,
  faWrench,
  faMemory,
  faChartLine,
  faClock,
  faNetworkWired,
  faRefresh,
  faEdit,
  faExclamationTriangle,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function ClusterManagement(props) {
  // ...existing logic and hooks...
  // Connect to cluster management hook
  const {
    localNodes,
    enhancedNodesData,
    clusterLoading,
    nodeActionLoading,
    fetchLocalNodes,
    handleDeleteLocalNode,
    handleStartLocalNode,
    handleStopLocalNode,
    clustersList,
    clustersLoading,
    clusterActionLoading,
    fetchClusters,
    updateCluster,
    deleteCluster,
    createCluster,
    selectedCluster,
    setSelectedCluster
  } = useClusterManagement(props.showNotification, props.fetchAllTasks);

  // Add missing state for newClusterName
  const [newClusterName, setNewClusterName] = useState("");
  // State for modals and UI
  const [showCreateClusterModal, setShowCreateClusterModal] = useState(false);
  const [showDeleteClusterModal, setShowDeleteClusterModal] = useState(false);
  const [clusterToDelete, setClusterToDelete] = useState(null);
  const [targetClusterForMove, setTargetClusterForMove] = useState("");
  const [editingCluster, setEditingCluster] = useState(null);
  const [editedClusterName, setEditedClusterName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState(null);
  const [deletingNodeName, setDeletingNodeName] = useState("");
  // Remove old isVerifyingMetadata and isRepairingNodes, add new state
  const [isRepairingAndVerifying, setIsRepairingAndVerifying] = useState(false);

  // Handler to repair and verify all nodes (combined action)
  const handleRepairAndVerifyAllNodes = async () => {
    setIsRepairingAndVerifying(true);
    try {
      const response = await axiosClient.post("/api/admin/node-management/nodes/repair-and-verify");
      if (response.data && !response.data.error) {
        if (props.showNotification) props.showNotification("success", "All nodes repaired and metadata verified.");
        await fetchLocalNodes();
      } else {
        if (props.showNotification) props.showNotification("error", "Repair/Verify failed: " + (response.data?.error || "Unknown error"));
      }
    } catch (error) {
      if (props.showNotification) props.showNotification("error", "Error repairing/verifying nodes: " + (error.message || "Unknown error"));
    } finally {
      setIsRepairingAndVerifying(false);
    }
  };

  // Helper: get total documents from node data
  function getTotalDocuments(nodeData) {
    if (!nodeData || !nodeData.indices) return 0;
    return nodeData.indices.reduce((sum, idx) => sum + (idx['doc.count'] || 0), 0);
  }
  // Helper: get total storage from node data
  function getTotalStorage(nodeData) {
    if (!nodeData || !nodeData.indices) return 0;
    return nodeData.indices.reduce((sum, idx) => sum + (idx['store.size'] || 0), 0);
  }
  // Helper: get all clusters
  function getAllClusters() {
    return ['all', ...new Set((localNodes || []).map(n => n.cluster || 'trustquery-cluster'))];
  }
  // Helper: filter nodes by selected cluster
  function getFilteredNodes() {
    if (!localNodes) return [];
    if (!selectedCluster || selectedCluster === 'all') return localNodes;
    return localNodes.filter(n => (n.cluster || 'trustquery-cluster') === selectedCluster);
  }
  // Helper: get enhanced node data
  function getEnhancedNodeData(nodeName) {
    return enhancedNodesData[nodeName] || {};
  }
  // Helper: format node roles
  function formatNodeRoles(roles) {
    if (!roles) return [];
    return Object.entries(roles).filter(([, v]) => v).map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
  }
  // Helper: check if node exists
  function nodeExists(node) {
    return !!node && (!node.deleted);
  }
  // Helper: check if node is running
  function isNodeRunning(node) {
    return node && node.status === 'running';
  }
  // Helper: check if node has a running task
  function isNodeTaskRunning(nodeName) {
    return (nodeActionLoading || []).includes(nodeName);
  }
  // Helper: get node status color
  function getNodeStatusColor(status) {
    switch (status) {
      case 'running': return 'text-green-400';
      case 'starting': return 'text-blue-400';
      case 'stopped': return 'text-red-400';
      default: return 'text-neutral-400';
    }
  }
  // Helper: format last update
  function formatLastUpdate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleString();
  }
 
  // Handler: delete node (stub)
  function handleDeleteClick(node) {
    setNodeToDelete(node);
    setShowDeleteModal(true);
  }
  // Handler: confirm node delete (stub)
  async function confirmDelete() {
    if (!nodeToDelete) return;
    setDeletingNodeName(nodeToDelete.name);
    handleDeleteLocalNode(nodeToDelete.name).then(() => {
      setShowDeleteModal(false);
      setNodeToDelete(null);
      setDeletingNodeName('');
      fetchLocalNodes();
    });
  }
  // Handler: edit cluster
  function handleEditCluster(cluster) {
    setEditingCluster(cluster);
    setEditedClusterName(cluster.name);
  }
  // Handler: save cluster edit
  async function handleSaveClusterEdit() {
    if (!editingCluster || !editedClusterName.trim()) return;
    await updateCluster(editingCluster.name, editedClusterName.trim());
    setEditingCluster(null);
    setEditedClusterName('');
    fetchClusters();
  }
  // Handler: delete cluster click
  function handleDeleteClusterClick(cluster) {
    setClusterToDelete(cluster);
    setShowDeleteClusterModal(true);
    // Set default target cluster if nodes need to be moved
    if (cluster.nodeCount > 0) {
      const defaultTarget = clustersList.find(c => c.name !== cluster.name && c.name === 'trustquery-cluster');
      if (defaultTarget) {
        setTargetClusterForMove(defaultTarget.name);
      } else if (clustersList.length > 1) {
        const otherCluster = clustersList.find(c => c.name !== cluster.name);
        if (otherCluster) setTargetClusterForMove(otherCluster.name);
      }
    } else {
      setTargetClusterForMove('');
    }
  }
  // Handler: confirm delete cluster
  async function confirmDeleteCluster() {
    if (!clusterToDelete) return;
    
    // Validate that target cluster is selected if nodes need to be moved
    if (clusterToDelete.nodeCount > 0 && !targetClusterForMove) {
      props.showNotification('error', 'Please select a target cluster for the nodes', faExclamationTriangle);
      return;
    }
    
    try {
      await deleteCluster(clusterToDelete.name, targetClusterForMove);
      setShowDeleteClusterModal(false);
      setClusterToDelete(null);
      setTargetClusterForMove('');
      fetchClusters();
      props.showNotification('success', `Cluster "${clusterToDelete.name}" deleted successfully`, faCheck);
    } catch (error) {
      // Error is already handled in the deleteCluster function
      // Just keep the modal open
    }
  }
  // Handler: create cluster
  async function handleCreateCluster() {
    if (!newClusterName.trim()) return;
    await createCluster(newClusterName.trim());
    setShowCreateClusterModal(false);
    setNewClusterName('');
    fetchClusters();
  }

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
                  className={`bg-neutral-700 rounded-xl p-5 border-2 ${cluster.name === "trustquery-cluster"
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
                            className={`mr-2 ${cluster.name === "trustquery-cluster"
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
                              className={`w-2 h-2 rounded-full mr-2 ${cluster.nodeCount > 0
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
              onClick={() => props.setShowLocalNodeManager(true)}
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
              onClick={handleRepairAndVerifyAllNodes}
              className={buttonStyles.neutral}
              disabled={clusterLoading || isRepairingAndVerifying}
              title="Repair and verify all nodes and metadata"
            >
              <FontAwesomeIcon
                icon={isRepairingAndVerifying ? faSpinner : faWrench}
                className={"mr-2" + (isRepairingAndVerifying ? " fa-spin" : "")}
              />
              {isRepairingAndVerifying ? "Repairing..." : "Repair & Verify All Nodes"}
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
                        <option value="">Select target cluster</option>
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
                  disabled={clusterActionLoading.includes(clusterToDelete.name) || 
                           (clusterToDelete.nodeCount > 0 && !targetClusterForMove)}
                >
                  {clusterActionLoading.includes(clusterToDelete.name) ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faTrash} className="mr-2" />
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
              {(localNodes || []).filter((n) => n.status === "running").length} running,{" "}
              {(localNodes || []).filter((n) => n.status !== "running").length} stopped
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
                    className={`w-4 h-4 rounded-full ${(localNodes || []).filter((n) => n.status === "running").length ===
                      localNodes.length
                      ? "bg-green-500 animate-pulse"
                      : (localNodes || []).filter((n) => n.status === "running").length >
                        0
                        ? "bg-yellow-500"
                        : "bg-red-500"
                      }`}
                  ></div>
                  <span className="text-white font-medium">
                    {(localNodes || []).filter((n) => n.status === "running").length ===
                      localNodes.length
                      ? "All Systems Operational"
                      : (localNodes || []).filter((n) => n.status === "running").length > 0
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
                className={`w-3 h-3 rounded-full ${(localNodes || []).length > 0 ? "bg-green-500" : "bg-gray-500"
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
                className={`w-3 h-3 rounded-full ${(localNodes || []).filter((n) => n.status === "running").length > 0
                  ? "bg-green-500"
                  : "bg-amber-500"
                  }`}
              ></div>
              <span className="text-neutral-300 text-sm">
                Running:{" "}
                <span className="text-white font-medium">
                  {(localNodes || []).filter((n) => n.status === "running").length}
                </span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${(localNodes || []).filter((n) => n.status !== "running").length > 0
                  ? "bg-red-500"
                  : "bg-gray-500"
                  }`}
              ></div>
              <span className="text-neutral-300 text-sm">
                Stopped:{" "}
                <span className="text-white font-medium">
                  {(localNodes || []).filter((n) => n.status !== "running").length}
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
                  (n) => n.status === "running"
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
            <>
              <div className="text-center py-8 text-neutral-400"></div>
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading node information...
            </>
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
                    onClick={() => props.setShowLocalNodeManager(true)}
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
                    const isStarting = node.isStarting || node.status === "starting" || node.cacheStatus === "starting";
                    const exists = nodeExists(node);

                    return (
                      <div
                        key={node.name}
                        className={`bg-neutral-800 rounded-2xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out border-2 ${isStarting
                          ? "border-blue-500"
                          : isNodeRunning(node)
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
                                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-neutral-800 ${isStarting
                                    ? "bg-blue-500 animate-pulse"
                                    : isNodeRunning(node)
                                      ? indicesCount > 0
                                        ? "bg-green-500"
                                        : "bg-yellow-500"
                                      : "bg-red-500"
                                    }`}
                                  title={
                                    isStarting
                                      ? "Node is starting..."
                                      : isNodeRunning(node)
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
                                      className={`mr-2 ${isNodeRunning(node)
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
                                    {node.description || `${node.host}:${node.port}`}
                                  </div>
                                  <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded ml-2">
                                    {node.cluster || "trustquery-cluster"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Node Existence Warning */}
                          {!exists && (
                            <div className="mb-4 p-4 bg-red-900 rounded-lg border border-red-700">
                              <div className="flex items-center space-x-2">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400" />
                                <span className="text-red-200 font-semibold">Node data or logs missing. This node is no longer available. Please refresh or use Auto-Fix.</span>
                              </div>
                            </div>
                          )}

                          {/* Node Status */}
                          <div className="mb-4 pb-4 border-b border-neutral-700">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-2">
                                {isStarting ? (
                                  <FontAwesomeIcon icon={faSpinner} spin className="text-blue-400 text-xs mr-1" />
                                ) : (
                                  <FontAwesomeIcon
                                    icon={faCircle}
                                    className={getNodeStatusColor(node.status) + " text-xs"}
                                  />
                                )}
                                <span className="text-sm font-semibold text-white">
                                  {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                                </span>
                              </div>
                              {enhancedData.lastCacheUpdate && (
                                <div
                                  className="text-xs text-neutral-500"
                                  title={new Date(
                                    enhancedData.lastCacheUpdate
                                  ).toLocaleString()}
                                >
                                  {isNodeRunning(node)
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
                                {isNodeRunning(node) && enhancedData.memory && (
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
                              {isStarting ? (
                                <button
                                  disabled
                                  className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 opacity-70 cursor-not-allowed"
                                >
                                  <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                                  Starting...
                                </button>
                              ) : isNodeRunning(node) ? (
                                <button
                                  onClick={async () => {
                                    if (!exists) return;
                                    await handleStopLocalNode(node.name);
                                    await fetchLocalNodes();
                                    if (typeof props.fetchAllTasks === 'function') props.fetchAllTasks();
                                  }}
                                  disabled={isLoading || !exists}
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
                                  onClick={async () => {
                                    if (!exists) return;
                                    await handleStartLocalNode(node.name);
                                    await fetchLocalNodes();
                                    if (typeof props.fetchAllTasks === 'function') props.fetchAllTasks();
                                  }}
                                  disabled={isLoading || isNodeTaskRunning(node.name) || !exists}
                                  className={buttonStyles.create}
                                >
                                  {(isLoading || isNodeTaskRunning(node.name)) ? (
                                    <FontAwesomeIcon icon={faSpinner} spin />
                                  ) : (
                                    "Start"
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => exists && props.onOpenNodeDetails(node)}
                                className={buttonStyles.primary}
                                disabled={!exists}
                              >
                                Manage
                              </button>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={async () => {
                                  if (!exists) return;
                                  await props.onEditNode(node);
                                }}
                                className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Edit Node"
                                disabled={!exists}
                              >
                                <FontAwesomeIcon icon={faPencilAlt} />
                              </button>
                              <button
                                onClick={() => exists && handleDeleteClick(node)}
                                className={`text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${deletingNodeName === node.name ? "opacity-50 cursor-not-allowed" : ""
                                  }`}
                                aria-label="Delete Node"
                                disabled={deletingNodeName === node.name || !exists}
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
  
export default ClusterManagement;
  