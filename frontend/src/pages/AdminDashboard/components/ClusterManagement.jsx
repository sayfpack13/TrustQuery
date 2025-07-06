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
} from "@fortawesome/free-solid-svg-icons";
import axiosClient from "../../../api/axiosClient";

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
  formatBytes,
  onEditNode,
  onOpenNodeDetails,
  showNotification,
  disabled = false,
}) {
  // Use the enhanced data from the hook instead of local state
  const enhancedNodesData = enhancedNodesDataProp || {};

  // Loading state for metadata verification
  const [isVerifyingMetadata, setIsVerifyingMetadata] = useState(false);

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
      return total + (index.docCount || parseInt(index["docs.count"], 10) || 0);
    }, 0);
  };

  // Helper function to calculate total storage across all indices
  const getTotalStorage = (nodeData) => {
    if (!nodeData.indices || !Array.isArray(nodeData.indices)) return 0;
    return nodeData.indices.reduce((total, index) => {
      // Use store_size (number, in bytes) from backend
      if (typeof index.store_size === 'number') return total + index.store_size;
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
      console.log(
        "Metadata verification completed:",
        response.data
      );
      showNotification(
        "success",
        "Node metadata verification completed successfully",
        faCog
      );
      // Refresh the nodes list after verification
      await fetchLocalNodes();
    } catch (error) {
      console.error("Failed to verify metadata:", error);
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

  return (
    <>
      {/* Node Management Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-white">Node Management</h2>
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
              disabled={disabled || clusterLoading}
            >
              <FontAwesomeIcon
                icon={faCircleNotch}
                className={`mr-2 ${clusterLoading ? "fa-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={handleVerifyMetadata}
              className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75"
              disabled={disabled || clusterLoading}
              title="Verify and clean up node metadata"
            >
              <FontAwesomeIcon icon={faCog} className="mr-2" />
              {isVerifyingMetadata ? "Verifying..." : "Verify Metadata"}
            </button>
          </div>
        </div>

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
                <FontAwesomeIcon icon={faServer} className="text-white text-lg" />
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
                        total + (nodeData.indices ? nodeData.indices.length : 0),
                      0
                    )
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Indices</div>
              </div>
              <div className="bg-purple-600 p-3 rounded-full">
                <FontAwesomeIcon icon={faDatabase} className="text-white text-lg" />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">Across all nodes</div>
          </div>

          {/* Total Documents */}
          <div className="bg-neutral-700 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">
                  {clusterLoading ? (
                    <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                  ) : (
                    Object.values(enhancedNodesData).reduce(
                      (total, nodeData) => total + getTotalDocuments(nodeData),
                      0
                    ).toLocaleString()
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Documents</div>
              </div>
              <div className="bg-green-600 p-3 rounded-full">
                <FontAwesomeIcon icon={faChartLine} className="text-white text-lg" />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">Indexed documents</div>
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
                      const totalBytes = Object.values(enhancedNodesData).reduce(
                        (total, nodeData) => total + getTotalStorage(nodeData),
                        0
                      );
                      return formatBytes
                        ? formatBytes(totalBytes)
                        : `${(totalBytes / 1024 / 1024).toFixed(1)}MB`;
                    })()
                  )}
                </div>
                <div className="text-sm text-neutral-300">Total Storage</div>
              </div>
              <div className="bg-orange-600 p-3 rounded-full">
                <FontAwesomeIcon icon={faHdd} className="text-white text-lg" />
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-400">Index storage used</div>
          </div>
        </div>

        {/* Cluster Health Summary */}
        {localNodes && localNodes.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-neutral-700 to-neutral-800 rounded-lg p-4 border border-neutral-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-4 h-4 rounded-full ${
                    (localNodes || []).filter(n => n.isRunning).length === localNodes.length 
                      ? 'bg-green-500 animate-pulse' 
                      : (localNodes || []).filter(n => n.isRunning).length > 0 
                        ? 'bg-yellow-500' 
                        : 'bg-red-500'
                  }`}></div>
                  <span className="text-white font-medium">
                    {(localNodes || []).filter(n => n.isRunning).length === localNodes.length 
                      ? 'All Systems Operational' 
                      : (localNodes || []).filter(n => n.isRunning).length > 0 
                        ? 'Partial Operations' 
                        : 'Systems Offline'
                    }
                  </span>
                </div>
                
                {/* Quick Stats */}
                <div className="hidden md:flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon icon={faCubes} className="text-blue-400" />
                    <span className="text-neutral-300">
                      {[...new Set((localNodes || []).map(n => n.cluster || 'trustquery-cluster'))].length} cluster{[...new Set((localNodes || []).map(n => n.cluster || 'trustquery-cluster'))].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon icon={faNetworkWired} className="text-green-400" />
                    <span className="text-neutral-300">
                      {[...new Set((localNodes || []).map(n => `${n.host}:${n.port}`))].length} endpoint{[...new Set((localNodes || []).map(n => `${n.host}:${n.port}`))].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {!clusterLoading && Object.keys(enhancedNodesData).length > 0 && (
                    <div className="flex items-center space-x-2">
                      <FontAwesomeIcon icon={faDatabase} className="text-purple-400" />
                      <span className="text-neutral-300">
                        {Object.values(enhancedNodesData).filter(nodeData => nodeData.indices && nodeData.indices.length > 0).length} active node{Object.values(enhancedNodesData).filter(nodeData => nodeData.indices && nodeData.indices.length > 0).length !== 1 ? 's' : ''} with data
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
        <div className="mb-6 p-4 bg-neutral-700 rounded-lg border border-neutral-600">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    (localNodes || []).length > 0
                      ? "bg-green-500"
                      : "bg-gray-500"
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
                <FontAwesomeIcon
                  icon={faCircleNotch}
                  className="fa-spin mr-2"
                />
                Loading node information...
              </div>
            ) : (
              <div className="space-y-8">
                {/* Local Nodes Management */}
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
                      Start by creating your first Elasticsearch node.
                      TrustQuery will guide you through the setup process.
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
                                ? 'border-green-500' 
                                : 'border-yellow-500'
                              : 'border-red-500'
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
                                  <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-neutral-800 ${
                                    node.isRunning 
                                      ? indicesCount > 0 
                                        ? 'bg-green-500' 
                                        : 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`} title={
                                    node.isRunning 
                                      ? indicesCount > 0 
                                        ? 'Healthy - Running with data' 
                                        : 'Warning - Running but no indices'
                                      : 'Offline - Node not running'
                                  }></div>
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-white">
                                    {node.name}
                                  </h3>
                                  <div className="text-sm text-neutral-400">
                                    {node.description ||
                                      `${node.host}:${node.port}`}
                                  </div>
                                  <div className="text-xs text-neutral-500 mt-1">
                                    Cluster: {node.cluster}
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
                                  <div className="text-xs text-neutral-500" title={new Date(enhancedData.lastCacheUpdate).toLocaleString()}>
                                    {node.isRunning ? "Live" : `Cached ${formatLastUpdate(enhancedData.lastCacheUpdate)}`}
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
                                    <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
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
                                    {formatBytes
                                      ? formatBytes(totalStorage)
                                      : `${(totalStorage / 1024 / 1024).toFixed(1)}MB`}
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
                                    {node.dataPath
                                      .split("\\")
                                      .pop() ||
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
                                    {formatLastUpdate(enhancedData.lastCacheUpdate)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="mt-6 flex items-center justify-between space-x-2">
                              <div className="flex space-x-2">
                                {node.isRunning ? (
                                  <button
                                    onClick={() =>
                                      handleStopLocalNode(node.name)
                                    }
                                    disabled={disabled || isLoading}
                                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center"
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
                                    disabled={disabled || isLoading}
                                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center"
                                  >
                                    {isLoading ? (
                                      <FontAwesomeIcon icon={faSpinner} spin />
                                    ) : (
                                      "Start"
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={disabled ? undefined : () => onOpenNodeDetails(node)}
                                  className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={disabled}
                                >
                                  Manage
                                </button>
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={disabled ? undefined : () => onEditNode(node)}
                                  className="text-neutral-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Edit Node"
                                  disabled={disabled}
                                >
                                  <FontAwesomeIcon icon={faPencilAlt} />
                                </button>
                                <button
                                  onClick={disabled ? undefined : () => handleDeleteLocalNode(node.name)}
                                  className="text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Delete Node"
                                  disabled={disabled}
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
            )}
          </div>
        </div>
      </section>
    </>
  );
}
