import React, { useState, useEffect, useCallback } from "react";
import axiosClient from "../../../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlay,
  faArrowRightArrowLeft,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

export default function FilesManagement({ 
  showNotification, 
  isAnyTaskRunning, 
  showEditModal,
  setTasksList,
  setCurrentRunningTaskId 
}) {
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [unparsedFiles, setUnparsedFiles] = useState([]);
  const [parsedFiles, setParsedFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [loading, setLoading] = useState(false);

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

    try {
      const response = await axiosClient.post("/api/admin/parse-all-unparsed");
      if (response.data.taskId) {
        const taskId = response.data.taskId;
        setCurrentRunningTaskId(taskId);
        localStorage.setItem("currentTaskId", taskId);

        // Add this task to the tasks list
        setTasksList(prev => [...prev, {
          id: taskId,
          type: 'parse-all',
          status: 'running',
          progress: 0,
          message: 'Parsing all files...',
          completed: false,
          timestamp: new Date().toISOString()
        }]);

        showNotification("info", "Parse all files task started. You can monitor progress below.", null, true);
        fetchFilesData();
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to start parse all task");
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
            <FontAwesomeIcon icon={faPlay} className="mr-2" />
            Parse All Files
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
                <button
                  onClick={() => handleDeleteUnparsedFile(f)}
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
    </>
  );
}
