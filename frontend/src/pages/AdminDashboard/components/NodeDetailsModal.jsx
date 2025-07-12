import React, { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faServer,
  faInfoCircle,
  faFileAlt,
  faDatabase,
  // faCircleInfo, // Removed unused import
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

export default function NodeDetailsModal({
  show,
  onClose,
  node,
  enhancedNodesData = {},
  onRefreshNodes,
  disabled = false
}) {
  // All hooks must be called at the top, before any early returns
  const [nodeIndices, setNodeIndices] = useState([]);
  const [isLoadingIndices, setIsLoadingIndices] = useState(false);
  const [indexName, setIndexName] = useState("");
  const [shards, setShards] = useState(1);
  const [replicas, setReplicas] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [configContent, setConfigContent] = useState("");
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showCreateIndexForm, setShowCreateIndexForm] = useState(false);
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexShards, setNewIndexShards] = useState("1");
  const [newIndexReplicas, setNewIndexReplicas] = useState("0");
  const [indicesError, setIndicesError] = useState(null);
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);
  const [isDeletingIndex, setIsDeletingIndex] = useState(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [diskStats, setDiskStats] = useState(null);
  const [diskStatsLoading, setDiskStatsLoading] = useState(false);
  const [diskStatsError, setDiskStatsError] = useState(null);
  const refreshInProgress = useRef(false);
  const [nodeDetails, setNodeDetails] = useState(null);

  // Add a ref to track if the modal is open for polling cancellation
  const isModalOpenRef = useRef(show);
  useEffect(() => { isModalOpenRef.current = show; }, [show]);



  // Helper: Fetch latest indices from backend
  const fetchLiveNodeIndices = useCallback(async (showLoading = true) => {
    if (!node?.name) return;
    if (showLoading) setIsLoadingIndices(true);
    try {
      const res = await axiosClient.get(`/api/admin/node-management/${node?.name}/indices`);
      setNodeIndices(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setNodeIndices([]);
    } finally {
      if (showLoading) setIsLoadingIndices(false);
    }
  }, [node?.name]);

  // Helper: Poll for index presence/absence after mutation, with cancellation
  const pollForIndexChange = useCallback(async (indexName, shouldExist = true, maxAttempts = 10, interval = 1000) => {
    setPolling(true);
    let attempts = 0;
    let cancelled = false;
    const cancelCheck = () => !isModalOpenRef.current || !node?.name;
    while (attempts < maxAttempts && !cancelCheck()) {
      try {
        const res = await axiosClient.get(`/api/admin/node-management/${node?.name}/indices`);
        const indices = Array.isArray(res.data) ? res.data : [];
        const found = indices.some(idx => idx.index === indexName);
        if ((shouldExist && found) || (!shouldExist && !found)) {
          setNodeIndices(indices);
          break;
        }
      } catch (e) {
        // ignore
      }
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
    setPolling(false);
  }, [node?.name]);

  // Fetch cached indices from prop instead of API
  const fetchCachedNodeIndices = useCallback(() => {
    if (!node?.name) return;
    try {
      const nodeData = enhancedNodesData[node?.name];
      if (nodeData && nodeData.indices) {
        const indicesArray = Array.isArray(nodeData.indices)
          ? nodeData.indices
          : Object.entries(nodeData.indices).map(([indexName, indexData]) => ({
            index: indexName,
            "doc.count": indexData["doc.count"] || 0,
            "store.size": formatBytes(indexData["store.size"]),
            health: "green",
            status: "open",
            uuid: indexName,
            creation: {
              date: {
                string: new Date().toISOString(),
              },
            },
          }));
        setNodeIndices(indicesArray);
        setError(nodeData.error || null);
      } else {
        setNodeIndices([]);
        setError(nodeData?.error || "No data available");
      }
    } catch (error) {
      setError("Failed to load indices data");
      setNodeIndices([]);
    }
  }, [enhancedNodesData, node?.name]);

  // Primary fetch function - uses cached data by default
  const fetchNodeIndices = useCallback((showLoading = true, forceLive = false) => {
    if (forceLive) {
      return fetchLiveNodeIndices(showLoading);
    } else {
      if (showLoading) setIsLoadingIndices(true);
      try {
        fetchCachedNodeIndices();
      } catch (error) {
        setError("Failed to fetch indices data");
      } finally {
        if (showLoading) setIsLoadingIndices(false);
      }
    }
  }, [fetchLiveNodeIndices, fetchCachedNodeIndices]);

  const handleManualRefresh = useCallback(async () => {
    if (refreshInProgress.current) return;
    setIsRefreshing(true);
    refreshInProgress.current = true;
    try {
      if (node?.status === "running") {
        if (onRefreshNodes) {
          await onRefreshNodes(true);
        }
        await fetchLiveNodeIndices(false);
      } else {
        fetchCachedNodeIndices();
      }
    } catch (error) {
      setError(error.response?.data?.error || "Refresh failed");
    } finally {
      setIsRefreshing(false);
      refreshInProgress.current = false;
    }
  }, [node?.status, fetchLiveNodeIndices, fetchCachedNodeIndices, onRefreshNodes]);

  const fetchDiskStats = useCallback(async () => {
    if (node && node.status === "running") {
      setDiskStatsLoading(true);
      setDiskStatsError(null);
      try {
        const response = await axiosClient.get(
          `/api/admin/node-management/nodes/${node?.name}/stats`
        );
        setDiskStats(response.data);
      } catch (error) {
        setDiskStatsError(
          error.response?.data?.error || "Failed to load disk statistics"
        );
        setDiskStats(null);
      } finally {
        setDiskStatsLoading(false);
      }
    } else {
      setDiskStats(null);
      setDiskStatsError(null);
    }
  }, [node]);

  // Update indices when enhancedNodesData changes (for cached data updates)
  useEffect(() => {
    if (!show || activeTab !== "indices" || !node || refreshInProgress.current) return;
    fetchCachedNodeIndices();
  }, [enhancedNodesData, activeTab, node, fetchCachedNodeIndices, show]);

  // Primary tab content loading effect
  useEffect(() => {
    if (!show || !node) return;
    if (activeTab === "configuration") {
      const fetchConfig = async () => {
        setIsLoadingConfig(true);
        try {
          const response = await axiosClient.get(
            `/api/admin/node-management/${node?.name}/config`
          );
          setConfigContent(response.data);
        } catch (error) {
          setConfigContent("Failed to load configuration.");
        } finally {
          setIsLoadingConfig(false);
        }
      };
      fetchConfig();
    } else if (activeTab === "indices" && !refreshInProgress.current) {
      fetchNodeIndices();
    } else if (activeTab === "overview") {
      fetchDiskStats();
    }
  }, [activeTab, node, fetchNodeIndices, fetchDiskStats, show]);

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
    setActiveTab("overview");
    setShowCreateIndexForm(false);
    setNewIndexName("");
    setNewIndexShards("1");
    setNewIndexReplicas("0");
    setShowDeleteModal(false);
    setIndexToDelete(null);
    setIndicesError(null);
    setIsDeletingIndex(null);
    setDiskStats(null);
    setDiskStatsError(null);
  }, [show]);

  // Listen for cache refresh events - but don't trigger fetch if we just updated
  useEffect(() => {
    if (!show) return;
    const handleCacheRefresh = () => {
      if (activeTab === "indices" && node && !refreshInProgress.current) {
        fetchCachedNodeIndices();
      }
    };
    window.addEventListener("indicesCacheRefreshed", handleCacheRefresh);
    return () => {
      window.removeEventListener("indicesCacheRefreshed", handleCacheRefresh);
    };
  }, [activeTab, node, fetchCachedNodeIndices, show]);

  // Only fetch node details when modal opens or node changes, not on input change
  useEffect(() => {
    if (show && node?.name) {
      axiosClient.get(`/api/admin/node-management/nodes/${node.name}`)
        .then(res => setNodeDetails(res.data))
        .catch(err => setError(err.response?.data?.error || 'Failed to fetch node details'));
    }
    // Do not depend on form state/input value
  }, [show, node?.name]);

  if (!node) return null;

  // Add validation for form inputs
  const isValidIndexName =
    indexName.trim().length > 0 && !/[A-Z\s]/.test(indexName);
  const isValidShards = parseInt(shards) > 0;
  const isValidReplicas = parseInt(replicas) >= 0;
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
      await pollForIndexChange(newIndexName.trim(), true);

      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
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
      await pollForIndexChange(indexToDelete.index, false);

      // Single centralized refresh to update all components
      if (onRefreshNodes) {
        await onRefreshNodes(true);
      }
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
              ) : diskStatsLoading ? (
                <div className="flex items-center text-neutral-400">
                  <FontAwesomeIcon
                    icon={faCircleNotch}
                    className="fa-spin mr-2"
                  />
                  Loading disk statistics...
                </div>
              ) : diskStatsError ? (
                <div className="p-4 bg-amber-600 rounded-lg border border-amber-500">
                  <p className="text-amber-100 text-sm">{diskStatsError}</p>
                  <button
                    onClick={fetchDiskStats}
                    className={buttonStyles.delete + " mt-2 px-4 py-2"}
                  >
                    Retry
                  </button>
                </div>
              ) : diskStats &&
                diskStats.diskInfo &&
                diskStats.diskInfo.length > 0 ? (
                <div className="space-y-3">
                  {diskStats.diskInfo.map((disk, index) => (
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
        if (isLoadingIndices) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading indices...
            </div>
          );
        }
        return (
          <div>
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

            {error && (
              <div className="mb-4 p-4 bg-amber-600 rounded-lg border border-amber-500">
                <div className="flex items-start space-x-3">
                  <FontAwesomeIcon
                    icon={faExclamationTriangle}
                    className="text-amber-100 text-lg mt-0.5"
                  />
                  <div className="flex-1">
                    <h4 className="text-amber-100 font-semibold mb-1">
                      Error Loading Indices
                    </h4>
                    <p className="text-amber-200 text-sm mb-2">
                      {error}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleManualRefresh}
                        className={
                          buttonStyles.delete +
                          " flex items-center px-4 py-2 rounded text-sm"
                        }
                      >
                        <FontAwesomeIcon
                          icon={faCircleNotch}
                          className={`mr-1 ${isRefreshing ? "fa-spin" : ""
                            }`}
                        />
                        {isRefreshing ? "Retrying..." : "Retry"}
                      </button>
                      {node.status === 'running' && (
                        <button
                          onClick={() => fetchLiveNodeIndices(true)}
                          className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Force Live Fetch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center">
                Indices on {node.name}
                {(isLoadingIndices || isRefreshing) && (
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
                        ? usingCachedData
                          ? "bg-yellow-400"
                          : "bg-green-400"
                        : node.status === "starting" || node.status === "stopping"
                          ? "bg-yellow-400"
                          : "bg-blue-400"
                      }`}
                  ></span>
                  <span className="text-xs text-neutral-400">
                    {node.status === "running"
                      ? usingCachedData
                        ? "Smart Cache"
                        : "Live"
                      : node.status === "starting" ? "Starting..." 
                        : node.status === "stopping" ? "Stopping..."
                        : "Cached (Offline)"}
                  </span>
                </div>

                {/* Refresh button */}
                <button
                  onClick={handleManualRefresh}
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
                  {nodeIndices.map((index) => (
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
                          disabled={isDeletingIndex === index.index}
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
        if (isLoadingConfig) {
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
              {configError ? (
                <div className="p-4 bg-amber-600 rounded-lg border border-amber-500">
                  <p className="text-amber-100 text-sm">{configError}</p>
                  <button
                    onClick={() => setShowConfig(false)}
                    className={buttonStyles.delete + " mt-2 px-4 py-2"}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <pre className="text-neutral-300 text-sm overflow-x-auto p-4 bg-neutral-800 rounded-lg">
                  {configContent}
                </pre>
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
}