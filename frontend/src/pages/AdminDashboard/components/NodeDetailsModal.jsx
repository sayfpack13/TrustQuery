import React, { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faServer,
  faInfoCircle,
  faDatabase,
  faPlus,
  faTrash,
  faExclamationTriangle,
  faHdd,
  faCircleNotch,
  faMemory,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import axiosClient from "../../../api/axiosClient";
import { formatBytes } from "../../../utils/format";
import buttonStyles from "../../../components/ButtonStyles";

const NodeDetailsModal = React.memo(function NodeDetailsModal({
  show,
  onClose,
  node,
  stats,
  indices,
  configContent,
  loading,
  error,
  fromCache,
  enhancedNodesData = {},
  onRefreshNodes
}) {
  // All hooks must be called at the top, before any early returns
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateIndexForm, setShowCreateIndexForm] = useState(false);
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexShards, setNewIndexShards] = useState("1");
  const [newIndexReplicas, setNewIndexReplicas] = useState("0");
  const [indicesError, setIndicesError] = useState(null);
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);
  const [isDeletingIndex, setIsDeletingIndex] = useState(null);
  const refreshInProgress = useRef(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Add a ref to track if the modal is open for polling cancellation
  const isModalOpenRef = useRef(show);
  useEffect(() => { isModalOpenRef.current = show; }, [show]);

  // Hide create index form if node stops running
  useEffect(() => {
    if (!show || !node) return;
    if (node.status !== "running" && showCreateIndexForm) {
      setShowCreateIndexForm(false);
    }
  }, [node, showCreateIndexForm, show]);

  // Reset state when modal is closed
  useEffect(() => {
    if (show) return;
    setShowCreateIndexForm(false);
    setNewIndexName("");
    setNewIndexShards("1");
    setNewIndexReplicas("0");
    setShowDeleteModal(false);
    setIndexToDelete(null);
    setIndicesError(null);
    setIsDeletingIndex(null);
  }, [show]);

  // Listen for cache refresh events - but don't trigger fetch if we just updated
  useEffect(() => {
    if (!show) return;
    const handleCacheRefresh = () => {
      if (node && !refreshInProgress.current) {
        // No need to fetch indices here, as they are managed by enhancedNodesData
      }
    };
    window.addEventListener("indicesCacheRefreshed", handleCacheRefresh);
    return () => {
      window.removeEventListener("indicesCacheRefreshed", handleCacheRefresh);
    };
  }, [node, show]);

  // Only fetch node details when modal opens or node changes, not on input change
  useEffect(() => {
    if (show && node?.name) {
      axiosClient.get(`/api/admin/node-management/nodes/${node.name}`)
        .then(() => {
          // setNodeDetails(res.data); // This line was removed as per the edit hint
        })
        .catch(err => {});
    }
    // Do not depend on form state/input value
  }, [show, node?.name]);

  if (!node) return null;

  // Add validation for form inputs
  const isValidIndexName = newIndexName.trim().length > 0;
  const isValidShards = parseInt(newIndexShards) > 0;
  const isValidReplicas = parseInt(newIndexReplicas) >= 0;
  const isFormValid = isValidIndexName && isValidShards && isValidReplicas;

  const handleCreateIndex = async () => {
    if (!isFormValid || refreshInProgress.current || isCreatingIndex) {
      return;
    }

    refreshInProgress.current = true;
    setIsCreatingIndex(true);
    setIndicesError(null); // Clear any previous errors

    try {
      await axiosClient.post(
        `/api/admin/node-management/${node.name}/indices`,
        {
          indexName: newIndexName.trim(),
          shards: parseInt(newIndexShards),
          replicas: parseInt(newIndexReplicas),
        }
      );

      // Reset form and close
      setShowCreateIndexForm(false);
      setNewIndexName("");
      setNewIndexShards("1");
      setNewIndexReplicas("0");

      // Poll for index to appear
      // await pollForIndexChange(newIndexName.trim(), true); // This line was removed as per the edit hint

      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
      // refreshIndices(); // Refresh indices after successful creation // This line was removed as per the edit hint
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Failed to create index";
      setIndicesError(`Failed to create index: ${errorMessage}`);

      // Don't close the form on error, let user retry
      setShowCreateIndexForm(true);
    } finally {
      setIsCreatingIndex(false);
      refreshInProgress.current = false;
    }
  };

  const handleDeleteClick = (index) => {
    setIndexToDelete(index);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!indexToDelete || refreshInProgress.current || isDeletingIndex) {
      return;
    }

    refreshInProgress.current = true;
    setIsDeletingIndex(indexToDelete.index);
    setIndicesError(null); // Clear any previous errors

    try {
      // Use the correct node-specific API endpoint
      await axiosClient.delete(
        `/api/admin/node-management/${node.name}/indices/${indexToDelete.index}`
      );

      // Poll for index to disappear
      // await pollForIndexChange(indexToDelete.index, false); // This line was removed as per the edit hint

      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
      // refreshIndices(); // Refresh indices after successful deletion // This line was removed as per the edit hint
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || err.message || "Failed to delete index";
      setIndicesError(`Failed to delete index: ${errorMessage}`);

      // For delete errors, we might want to show an alert as well since it's a destructive operation
      alert(`Failed to delete index '${indexToDelete.index}': ${errorMessage}`);
    } finally {
      setShowDeleteModal(false);
      setIndexToDelete(null);
      setIsDeletingIndex(null);
      refreshInProgress.current = false;
    }
  };

  const renderContent = () => {
    const isStarting = node.status === "starting" || node.cacheStatus === "starting";
    const isStopping = node.status === "stopping" || node.cacheStatus === "stopping";
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Node Status */}
            <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
              <h3 className="text-lg font-semibold text-white mb-4">
                Node Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Status:</span>
                  <div className="flex items-center space-x-2">
                    {isStarting ? (
                      <>
                        <FontAwesomeIcon icon={faCircleNotch} spin className="text-blue-400 text-xs mr-1" />
                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                        <span className="text-white font-medium">Starting</span>
                      </>
                    ) : isStopping ? (
                      <>
                        <FontAwesomeIcon icon={faCircleNotch} spin className="text-yellow-400 text-xs mr-1" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
                        <span className="text-white font-medium">Stopping</span>
                      </>
                    ) : (
                      <>
                        <div
                          className={`w-3 h-3 rounded-full ${node.status === "running" ? "bg-green-500" : "bg-red-500"}`}
                        ></div>
                        <span className="text-white font-medium">
                          {node.status === "running" ? "Running" : "Stopped"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Memory Usage */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Memory:</span>
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon
                      icon={faMemory}
                      className="text-blue-400"
                    />
                    <span className="text-white font-medium">
                      {node.heapSize || "Default"}
                    </span>
                  </div>
                </div>

                {/* Cluster */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Cluster:</span>
                  <span className="text-white font-medium">
                    {node.cluster || "trustquery-cluster"}
                  </span>
                </div>

                {/* Endpoint */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Endpoint:</span>
                  <span className="text-white font-medium font-mono">
                    {node.host}:{node.port}
                  </span>
                </div>

                {/* Transport Port */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Transport Port:</span>
                  <span className="text-white font-medium font-mono">
                    {node.transportPort}
                  </span>
                </div>

                {/* Roles */}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Roles:</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {Object.entries(node.roles || {})
                      .filter(([, enabled]) => enabled)
                      .map(([role]) => (
                        <span
                          key={role}
                          className="bg-blue-600 text-white text-xs px-2 py-1 rounded"
                        >
                          {role}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Memory Information */}
            {node.status === "running" && enhancedNodesData[node.name]?.memory && (
              <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Memory Usage
                </h3>
                <div className="space-y-4">
                  {/* Heap Memory */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-neutral-300">JVM Heap Memory:</span>
                      <div className="text-right">
                        <div className="text-white font-medium">
                          {formatBytes(
                            enhancedNodesData[node.name].memory.heapUsed
                          )}{" "}
                          /{" "}
                          {formatBytes(
                            enhancedNodesData[node.name].memory.heapMax
                          )}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {Math.round(
                            (enhancedNodesData[node.name].memory.heapUsed /
                              enhancedNodesData[node.name].memory.heapMax) *
                            100
                          )}
                          % used
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-neutral-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            (enhancedNodesData[node.name].memory.heapUsed /
                              enhancedNodesData[node.name].memory.heapMax) *
                            100
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Non-Heap Memory */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-neutral-300">Non-Heap Memory:</span>
                      <div className="text-right">
                        <div className="text-white font-medium">
                          {formatBytes(
                            enhancedNodesData[node.name].memory.nonHeapUsed
                          )}
                        </div>
                        <div className="text-xs text-neutral-400">
                          Used by native memory
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Memory Pool Details */}
                  {enhancedNodesData[node.name].memory.pools && (
                    <div className="mt-4 pt-4 border-t border-neutral-600">
                      <h4 className="text-sm font-medium text-white mb-3">
                        Memory Pools
                      </h4>
                      <div className="space-y-3">
                        {Object.entries(
                          enhancedNodesData[node.name].memory.pools
                        ).map(([pool, stats]) => (
                          <div key={pool} className="text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-neutral-300">{pool}:</span>
                              <span className="text-white font-medium">
                                {formatBytes(stats.used)} /{" "}
                                {formatBytes(stats.max)}
                              </span>
                            </div>
                            <div className="w-full bg-neutral-700 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.round(
                                    (stats.used / stats.max) * 100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Node Information */}
            <div>
              <h4 className="text-xl font-semibold text-white mb-4 flex items-center">
                <FontAwesomeIcon icon={faHdd} className="mr-2" />
                Disk Usage
              </h4>
              {node.status !== "running" ? (
                <div className="p-4 bg-amber-600 rounded-lg border border-amber-500">
                  <p className="text-amber-100 text-sm">
                    Node must be running to view disk statistics.
                  </p>
                </div>
              ) : loading ? (
                <div className="flex items-center text-neutral-400">
                  <FontAwesomeIcon
                    icon={faCircleNotch}
                    className="fa-spin mr-2"
                  />
                  Loading disk statistics...
                </div>
              ) : error ? (
                <div className="p-4 bg-amber-600 rounded-lg border border-amber-500">
                  <p className="text-amber-100 text-sm">{error}</p>
                  <button
                    onClick={onRefreshNodes}
                    className={buttonStyles.delete + " mt-2 px-4 py-2"}
                  >
                    Retry
                  </button>
                </div>
              ) : stats &&
                stats.diskInfo &&
                stats.diskInfo.length > 0 ? (
                <div className="space-y-3">
                  {stats.diskInfo.map((disk, index) => (
                    <div key={index} className="bg-neutral-700 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-white">
                          {disk.path}
                        </span>
                        <span className="text-sm text-neutral-300">
                          {disk.usedPercent}% used
                        </span>
                      </div>
                      <div className="w-full bg-neutral-800 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${disk.usedPercent > 90
                              ? "bg-red-500"
                              : disk.usedPercent > 75
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                          style={{ width: `${disk.usedPercent}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-neutral-400 mt-1">
                        <span>
                          Used: {(disk.used / 1024 ** 3).toFixed(1)} GB
                        </span>
                        <span>
                          Free: {(disk.free / 1024 ** 3).toFixed(1)} GB
                        </span>
                        <span>
                          Total: {(disk.total / 1024 ** 3).toFixed(1)} GB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-400">
                  No disk usage information available.
                </p>
              )}
            </div>
          </div>
        );
      case "indices":
        // Loading and error states for indices
        if (loading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading indices...
            </div>
          );
        }
        if (error) {
          return (
            <div className="text-red-500 text-center py-4">{error}</div>
          );
        }
        // Normal indices table render
        return (
          <div>
            {/* Create Index Modal/Form */}
            {showCreateIndexForm && (
              <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[70]">
                <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600 w-full max-w-md">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Create New Index
                  </h3>
                  {indicesError && (
                    <div className="mb-3 p-2 bg-red-700 text-red-100 rounded text-sm border border-red-500">
                      {indicesError}
                    </div>
                  )}
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleCreateIndex();
                    }}
                  >
                    <div className="mb-4">
                      <label className="block text-neutral-300 mb-1">Index Name</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={newIndexName}
                        onChange={e => setNewIndexName(e.target.value)}
                        disabled={isCreatingIndex}
                        placeholder="e.g. accounts"
                        autoFocus
                      />
                    </div>
                    <div className="flex space-x-4 mb-4">
                      <div className="flex-1">
                        <label className="block text-neutral-300 mb-1">Shards</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white focus:outline-none"
                          value={newIndexShards}
                          onChange={e => setNewIndexShards(e.target.value)}
                          disabled={isCreatingIndex}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-neutral-300 mb-1">Replicas</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-white focus:outline-none"
                          value={newIndexReplicas}
                          onChange={e => setNewIndexReplicas(e.target.value)}
                          disabled={isCreatingIndex}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">

                      <button
                        type="submit"
                        className={buttonStyles.create + " px-4 py-2 flex items-center"}
                        disabled={isCreatingIndex || !isFormValid}
                      >
                        {isCreatingIndex ? (
                          <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
                        ) : null}
                        Create
                      </button>
                      <button
                        type="button"
                        className={buttonStyles.cancel + " px-4 py-2"}
                        onClick={() => {
                          setShowCreateIndexForm(false);
                          setIndicesError(null);
                        }}
                        disabled={isCreatingIndex}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {(node.status !== "running" && node.status !== "starting" && node.status !== "stopping") && (
              <div className="mb-4 p-4 bg-amber-600 rounded-lg border border-amber-500">
                <div className="flex items-center space-x-3">
                  <FontAwesomeIcon
                    icon={faExclamationTriangle}
                    className="text-amber-100 text-xl"
                  />
                  <div>
                    <h4 className="text-amber-100 font-semibold">
                      Node Not Running
                    </h4>
                    <p className="text-amber-200 text-sm">
                      Index operations are disabled. Start the node to manage
                      indices.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {fromCache && (<div className="mb-4 p-2 bg-yellow-700 text-yellow-100 rounded text-sm">Data shown is from cache and may be stale. Start the node for live data.</div>)}

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center">
                Indices on {node.name}
                {loading && (
                  <FontAwesomeIcon
                    icon={faCircleNotch}
                    className="fa-spin ml-2 text-blue-400"
                  />
                )}
              </h3>
              <div className="flex items-center space-x-2">
                {/* Cache status indicator */}
                <div className="flex items-center space-x-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${node.status === "running"
                        ?  "bg-green-400"
                        : node.status === "starting" || node.status === "stopping"
                          ? "bg-yellow-400"
                          : "bg-blue-400"
                      }`}
                  ></span>
                  <span className="text-xs text-neutral-400">
                    {node.status === "running"
                      ?  "Live"
                      : node.status === "starting" ? "Starting..." 
                        : node.status === "stopping" ? "Stopping..."
                        : "Cached (Offline)"}
                  </span>
                </div>

                {/* Refresh button */}
                <button
                  onClick={onRefreshNodes}
                  className={buttonStyles.refresh}
                  title="Refresh indices data"
                  disabled={node.status !== "running"}
                >
                  <FontAwesomeIcon
                    icon={faRefresh}
                    className={`mr-1 ${isRefreshing ? "fa-spin" : ""}`}
                  />
                  Refresh
                </button>

                {/* Create Index Button */}
                <button
                  onClick={() => setShowCreateIndexForm(true)}
                  className={buttonStyles.create}
                  disabled={node.status !== "running"}
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-1" />
                  Create Index
                </button>
              </div>
            </div>

            {/* Indices Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full bg-neutral-800 rounded-lg border border-neutral-700">
                <thead>
                  <tr className="text-left text-sm font-medium text-neutral-400 border-b border-neutral-600">
                    <th className="py-3 px-6">Index</th>
                    <th className="py-3 px-6">Docs</th>
                    <th className="py-3 px-6">Size</th>
                    <th className="py-3 px-6">Health</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {indices.map((index) => (
                    <tr key={index.uuid} className="hover:bg-neutral-700">
                      <td className="py-3 px-6 text-white font-medium">
                        {index.index}
                      </td>
                      <td className="py-3 px-6 text-neutral-300">
                        {index["doc.count"]}
                      </td>
                      <td className="py-3 px-6 text-neutral-300">
                        {index["store.size"]}
                      </td>
                      <td className="py-3 px-6">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            index.health === "green"
                              ? "bg-green-500"
                              : index.health === "yellow"
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                        ></span>
                      </td>
                      <td className="py-3 px-6 text-neutral-300">
                        {index.status}
                      </td>
                      <td className="py-3 px-6 text-neutral-400 text-sm">
                        <button
                          onClick={() => handleDeleteClick(index)}
                          className={buttonStyles.delete}
                          title="Delete Index"
                          disabled={node.status !== "running" || isDeletingIndex === index.index}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "configuration":
        if (loading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading configuration...
            </div>
          );
        }
        return (
          <div className="space-y-6">
            <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
              <h3 className="text-lg font-semibold text-white mb-4">
                Node Configuration
              </h3>
              {configContent && configContent.trim() ? (
                <pre className="text-neutral-300 text-sm overflow-x-auto p-4 bg-neutral-800 rounded-lg">
                  {configContent}
                </pre>
              ) : (
                <div className="text-neutral-400 italic p-4 bg-neutral-800 rounded-lg">
                  No configuration found for this node.
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
        <div className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-neutral-600">
          {/* Header */}
          <div className="p-6 flex justify-between items-center border-b border-neutral-600">
            <h2 className="text-2xl font-bold text-white">
              Node Details: {node.name}
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
              title="Close"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-600">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex-1 py-3 px-4 text-center text-neutral-400 hover:text-white ${
                activeTab === "overview"
                  ? "border-b-2 border-blue-500 text-white font-semibold"
                  : ""
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("indices")}
              className={`flex-1 py-3 px-4 text-center text-neutral-400 hover:text-white ${
                activeTab === "indices"
                  ? "border-b-2 border-blue-500 text-white font-semibold"
                  : ""
              }`}
            >
              Indices
            </button>
            <button
              onClick={() => setActiveTab("configuration")}
              className={`flex-1 py-3 px-4 text-center text-neutral-400 hover:text-white ${
                activeTab === "configuration"
                  ? "border-b-2 border-blue-500 text-white font-semibold"
                  : ""
              }`}
            >
              Configuration
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto">{renderContent()}</div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
          <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
              <FontAwesomeIcon
                icon={faExclamationTriangle}
                className="mr-3 text-red-500"
              />
              Confirm Deletion
            </h3>
            <p className="text-neutral-300 mb-6">
              Are you sure you want to delete the index{" "}
              <span className="font-bold text-white">
                {indexToDelete?.index}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={confirmDelete}
                className={
                  buttonStyles.delete +
                  " px-6 py-2 rounded-lg flex items-center justify-center"
                }
                disabled={isDeletingIndex === indexToDelete?.index}
              >
                {isDeletingIndex === indexToDelete?.index ? (
                  <>
                    <FontAwesomeIcon
                      icon={faCircleNotch}
                      spin
                      className="mr-2"
                    />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className={buttonStyles.cancel + " px-6 py-2 rounded-lg"}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default NodeDetailsModal;