import React, { useState } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import axiosClient from "../../../api/axiosClient";

export default function ClusterManagement({
  // Local node state
  localNodes,
  clusterLoading,
  nodeActionLoading,
  fetchLocalNodes,
  handleStartLocalNode,
  handleStopLocalNode,
  handleDeleteLocalNode,
  // Modal controls
  setShowClusterWizard,
  setShowLocalNodeManager,
  // Other
  isAnyTaskRunning,
  formatBytes,
  onEditNode,
  onOpenNodeDetails,
  showNotification,
}) {
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
              disabled={clusterLoading}
            >
              <FontAwesomeIcon
                icon={faCircleNotch}
                className={`mr-2 ${clusterLoading ? "fa-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={async () => {
                try {
                  showNotification(
                    "info",
                    "Verifying node metadata...",
                    faCircleNotch
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
                }
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75"
              disabled={clusterLoading}
              title="Verify and clean up node metadata"
            >
              <FontAwesomeIcon icon={faCog} className="mr-2" />
              Verify Metadata
            </button>
          </div>
        </div>

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

                      return (
                        <div
                          key={node.name}
                          className="bg-neutral-800 rounded-2xl shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out"
                        >
                          <div className="p-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className="bg-primary p-3 rounded-full">
                                  <FontAwesomeIcon
                                    icon={faServer}
                                    className="text-white text-xl"
                                  />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-white">
                                    {node.name}
                                  </h3>
                                  <div className="text-sm text-neutral-400">
                                    {node.description ||
                                      `Node running at ${node.host}:${node.port}`}
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
                                      node.isRunning
                                        ? "text-green-500"
                                        : "text-red-500"
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
                                    onClick={() =>
                                      handleStopLocalNode(node.name)
                                    }
                                    disabled={isLoading}
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
                                    disabled={isLoading}
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
                                  onClick={() =>
                                    handleDeleteLocalNode(node.name)
                                  }
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
            )}
          </div>
        </div>
      </section>
    </>
  );
}
