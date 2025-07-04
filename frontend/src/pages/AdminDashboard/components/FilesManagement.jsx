import React, { useState, useEffect, useCallback } from "react";
import axiosClient from "../../../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faArrowRightArrowLeft,
  faTrash,
  faCog,
  faServer,
  faDatabase,
  faTimes,
  faInfoCircle,
  faExclamationTriangle,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

export default function FilesManagement({ 
  showNotification, 
  isAnyTaskRunning, 
  showEditModal,
  setTasksList,
  setCurrentRunningTaskId,
  // Props for parsing options
  availableNodes = [],
}) {
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [unparsedFiles, setUnparsedFiles] = useState([]);
  const [parsedFiles, setParsedFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Parsing options modal state
  const [showParsingOptionsModal, setShowParsingOptionsModal] = useState(false);
  const [targetIndex, setTargetIndex] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeIndices, setNodeIndices] = useState([]);
  const [loadingNodeIndices, setLoadingNodeIndices] = useState(false);
  const [parseAllFiles, setParseAllFiles] = useState(true);
  const [selectedSingleFile, setSelectedSingleFile] = useState("");

  // Fetch files data
  const fetchFilesData = useCallback(async () => {
    try {
      setLoading(true);
      const [unparsedRes, parsedRes, pendingRes] = await Promise.all([
        axiosClient.get("/api/admin/files"),
        axiosClient.get("/api/admin/parsed-files"),
        axiosClient.get("/api/admin/pending-files"),
      ]);

      setUnparsedFiles(unparsedRes.data.files || []);
      setParsedFiles(parsedRes.data.files || []);
      setPendingFiles(pendingRes.data.files || []);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to fetch files data");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchFilesData();
  }, [fetchFilesData]);

  // Initialize parsing options when modal opens
  const openParsingOptionsModal = (parseAll = true, singleFile = "") => {
    setParseAllFiles(parseAll);
    setSelectedSingleFile(singleFile);
    
    // Reset state
    setSelectedNode(null);
    setTargetIndex("");
    setNodeIndices([]);
    setLoadingNodeIndices(false);
    
    setShowParsingOptionsModal(true);
  };

  const closeParsingOptionsModal = () => {
    setShowParsingOptionsModal(false);
    setSelectedNode(null);
    setTargetIndex("");
    setNodeIndices([]);
    setSelectedSingleFile("");
    setLoadingNodeIndices(false);
  };

  const getRunningNodes = () => {
    return availableNodes.filter(node => node.isRunning);
  };

  const getNodeDisplayName = (node) => {
    return `${node.name} (${node.host}:${node.port})`;
  };

  const getNodeUrl = (node) => {
    return `http://${node.host}:${node.port}`;
  };

  // Load indices for selected node
  const handleNodeSelection = async (node) => {
    setSelectedNode(node);
    setTargetIndex(""); // Reset selected index
    setNodeIndices([]);
    
    if (!node) return;

    setLoadingNodeIndices(true);
    
    try {
      // Fetch indices for the specific node
      const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/indices`);
      setNodeIndices(response.data || []);
    } catch (error) {
      console.error(`Failed to load indices for node ${node.name}:`, error);
      showNotification("error", `Failed to load indices for node ${node.name}: ${error.response?.data?.error || error.message}`);
      setNodeIndices([]);
    } finally {
      setLoadingNodeIndices(false);
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;

    const formData = new FormData();
    uploadFiles.forEach((file) => formData.append("files", file));

    setUploadPercentage(0);
    setLoading(true);

    try {
      const response = await axiosClient.post("/api/admin/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadPercentage(percentCompleted);
        },
      });

      if (response.data.success) {
        showNotification("success", "Files uploaded successfully!");
        setUploadFiles([]);
        setUploadPercentage(0);
        fetchFilesData();
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Upload failed");
      setUploadPercentage(0);
    } finally {
      setLoading(false);
    }
  };

  const handleParseAll = async () => {
    if (unparsedFiles.length === 0) {
      showNotification("info", "No unparsed files to process.");
      return;
    }

    openParsingOptionsModal(true);
  };

  const handleParseSingleFile = (filename) => {
    openParsingOptionsModal(false, filename);
  };

  const executeParsingTask = async () => {
    // Validate inputs
    if (!selectedNode) {
      showNotification("error", "Please select a target node", faExclamationTriangle);
      return;
    }

    if (!targetIndex) {
      showNotification("error", "Please select a target index", faExclamationTriangle);
      return;
    }

    const runningNodes = getRunningNodes();
    if (runningNodes.length === 0) {
      showNotification("error", "No running nodes available. Please start at least one node.", faExclamationTriangle);
      return;
    }

    try {
      let response;
      const requestBody = {
        targetIndex,
        targetNode: getNodeUrl(selectedNode),
      };

      if (parseAllFiles) {
        response = await axiosClient.post("/api/admin/parse-all-unparsed", requestBody);
      } else {
        response = await axiosClient.post(`/api/admin/parse/${selectedSingleFile}`, requestBody);
      }

      if (response.data.taskId) {
        const taskId = response.data.taskId;
        setCurrentRunningTaskId(taskId);
        localStorage.setItem("currentTaskId", taskId);

        // Add this task to the tasks list
        setTasksList(prev => [...prev, {
          id: taskId,
          type: parseAllFiles ? 'parse-all' : 'parse-single',
          status: 'running',
          progress: 0,
          message: parseAllFiles ? 'Parsing all files...' : `Parsing ${selectedSingleFile}...`,
          completed: false,
          timestamp: new Date().toISOString()
        }]);

        showNotification("success", 
          `Parsing task started! Target: Index "${targetIndex}" on Node "${selectedNode.name}"`, 
          faInfoCircle, true
        );
        
        closeParsingOptionsModal();
        fetchFilesData();
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to start parsing task");
    }
  };

  const handleMoveToUnparsed = async (filename) => {
    try {
      await axiosClient.post("/api/admin/move-to-unparsed", { filename });
      showNotification("success", `Moved '${filename}' to unparsed folder.`);
      fetchFilesData();
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to move file");
    }
  };

  const handleDeletePendingFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete '${filename}'?`)) {
      return;
    }

    try {
      await axiosClient.delete("/api/admin/pending-files", {
        data: { filename },
      });
      showNotification("success", `Deleted '${filename}' successfully.`);
      fetchFilesData();
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete file");
    }
  };

  const handleDeleteUnparsedFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete '${filename}'?`)) {
      return;
    }

    try {
      await axiosClient.delete("/api/admin/files", {
        data: { filename },
      });
      showNotification("success", `Deleted '${filename}' successfully.`);
      fetchFilesData();
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete file");
    }
  };

  const handleDeleteParsedFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete '${filename}'?`)) {
      return;
    }

    try {
      await axiosClient.delete("/api/admin/parsed-files", {
        data: { filename },
      });
      showNotification("success", `Deleted '${filename}' successfully.`);
      fetchFilesData();
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete file");
    }
  };

  return (
    <>
      {/* Upload Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <h2 className="text-3xl font-semibold text-white mb-6">
          Upload New File
        </h2>
        {loading && uploadPercentage > 0 && uploadPercentage <= 100 && (
          <div className="mb-4 w-full">
            <p>Uploading files: {uploadPercentage}%</p>
            <div className="w-full bg-neutral-200 rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${uploadPercentage}%` }}
              ></div>
            </div>
          </div>
        )}
        <div className="flex items-center space-x-4">
          <input
            multiple
            type="file"
            accept=".txt"
            onChange={(e) => {
              setUploadFiles(Array.from(e.target.files));
            }}
            className="block w-full text-sm text-neutral-300
                       file:mr-4 file:py-2.5 file:px-5
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-primary file:text-white
                       hover:file:bg-button-hover-bg transition duration-150 ease-in-out cursor-pointer"
          />
          <button
            onClick={handleUpload}
            className="bg-primary hover:bg-button-hover-bg text-white px-5 py-2.5 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
            disabled={
              uploadFiles.length === 0 ||
              isAnyTaskRunning ||
              showEditModal ||
              loading
            }
          >
            Upload
          </button>
        </div>
      </section>

      {/* Pending Files Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <h2 className="text-3xl font-semibold text-white mb-6">
          Pending Files
        </h2>
        {loading ? (
          <p className="text-neutral-400">Loading pending files...</p>
        ) : pendingFiles.length === 0 ? (
          <p className="text-neutral-400">No files are in pending status.</p>
        ) : (
          <ul className="space-y-4 w-full border border-neutral-700 rounded-lg p-4 bg-neutral-900 max-h-80 overflow-y-auto shadow-inner pr-2">
            {pendingFiles.map((f) => (
              <li
                key={f}
                className="flex justify-between items-center bg-neutral-800 p-4 rounded-lg shadow-sm hover:shadow-md transition duration-200 ease-in-out border border-neutral-700"
              >
                <span className="font-medium text-white">{f}</span>
                <div className="space-x-2">
                  <button
                    onClick={() => handleMoveToUnparsed(f)}
                    disabled={isAnyTaskRunning || showEditModal}
                    className={`bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transform hover:scale-105 active:scale-95 ${
                      isAnyTaskRunning || showEditModal
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={faArrowRightArrowLeft}
                      className="mr-1"
                    />
                    Move to Unparsed
                  </button>
                  <button
                    onClick={() => handleDeletePendingFile(f)}
                    className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                    disabled={loading || isAnyTaskRunning}
                    title={`Delete '${f}'`}
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-1" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Unparsed Files Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <h2 className="text-3xl font-semibold text-white mb-6">
          Unparsed Files
        </h2>
        <div className="flex justify-between items-center mb-4">
          <p className="text-neutral-400">
            Files waiting to be parsed: {unparsedFiles.length}
          </p>
          <button
            onClick={handleParseAll}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
            disabled={unparsedFiles.length === 0 || isAnyTaskRunning || showEditModal}
          >
            <FontAwesomeIcon icon={faCog} className="mr-2" />
            Parse All Files...
          </button>
        </div>
        {loading ? (
          <p className="text-neutral-400">Loading unparsed files...</p>
        ) : unparsedFiles.length === 0 ? (
          <p className="text-neutral-400">No unparsed files found.</p>
        ) : (
          <ul className="space-y-4 w-full border border-neutral-700 rounded-lg p-4 bg-neutral-900 max-h-80 overflow-y-auto shadow-inner pr-2">
            {unparsedFiles.map((f) => (
              <li
                key={f}
                className="flex justify-between items-center bg-neutral-800 p-4 rounded-lg shadow-sm hover:shadow-md transition duration-200 ease-in-out border border-neutral-700"
              >
                <span className="font-medium text-white">{f}</span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleParseSingleFile(f)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                    disabled={isAnyTaskRunning || showEditModal}
                    title={`Parse '${f}' individually`}
                  >
                    <FontAwesomeIcon icon={faPlay} className="mr-1" /> Parse
                  </button>
                  <button
                    onClick={() => handleDeleteUnparsedFile(f)}
                    className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                    disabled={loading || isAnyTaskRunning}
                    title={`Delete '${f}'`}
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-1" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Parsed Files Section */}
      <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
        <h2 className="text-3xl font-semibold text-white mb-6">
          Parsed Files
        </h2>
        <p className="text-neutral-400 mb-4">
          Successfully parsed files: {parsedFiles.length}
        </p>
        {loading ? (
          <p className="text-neutral-400">Loading parsed files...</p>
        ) : parsedFiles.length === 0 ? (
          <p className="text-neutral-400">No parsed files found.</p>
        ) : (
          <ul className="space-y-4 w-full border border-neutral-700 rounded-lg p-4 bg-neutral-900 max-h-80 overflow-y-auto shadow-inner pr-2">
            {parsedFiles.map((f) => (
              <li
                key={f}
                className="flex justify-between items-center bg-neutral-800 p-4 rounded-lg shadow-sm hover:shadow-md transition duration-200 ease-in-out border border-neutral-700"
              >
                <span className="font-medium text-white">{f}</span>
                <button
                  onClick={() => handleDeleteParsedFile(f)}
                  className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                  disabled={loading || isAnyTaskRunning}
                  title={`Delete '${f}'`}
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" /> Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Parsing Options Modal */}
      {showParsingOptionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center">
                <FontAwesomeIcon icon={faCog} className="mr-3 text-blue-500" />
                {parseAllFiles ? "Parse All Files" : `Parse ${selectedSingleFile}`}
              </h3>
              <button
                onClick={closeParsingOptionsModal}
                className="text-neutral-400 hover:text-red-400 text-3xl transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Info Section */}
              <div className="bg-blue-600 bg-opacity-20 border border-blue-600 rounded-lg p-4">
                <p className="text-blue-200 text-sm flex items-center">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                  Select a target node first, then choose an index on that node. Files will be processed and indexed accordingly.
                </p>
              </div>

              {/* Step 1: Target Node Selection */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  <FontAwesomeIcon icon={faServer} className="mr-2" />
                  Step 1: Select Target Node
                </label>
                <select
                  value={selectedNode?.name || ""}
                  onChange={(e) => {
                    const nodeName = e.target.value;
                    const node = getRunningNodes().find(n => n.name === nodeName);
                    handleNodeSelection(node);
                  }}
                  className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a running node</option>
                  {getRunningNodes().map((node) => (
                    <option key={node.name} value={node.name}>
                      {getNodeDisplayName(node)}
                    </option>
                  ))}
                </select>
                {selectedNode && (
                  <p className="text-sm text-green-400 mt-1">
                    Selected node: <strong>{selectedNode.name}</strong>
                  </p>
                )}
              </div>

              {/* Step 2: Target Index Selection (only show when node is selected) */}
              {selectedNode && (
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    <FontAwesomeIcon icon={faDatabase} className="mr-2" />
                    Step 2: Select Target Index on {selectedNode.name}
                  </label>
                  
                  {loadingNodeIndices ? (
                    <div className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white flex items-center">
                      <FontAwesomeIcon icon={faSpinner} className="fa-spin mr-2" />
                      Loading indices for {selectedNode.name}...
                    </div>
                  ) : (
                    <select
                      value={targetIndex}
                      onChange={(e) => setTargetIndex(e.target.value)}
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select target index</option>
                      {nodeIndices.map((index) => (
                        <option key={index.index} value={index.index}>
                          {index.index} ({(parseInt(index['docs.count']) || 0).toLocaleString()} docs, {index['store.size'] || '0b'})
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {nodeIndices.length === 0 && !loadingNodeIndices && (
                    <p className="text-sm text-yellow-400 mt-1">
                      No indices found on this node. You may need to create an index first.
                    </p>
                  )}
                  
                  {targetIndex && (
                    <p className="text-sm text-green-400 mt-1">
                      Data will be indexed to: <strong>{targetIndex}</strong> on <strong>{selectedNode.name}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Status Warnings */}
              {getRunningNodes().length === 0 && (
                <div className="bg-red-600 bg-opacity-20 border border-red-600 rounded-lg p-4">
                  <p className="text-red-200 text-sm flex items-center">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                    No running nodes available. Please start at least one node in the Cluster Management tab.
                  </p>
                </div>
              )}

              {/* Task Summary */}
              {selectedNode && (
                <div className="bg-neutral-700 p-4 rounded-lg">
                  <h4 className="text-white font-semibold mb-2">Task Summary</h4>
                  {parseAllFiles ? (
                    <ul className="text-neutral-300 text-sm space-y-1">
                      <li>• Files to process: <strong>{unparsedFiles.length}</strong></li>
                      <li>• Target node: <strong>{selectedNode.name}</strong></li>
                      <li>• Target index: <strong>{targetIndex || "Not selected"}</strong></li>
                      <li>• Available indices on node: <strong>{nodeIndices.length}</strong></li>
                    </ul>
                  ) : (
                    <ul className="text-neutral-300 text-sm space-y-1">
                      <li>• File to process: <strong>{selectedSingleFile}</strong></li>
                      <li>• Target node: <strong>{selectedNode.name}</strong></li>
                      <li>• Target index: <strong>{targetIndex || "Not selected"}</strong></li>
                      <li>• Available indices on node: <strong>{nodeIndices.length}</strong></li>
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end space-x-3 mt-8">
              <button
                onClick={closeParsingOptionsModal}
                className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out"
              >
                Cancel
              </button>
              <button
                onClick={executeParsingTask}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  !selectedNode || 
                  !targetIndex || 
                  getRunningNodes().length === 0 ||
                  isAnyTaskRunning ||
                  loadingNodeIndices
                }
                title={
                  !selectedNode ? "Please select a node first" :
                  !targetIndex ? "Please select an index" :
                  getRunningNodes().length === 0 ? "No running nodes available" :
                  loadingNodeIndices ? "Loading indices..." :
                  "Start parsing task"
                }
              >
                <FontAwesomeIcon icon={faPlay} className="mr-2" />
                Start Parsing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
