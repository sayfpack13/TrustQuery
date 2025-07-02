// === frontend/src/pages/AdminDashboard.jsx ===
import React, { useState, useEffect, useCallback, useRef } from "react";
import axiosClient from "../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faCheckCircle,
  faExclamationTriangle,
  faEye,
  faEyeSlash,
  faEdit,
  faSave,
  faTimes,
  faInfoCircle,
  faTrash,
  faArrowRightArrowLeft,
  faPlay, // Added for Parse All
  faListCheck, // Added for tasks list
} from "@fortawesome/free-solid-svg-icons";
import useSound from "../components/useSound";

export default function AdminDashboard({ onLogout }) {
  // === State Variables ===
  const [uploadPercentage, setUploadPercentage] = useState(0);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [unparsedFiles, setUnparsedFiles] = useState([]);
  const [parsedFiles, setParsedFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Password visibility state for the main table (per-row, overridden by global toggle)
  const [hiddenPasswords, setHiddenPasswords] = useState({});
  // Global password visibility state for the main table
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  // Password visibility state for the edit modal
  const [editModalPasswordHidden, setEditModalPasswordHidden] = useState(false);

  // Task progress tracking
  const [currentRunningTaskId, setCurrentRunningTaskId] = useState(
    () => localStorage.getItem("currentTaskId") || null
  );
  // `taskStatus` is no longer a separate state, but a derived property from `tasksList` if needed.
  const [tasksList, setTasksList] = useState([]); // List of all tracked tasks (for TaskDetails component)
  const [lastNotifiedTaskId, setLastNotifiedTaskId] = useState(null); // Track last notified task to prevent notification spam

  // For disabling buttons that trigger tasks - now based on any task running in the list
  const isAnyTaskRunning = tasksList.some(
    (task) => !task.completed && task.status !== "error"
  );

  // State for the currently edited account and modal visibility
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentEditingAccount, setCurrentEditingAccount] = useState(null); // Stores the full account object being edited
  const [editFormData, setEditFormData] = useState({
    url: "",
    username: "",
    password: "",
  });
  const [editLoading, setEditLoading] = useState(false); // New loading state for individual account edits

  // State for page input in pagination
  const [pageInput, setPageInput] = useState("1");

  // === Tab Navigation State ===
  const [activeTab, setActiveTab] = useState("files"); // 'files', 'elasticsearch', 'accounts', 'configuration'

  // === Configuration Management State ===
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [availableSearchIndices, setAvailableSearchIndices] = useState([]);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState([]);
  
  // === Temporary System Settings State (for manual save) ===
  const [tempSystemSettings, setTempSystemSettings] = useState({
    minVisibleChars: 2,
    maskingRatio: 0.2,
    usernameMaskingRatio: 0.4,
    batchSize: 1000,
    showRawLineByDefault: false
  });
  const [hasUnsavedSystemChanges, setHasUnsavedSystemChanges] = useState(false);

  // === Elasticsearch Management State ===
  const [esIndices, setEsIndices] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState("accounts");
  const [esHealth, setEsHealth] = useState(null);
  const [showESModal, setShowESModal] = useState(false);
  const [esModalType, setEsModalType] = useState(""); // 'create', 'delete', 'reindex', 'details'
  const [esModalData, setEsModalData] = useState({});
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexShards, setNewIndexShards] = useState("1");
  const [newIndexReplicas, setNewIndexReplicas] = useState("0");
  const [reindexSource, setReindexSource] = useState("");
  const [reindexDest, setReindexDest] = useState("");
  const [indexDetails, setIndexDetails] = useState(null);
  const [esLoading, setEsLoading] = useState(false);

  // Notification State
  const [notification, setNotification] = useState({
    isVisible: false,
    type: "", // 'success', 'error', 'info'
    message: "",
    icon: null,
    isLoading: false,
  });

  // Sound hooks
  const { playSound: playSuccessSound } = useSound("/sounds/success.mp3");
  const { playSound: playErrorSound } = useSound("/sounds/error.mp3");

  // Ref for polling interval ID
  const pollingIntervalRef = useRef(null);
  // Ref to track if success sound has been played for the current batch of task completions
  const hasPlayedCompletionSoundRef = useRef(false);

  // Function to show a notification message
  const showNotification = useCallback(
    (type, message, icon, isLoading = false) => {
      setNotification({
        isVisible: true,
        type,
        message,
        icon,
        isLoading,
      });

      // Auto-hide success/info notifications after delay, but not for loading ones
      if (type === "success" || !isLoading) {
        setTimeout(() => {
          setNotification((prev) => ({ ...prev, isVisible: false }));
        }, 8000); // Hide after 8 seconds
      }
    },
    []
  );

  // Effect to play sound when error state changes (for general errors, not task errors)
  useEffect(() => {
    if (error) {
      playErrorSound();
      showNotification("error", error, faExclamationTriangle);
    }
  }, [error, playErrorSound, showNotification]);

  // Function to hide notification
  const hideNotification = () => {
    setNotification({
      isVisible: false,
      type: "",
      message: "",
      icon: null,
      isLoading: false,
    });
    setError(""); // Also clear the internal error state when notification is dismissed
  };

  // fetchData now handles fetching all lists and accounts
  const fetchData = useCallback(async () => {
    setError("");
    try {
      setLoading(true);
      const [unparsedRes, parsedRes, pendingRes, accountsRes] = await Promise.all([
        axiosClient.get("/api/admin/files"),
        axiosClient.get("/api/admin/parsed-files"),
        axiosClient.get("/api/admin/pending-files"),
        axiosClient.get("/api/admin/accounts", {
          params: { page, size: pageSize },
        }),
      ]);

      setUnparsedFiles(unparsedRes.data.files || []);
      setParsedFiles(parsedRes.data.files || []);
      setPendingFiles(pendingRes.data.files || []);

      const fetchedAccounts = accountsRes.data.results || [];
      setAccounts(fetchedAccounts);
      setTotal(accountsRes.data.total || 0);

      // Initialize hiddenPasswords state to hide all passwords by default
      const initialHiddenState = {};
      fetchedAccounts.forEach((account) => {
        initialHiddenState[account.id] = true; // Initially hide all passwords
      });
      setHiddenPasswords(initialHiddenState);

      setSelected([]);
      setShowEditModal(false);
      setCurrentEditingAccount(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch admin data");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]); // Dependencies for fetchData

  // New function to fetch ALL tasks
  const fetchAllTasks = useCallback(async () => {
    try {
      const response = await axiosClient.get("/api/admin/tasks");
      const fetchedTasks = response.data || [];

      // Update tasksList with the fetched tasks
      setTasksList(fetchedTasks);

      // Determine if there's any active task (any task that is not completed and not in error state)
      const anyActiveTask = fetchedTasks.find(
        (t) => !t.completed && t.status !== "error"
      );

      if (anyActiveTask) {
        localStorage.setItem("currentTaskId", anyActiveTask.taskId); // Keep localStorage updated
        setCurrentRunningTaskId(anyActiveTask.taskId); // Set the current running task ID for notifications
        
        // Only show notification if this is a new task (different from last notified)
        if (lastNotifiedTaskId !== anyActiveTask.taskId) {
          showNotification(
            "info",
            `${anyActiveTask.type}${anyActiveTask.filename ? ` (${anyActiveTask.filename})` : ''} - ${
              anyActiveTask.message || "Processing..."
            }`,
            faCircleNotch,
            true
          );
          setLastNotifiedTaskId(anyActiveTask.taskId);
        }
        hasPlayedCompletionSoundRef.current = false; // Reset sound flag if tasks are active
      } else {
        // If no active tasks, clear currentRunningTaskId if it was set
        if (currentRunningTaskId) {
          localStorage.removeItem("currentTaskId");
          setCurrentRunningTaskId(null);
          setLastNotifiedTaskId(null); // Clear last notified task when no active tasks
        }

        // Check if any task just completed/errored and play sound/refresh data
        const wasAnyTaskRunningBefore = pollingIntervalRef.current !== null; // Simple check if polling was active
        const isAnyTaskRunningNow = fetchedTasks.some(
          (task) => !task.completed && task.status !== "error"
        );

        if (
          wasAnyTaskRunningBefore && // Polling was active before
          !isAnyTaskRunningNow && // No tasks are running now
          !hasPlayedCompletionSoundRef.current // Sound hasn't played for this completion batch
        ) {
          playSuccessSound();
          showNotification("success", "All tasks completed!", faCheckCircle);
          fetchData(); // Refresh accounts and file data
          fetchESData(); // Refresh Elasticsearch data (indices, health, etc.)
          fetchConfig(); // Refresh configuration in case it was updated
          hasPlayedCompletionSoundRef.current = true; // Prevent multiple sound plays
        }
      }
    } catch (err) {
      console.error("Error fetching all tasks:", err);
      // If error, ensure current running task is cleared to stop continuous polling for a dead task
      if (currentRunningTaskId) {
        localStorage.removeItem("currentTaskId");
        setCurrentRunningTaskId(null);
        setLastNotifiedTaskId(null); // Clear last notified task on error
      }
      setTasksList([]); // Clear tasks on error
      showNotification(
        "error",
        "Failed to fetch tasks.",
        faExclamationTriangle
      );
      playErrorSound();
    }
  }, [currentRunningTaskId, showNotification, playSuccessSound, playErrorSound, fetchData]);

  // === Configuration Management Functions ===
  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const response = await axiosClient.get("/api/admin/config");
      setConfig(response.data);
      setSelectedSearchIndices(response.data.searchIndices || []);
      
      // Initialize temp system settings with current config values
      setTempSystemSettings({
        minVisibleChars: response.data.minVisibleChars || 2,
        maskingRatio: response.data.maskingRatio || 0.2,
        usernameMaskingRatio: response.data.usernameMaskingRatio || 0.4,
        batchSize: response.data.batchSize || 1000,
        showRawLineByDefault: response.data.adminSettings?.showRawLineByDefault || false
      });
      setHasUnsavedSystemChanges(false);
    } catch (err) {
      console.error("Failed to fetch configuration:", err);
      showNotification("error", "Failed to fetch configuration", faExclamationTriangle);
    } finally {
      setConfigLoading(false);
    }
  }, [showNotification]);

  const updateSearchIndices = async () => {
    try {
      await axiosClient.post("/api/admin/config/search-indices", {
        indices: selectedSearchIndices
      });
      
      await fetchConfig(); // Refresh config
      showNotification("success", "Search indices updated successfully", faCheckCircle);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to update search indices", faExclamationTriangle);
    }
  };

  const updateConfiguration = async (updates) => {
    try {
      await axiosClient.post("/api/admin/config", updates);
      
      await fetchConfig(); // Refresh config
      showNotification("success", "Configuration updated successfully", faCheckCircle);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to update configuration", faExclamationTriangle);
    }
  };

  // === System Settings Functions (Manual Save) ===
  const handleSystemSettingChange = (field, value) => {
    setTempSystemSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedSystemChanges(true);
  };

  const saveSystemSettings = async () => {
    try {
      // Separate adminSettings from other settings
      const { showRawLineByDefault, ...otherSettings } = tempSystemSettings;
      
      const payload = {
        ...otherSettings,
        adminSettings: {
          showRawLineByDefault
        }
      };
      
      await axiosClient.post("/api/admin/config", payload);
      
      await fetchConfig(); // Refresh config to update main config state
      setHasUnsavedSystemChanges(false); // Mark as saved
      showNotification("success", "System settings saved successfully", faCheckCircle);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to save system settings", faExclamationTriangle);
    }
  };

  const resetSystemSettings = () => {
    if (config) {
      setTempSystemSettings({
        minVisibleChars: config.minVisibleChars || 2,
        maskingRatio: config.maskingRatio || 0.2,
        usernameMaskingRatio: config.usernameMaskingRatio || 0.4,
        batchSize: config.batchSize || 1000,
        showRawLineByDefault: config.adminSettings?.showRawLineByDefault || false
      });
      setHasUnsavedSystemChanges(false);
    }
  };

  // === Elasticsearch Management Functions ===
  const fetchESData = useCallback(async () => {
    try {
      setEsLoading(true);
      const [indicesRes, healthRes] = await Promise.all([
        axiosClient.get("/api/admin/es/indices"),
        axiosClient.get("/api/admin/es/health")
      ]);

      setEsIndices(indicesRes.data.indices || []);
      setSelectedIndex(indicesRes.data.selectedIndex || "accounts");
      setEsHealth(healthRes.data);
      
      // Update available search indices for configuration
      setAvailableSearchIndices(indicesRes.data.indices || []);
    } catch (err) {
      console.error("Failed to fetch ES data:", err);
      showNotification("error", "Failed to fetch Elasticsearch data", faExclamationTriangle);
    } finally {
      setEsLoading(false);
    }
  }, [showNotification]);

  const handleCreateIndex = async () => {
    if (!newIndexName.trim()) {
      showNotification("error", "Index name is required", faExclamationTriangle);
      return;
    }

    const shards = parseInt(newIndexShards) || 1;
    const replicas = parseInt(newIndexReplicas) || 0;

    if (shards < 1 || shards > 1000) {
      showNotification("error", "Number of shards must be between 1 and 1000", faExclamationTriangle);
      return;
    }

    if (replicas < 0 || replicas > 100) {
      showNotification("error", "Number of replicas must be between 0 and 100", faExclamationTriangle);
      return;
    }

    try {
      const response = await axiosClient.post("/api/admin/es/indices", {
        indexName: newIndexName.trim(),
        shards: shards,
        replicas: replicas
      });

      if (response.data.taskId) {
        fetchAllTasks(); // Refresh tasks to show the new task
        closeESModal(); // Close modal and clear form
        showNotification("info", `Index creation started for "${newIndexName.trim()}" with ${shards} shard(s) and ${replicas} replica(s)`, faInfoCircle, true);
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to create index", faExclamationTriangle);
    }
  };

  const handleDeleteIndex = async (indexName) => {
    if (indexName === selectedIndex) {
      showNotification("error", "Cannot delete the currently selected index", faExclamationTriangle);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete index "${indexName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await axiosClient.delete(`/api/admin/es/indices/${indexName}`);

      if (response.data.taskId) {
        fetchAllTasks(); // Refresh tasks
        closeESModal(); // Close any open ES modal
        showNotification("info", `Index deletion started for "${indexName}"`, faInfoCircle, true);
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete index", faExclamationTriangle);
    }
  };

  const handleSelectIndex = async (indexName) => {
    try {
      await axiosClient.post("/api/admin/es/select-index", {
        indexName: indexName
      });

      setSelectedIndex(indexName);
      fetchESData(); // Refresh to update selected index
      fetchData(); // Refresh data from new index
      showNotification("success", `Selected index changed to '${indexName}'`, faCheckCircle);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to select index", faExclamationTriangle);
    }
  };

  const handleReindex = async () => {
    if (!reindexSource || !reindexDest) {
      showNotification("error", "Source and destination indices are required", faExclamationTriangle);
      return;
    }

    try {
      const response = await axiosClient.post("/api/admin/es/reindex", {
        sourceIndex: reindexSource,
        destIndex: reindexDest
      });

      if (response.data.taskId) {
        fetchAllTasks(); // Refresh tasks
        closeESModal(); // Close modal and clear form
        showNotification("info", `Reindexing started from "${reindexSource}" to "${reindexDest}"`, faInfoCircle, true);
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to start reindexing", faExclamationTriangle);
    }
  };

  const fetchIndexDetails = async (indexName) => {
    try {
      setEsLoading(true);
      const response = await axiosClient.get(`/api/admin/es/indices/${indexName}/details`);
      setIndexDetails(response.data);
    } catch (err) {
      showNotification("error", "Failed to fetch index details", faExclamationTriangle);
    } finally {
      setEsLoading(false);
    }
  };

  const openESModal = (type, data = {}) => {
    setEsModalType(type);
    setEsModalData(data);
    setShowESModal(true);

    if (type === "details" && data.indexName) {
      fetchIndexDetails(data.indexName);
    }
  };

  const closeESModal = () => {
    setShowESModal(false);
    setEsModalType("");
    setEsModalData({});
    setNewIndexName("");
    setNewIndexShards("1");
    setNewIndexReplicas("0");
    setReindexSource("");
    setReindexDest("");
    setIndexDetails(null);
  };

  // Effect for initial data fetching on mount
  useEffect(() => {
    fetchData(); // Initial fetch for accounts and files
    fetchAllTasks(); // Initial fetch for tasks
    fetchESData(); // Initial fetch for Elasticsearch data
    fetchConfig(); // Initial fetch for configuration
  }, [fetchData, fetchAllTasks, fetchESData, fetchConfig]); // Added fetchConfig to dependencies

  // Effect to manage polling based on presence of active tasks
  useEffect(() => {
    const anyActiveTasks = tasksList.some(
      (task) => !task.completed && task.status !== "error"
    );

    if (anyActiveTasks) {
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          fetchAllTasks(); // Poll all tasks
        }, 3000); // Poll every 3 seconds to reduce re-renders
        console.log("Started polling for tasks.");
      }
    } else {
      // If no active tasks, clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        console.log("Stopped polling for tasks.");
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [tasksList, fetchAllTasks]); // Depend on tasksList and fetchAllTasks to react to changes in task activity

  // Function to estimate remaining time for a task
  function estimateRemainingTime(start, progress, total) {
    if (!progress || progress === 0 || total === 0 || progress >= total) return null;
    const elapsed = Date.now() - start; // Time elapsed in milliseconds
    const timePerItem = elapsed / progress; // Milliseconds per unit of progress
    const remainingItems = total - progress;
    const remainingMs = Math.round(timePerItem * remainingItems);

    if (isNaN(remainingMs) || !isFinite(remainingMs)) return null;

    const seconds = Math.floor(remainingMs / 1000) % 60;
    const minutes = Math.floor(remainingMs / (1000 * 60)) % 60;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));

    let timeString = '';
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0 || hours > 0) timeString += `${minutes}m `; // Show minutes if hours are shown or if minutes exist
    timeString += `${seconds}s`;

    return timeString.trim();
  }

  // Function to remove a task from the list (dismiss from UI)
  const removeTask = (idToRemove) => {
    setTasksList((prev) => prev.filter((t) => t.taskId !== idToRemove));
    // If the task being removed is the currently running one, clear currentRunningTaskId
    if (idToRemove === currentRunningTaskId) {
      localStorage.removeItem("currentTaskId");
      setCurrentRunningTaskId(null);
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }
    setLoading(true);
    setUploadPercentage(0); // Reset progress at the start of upload
    setError(""); // Clear any previous errors

    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await axiosClient.post("/api/admin/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const { loaded, total } = progressEvent;
          const percent = Math.round((loaded * 100) / total);
          setUploadPercentage(percent);
        },
      });

      const { taskId } = response.data;
      if (taskId) {
        localStorage.setItem("currentTaskId", taskId);
        setCurrentRunningTaskId(taskId);
        fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
      }

      setUploadFiles([]); // Clear selected files after successful upload
    } catch (err) {
      console.error("Upload error:", err);
      setError(
        err.response?.data?.error || "Failed to upload files. Please try again."
      );
    } finally {
      // Ensure loading state and upload percentage are reset regardless of success or failure
      setLoading(false);
      setUploadPercentage(0);
    }
  };

  const handleDeleteUnparsedFile = useCallback(
    async (filename) => {
      if (isAnyTaskRunning) {
        showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
        return;
      }

      setError("");
      setLoading(true);
      try {
        const response = await axiosClient.delete(
          `/api/admin/unparsed-files/${filename}`
        );
        const newTaskId = response.data.taskId;
        localStorage.setItem("currentTaskId", newTaskId);
        setCurrentRunningTaskId(newTaskId);
        fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
      } catch (err) {
        console.error("Error deleting unparsed file:", err);
        setError(
          err.response?.data?.error || "Failed to delete unparsed file."
        );
      } finally {
        setLoading(false);
      }
    },
    [isAnyTaskRunning, showNotification, fetchAllTasks] // Added fetchAllTasks to dependency array
  );

  // Handle moving unparsed file to pending
  const handleMoveToPending = async (filename) => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    setError("");
    try {
      const res = await axiosClient.post(
        `/api/admin/move-to-pending/${filename}`
      );
      const newTaskId = res.data.taskId;
      localStorage.setItem("currentTaskId", newTaskId);
      setCurrentRunningTaskId(newTaskId);
      fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
    } catch (err) {
      setError(err.response?.data?.error || "Failed to move file to pending.");
    }
  };

  const handleParse = async (filename) => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    setError("");
    try {
      const res = await axiosClient.post(`/api/admin/parse/${filename}`);
      const newTaskId = res.data.taskId;
      localStorage.setItem("currentTaskId", newTaskId);
      setCurrentRunningTaskId(newTaskId);
      fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
    } catch (err) {
      setError(err.response?.data?.error || "Parsing failed");
    }
  };

  // Handle parsing all unparsed files
  const handleParseAllUnparsed = async () => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }

    setError("");
    try {
      const res = await axiosClient.post("/api/admin/parse-all-unparsed");
      const newTaskId = res.data.taskId;
      localStorage.setItem("currentTaskId", newTaskId);
      setCurrentRunningTaskId(newTaskId);
      fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to parse all unparsed files."
      );
    }
  };

  // Handle moving pending file to unparsed
  const handleMoveToUnparsed = async (filename) => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    setError("");
    try {
      const res = await axiosClient.post(
        `/api/admin/move-to-unparsed/${filename}`
      );
      const newTaskId = res.data.taskId;
      localStorage.setItem("currentTaskId", newTaskId);
      setCurrentRunningTaskId(newTaskId);
      fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
    } catch (err) {
      setError(err.response?.data?.error || "Failed to move file to unparsed.");
    }
  };

  // Handle deleting pending file
  const handleDeletePendingFile = async (filename) => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    setError("");
    try {
      const res = await axiosClient.delete(
        `/api/admin/pending-files/${filename}`
      );
      const newTaskId = res.data.taskId;
      localStorage.setItem("currentTaskId", newTaskId);
      setCurrentRunningTaskId(newTaskId);
      fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete pending file.");
    }
  };

  const handleDeleteAccount = async (id) => {
    setError("");
    try {
      await axiosClient.delete(`/api/admin/accounts/${id}`);
      playSuccessSound();
      showNotification(
        "success",
        "Account deleted successfully!",
        faCheckCircle
      );
      // Refresh all data after a successful delete
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || "Delete failed");
      playErrorSound();
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    setError("");
    try {
      const ids = selected.map((item) => item.id);
      const res = await axiosClient.post("/api/admin/accounts/bulk-delete", {
        ids,
      });
      if (res.data.taskId) {
        const newTaskId = res.data.taskId;
        localStorage.setItem("currentTaskId", newTaskId);
        setCurrentRunningTaskId(newTaskId);
        fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
      } else {
        await fetchData(); // Fallback for synchronous ops
      }
    } catch (err) {
      setError(err.response?.data?.error || "Bulk delete failed");
    }
  };

  const handleDeleteAll = async () => {
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    // Use a custom modal for confirmation instead of window.confirm
    if (!window.confirm(`Are you sure you want to clean database.`)) {
      return;
    }

    setError("");
    try {
      const res = await axiosClient.post("/api/admin/accounts/clean");
      if (res.data.taskId) {
        const newTaskId = res.data.taskId;
        localStorage.setItem("currentTaskId", newTaskId);
        setCurrentRunningTaskId(newTaskId);
        fetchAllTasks(); // Explicitly call fetchAllTasks to immediately update UI
      } else {
        await fetchData(); // Fallback for synchronous ops
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete all accounts");
    }
  };

  const toggleSelect = (item) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const selectAll = () => {
    if (selected.length === accounts.length) {
      setSelected([]);
    } else {
      setSelected([...accounts]);
    }
  };

  // Function to toggle global password visibility
  const toggleGlobalPasswordVisibility = () => {
    setShowAllPasswords((prev) => !prev);
    // When toggling globally, clear individual password visibility states
    if (!showAllPasswords) {
      setHiddenPasswords({});
    }
  };

  // Function to toggle password visibility in the edit modal
  const toggleEditModalPasswordVisibility = () => {
    setEditModalPasswordHidden((prev) => !prev);
  };

  // Function to toggle individual password visibility
  const togglePasswordVisibility = (id) => {
    setHiddenPasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Handle bulk delete of selected accounts
  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      showNotification("info", "No accounts selected for deletion.", faInfoCircle);
      return;
    }
    
    if (isAnyTaskRunning) {
      showNotification("info", "A task is already running. Please wait for it to complete.", faInfoCircle);
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ${selected.length} selected account(s)?`)) {
      return;
    }
    
    setError("");
    try {
      const ids = selected.map((item) => item.id);
      const res = await axiosClient.post("/api/admin/accounts/bulk-delete", {
        ids,
      });
      if (res.data.taskId) {
        const newTaskId = res.data.taskId;
        localStorage.setItem("currentTaskId", newTaskId);
        setCurrentRunningTaskId(newTaskId);
        fetchAllTasks(); // Update UI
        setSelected([]); // Clear selection after initiating delete
      } else {
        await fetchData(); // Fallback for synchronous ops
        setSelected([]); // Clear selection
      }
    } catch (err) {
      setError(err.response?.data?.error || "Bulk delete failed");
      showNotification("error", err.response?.data?.error || "Bulk delete failed", faExclamationTriangle);
    }
  };

  const handleEditClick = (account) => {
    setCurrentEditingAccount(account);
    setEditFormData({
      url: account.url,
      username: account.username,
      password: account.password,
    });
    setEditModalPasswordHidden(false); // Default to hidden when opening
    setShowEditModal(true);
    setError("");
    hideNotification();
  };

  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async () => {
    setError("");
    if (!editFormData.url || !editFormData.username || !editFormData.password) {
      setError("URL, username, and password fields cannot be empty.");
      playErrorSound();
      return;
    }
    if (!currentEditingAccount) {
      setError("No account selected for editing.");
      playErrorSound();
      return;
    }
    setEditLoading(true);
    try {
      await axiosClient.put(
        `/api/admin/accounts/${currentEditingAccount.id}`,
        editFormData
      );
      playSuccessSound();
      showNotification(
        "success",
        "Account updated successfully!",
        faCheckCircle
      );
      // Refresh all data after a successful edit
      fetchData();
      setShowEditModal(false);
      setCurrentEditingAccount(null);
    } catch (err) {
      setError(
        err.response?.data?.message || err.response?.data?.error || "Failed to update account."
      );
      playErrorSound();
    } finally {
      setEditLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setCurrentEditingAccount(null);
    setEditFormData({ url: "", username: "", password: "" });
    setError("");
    hideNotification();
  };

  // Pagination page input handlers
  const totalPages = Math.ceil(total / pageSize) || 1;
  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  const handleGoToPage = () => {
    const newPage = parseInt(pageInput, 10);
    if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      setError("");
      hideNotification();
    } else {
      setError(`Please enter a valid page number between 1 and ${totalPages}.`);
      playErrorSound();
      setPageInput(String(page));
    }
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === "Enter") {
      handleGoToPage();
    }
  };

  // Render pagination buttons (matching HomePage style)
  const renderPaginationButtons = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
      pages.push(
        <button
          key="first"
          onClick={() => setPage(1)}
          className="px-3 py-1 border border-neutral-700 rounded-md text-neutral-300 bg-neutral-800 hover:bg-neutral-700 mx-1 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95"
        >
          1
        </button>
      );
      if (startPage > 2) {
        pages.push(
          <span key="dots-start" className="px-3 py-1 mx-1 text-neutral-400">
            ...
          </span>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => setPage(i)}
          className={`px-3 py-1 border border-neutral-700 rounded-md mx-1 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95 ${
            page === i ? "bg-blue-600 text-white" : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700"
          }`}
        >
          {i}
        </button>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="dots-end" className="px-3 py-1 mx-1 text-neutral-400">
            ...
          </span>
        );
      }
      pages.push(
        <button
          key="last"
          onClick={() => setPage(totalPages)}
          className="px-3 py-1 border border-neutral-700 rounded-md text-neutral-300 bg-neutral-800 hover:bg-neutral-700 mx-1 transition duration-200 ease-in-out transform hover:scale-105 active:scale-95"
        >
          {totalPages}
        </button>
      );
    }
    return pages;
  };

  function TaskDetails({ tasks }) {
    // Sort tasks to show most recent first
    const sortedTasks = [...tasks].sort((a, b) => b.startTime - a.startTime);

    // Filter to show only active or recently completed/errored tasks (e.g., last 5)
    // Show active tasks or tasks completed/errored in last 10 minutes (600,000 ms)
    const recentTasks = sortedTasks
      .filter((task) => !task.completed || (Date.now() - task.startTime < 600000 && task.progress > 0)) // Also filter out tasks with 0 progress that might be "initializing" too long
      .slice(0, 5); // Limit to top 5 recent tasks

    if (!recentTasks.length) return null;

    return (
      <div className="mb-8 p-4 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-lg shadow-xl border border-neutral-700">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <FontAwesomeIcon icon={faListCheck} className="mr-2 text-blue-400" /> Active/Recent Tasks
        </h3>
        <ul className="space-y-4 max-h-60 overflow-y-auto pr-2"> {/* Added overflow-y-auto and pr-2 for scrollbar */}
          {recentTasks.map((task) => {
            const isCompleted = task.completed;
            const percent = task.total > 0 ? Math.round((task.progress / task.total) * 100) : 0;
            let statusColorClass = "text-neutral-400";
            if (isCompleted) {
              statusColorClass = task.status === "completed" ? "text-green-400" : "text-red-400";
            } else if (
              task.status === "processing" ||
              task.status === "parsing" ||
              task.status === "moving" || // Added moving
              task.status === "deleting" || // Added deleting
              task.status === "counting lines" || // Added counting lines
              task.status === "initializing"
            ) {
              statusColorClass = "text-blue-400";
            } else if (task.status === "error") {
              statusColorClass = "text-red-400";
            }
            return (
              <li key={task.taskId} className="border border-neutral-700 rounded-lg p-4 relative bg-neutral-800 hover:bg-neutral-700 transition duration-200 ease-in-out shadow-md">
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-sm font-semibold ${statusColorClass}`}>
                    <FontAwesomeIcon
                      icon={
                        task.status === "error"
                          ? faExclamationTriangle
                          : isCompleted
                          ? faCheckCircle
                          : faCircleNotch
                      }
                      className={!isCompleted && task.status !== "error" ? "fa-spin mr-1" : "mr-1"}
                    />
                    {task.type} {task.filename ? `(${task.filename})` : ""}
                  </span>
                  {task.status === "completed" || task.status === "error" ? (
                    <button
                      onClick={() => removeTask(task.taskId)}
                      className="text-neutral-400 hover:text-white transition-colors duration-150"
                      title="Dismiss task"
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  ) : null}
                </div>
                <div className="w-full bg-neutral-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs mt-2 text-neutral-400">
                  <span>
                    {task.message}
                    {task.total > 0 && ` (${task.progress}/${task.total})`}
                  </span>
                  <span>
                    {estimateRemainingTime(task.startTime, task.progress, task.total) && (
                      <span className="ml-2">
                        ETA: {estimateRemainingTime(task.startTime, task.progress, task.total)}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 text-neutral-100 min-h-screen p-8 font-sans">
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
            icon={notification.icon}
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
        
        {/* Tab Navigation */}
        <div className="mb-8 border-b border-neutral-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("files")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "files"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              File Management
            </button>
            <button
              onClick={() => setActiveTab("elasticsearch")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "elasticsearch"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Elasticsearch Management
            </button>
            <button
              onClick={() => setActiveTab("configuration")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "configuration"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Configuration
            </button>
            <button
              onClick={() => setActiveTab("accounts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                activeTab === "accounts"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-300 hover:border-neutral-300"
              }`}
            >
              Account Management
            </button>
          </nav>
        </div>

        {/* Task Details Component */}
        <TaskDetails tasks={tasksList} />

        {/* File Management Tab */}
        {activeTab === "files" && (
          <>
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
                isAnyTaskRunning || // Use global task running flag
                showEditModal ||
                loading
              }
            >
              Upload
            </button>
          </div>
        </section>
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
              {/* Added overflow-y-auto and pr-2 */}
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
        <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Unparsed Files
          </h2>
          {/* Removed direct taskStatus progress bar here, as TaskDetails now handles all task display */}
          <div className="mb-4">
            <button
              onClick={handleParseAllUnparsed}
              className="bg-primary hover:bg-button-hover-bg text-white px-5 py-2.5 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
              disabled={
                unparsedFiles.length === 0 || isAnyTaskRunning || showEditModal
              }
            >
              <FontAwesomeIcon icon={faPlay} className="mr-2" /> Parse All
              Unparsed
            </button>
          </div>
          {loading ? (
            <p className="text-neutral-400">Loading files...</p>
          ) : unparsedFiles.length === 0 ? (
            <p className="text-neutral-400">
              No unparsed files ready for parsing.
            </p>
          ) : (
            <ul className="space-y-4 w-full border border-neutral-700 rounded-lg p-4 bg-neutral-900 max-h-80 overflow-y-auto shadow-inner pr-2">
              {/* Added overflow-y-auto and pr-2 */}
              {unparsedFiles.map((f) => {
                // Find if this specific file has an active parsing task
                const currentParsingTask = tasksList.find(
                  (task) =>
                    !task.completed &&
                    (task.type === "Parse File" || task.type === "Parse All Unparsed") &&
                    task.filename === f
                );
                return (
                  <li
                    key={f}
                    className="flex justify-between items-center bg-neutral-800 p-4 rounded-lg shadow-sm hover:shadow-md transition duration-200 ease-in-out border border-neutral-700"
                  >
                    <span className="font-medium text-white">{f}</span>
                    <div className="space-x-2">
                      <button
                        onClick={() => handleParse(f)}
                        disabled={isAnyTaskRunning || showEditModal}
                        className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transform hover:scale-105 active:scale-95 ${
                          isAnyTaskRunning || showEditModal
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {currentParsingTask ? (
                          <FontAwesomeIcon
                            icon={faCircleNotch}
                            className="fa-spin mr-1"
                          />
                        ) : (
                          "Parse"
                        )}
                      </button>
                      <button
                        onClick={() => handleMoveToPending(f)}
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
                        Move to Pending
                      </button>
                      <button
                        onClick={() => handleDeleteUnparsedFile(f)}
                        className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                        disabled={loading || isAnyTaskRunning}
                        title={`Delete '${f}'`}
                      >
                        <FontAwesomeIcon icon={faTrash} className="mr-1" /> Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Parsed Files
          </h2>
          {parsedFiles.length === 0 ? (
            <p className="text-neutral-400">No files have been parsed yet.</p>
          ) : (
            <ul className="space-y-4 max-h-80 overflow-y-auto pr-2">
              {/* Added overflow-y-auto and pr-2 */}
              {parsedFiles.map((f) => (
                <li
                  key={f}
                  className="flex justify-between items-center bg-neutral-800 p-4 rounded-lg shadow-sm hover:shadow-md transition duration-200 ease-in-out border border-neutral-700"
                >
                  <span className="font-medium text-white">{f}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
          </>
        )}

        {/* Elasticsearch Management Tab */}
        {activeTab === "elasticsearch" && (
          <>
            {/* Elasticsearch Management Section */}
            <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-semibold text-white">
              Elasticsearch Management
            </h2>
            <div className="flex space-x-3">
              <button
                onClick={() => openESModal("create")}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                disabled={isAnyTaskRunning || esLoading}
              >
                Create Index
              </button>
              <button
                onClick={() => openESModal("reindex")}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                disabled={isAnyTaskRunning || esLoading}
              >
                Reindex Data
              </button>
              <button
                onClick={fetchESData}
                className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
                disabled={esLoading}
              >
                <FontAwesomeIcon 
                  icon={faCircleNotch} 
                  className={`mr-2 ${esLoading ? 'fa-spin' : ''}`} 
                />
                Refresh
              </button>
            </div>
          </div>

          {/* Cluster Health Info */}
          {esHealth && (
            <div className="mb-6 p-4 bg-neutral-700 rounded-lg">
              <h3 className="text-xl font-semibold text-white mb-3">Cluster Health</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-neutral-400">Status:</span>
                  <span className={`ml-2 px-2 py-1 rounded ${
                    esHealth.cluster.status === 'green' ? 'bg-green-600' :
                    esHealth.cluster.status === 'yellow' ? 'bg-yellow-600' : 'bg-red-600'
                  } text-white`}>
                    {esHealth.cluster.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400">Nodes:</span>
                  <span className="ml-2 text-white">{esHealth.cluster.numberOfNodes}</span>
                </div>
                <div>
                  <span className="text-neutral-400">Documents:</span>
                  <span className="ml-2 text-white">{esHealth.storage.documentCount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-400">Storage:</span>
                  <span className="ml-2 text-white">{esHealth.storage.totalSizeReadable}</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected Index Info */}
          <div className="mb-6 p-4 bg-neutral-700 rounded-lg">
            <h3 className="text-xl font-semibold text-white mb-3">Current Index for Operations</h3>
            <div className="text-lg">
              <span className="text-neutral-400">Selected Index:</span>
              <span className="ml-2 px-3 py-1 bg-primary text-white rounded-lg font-semibold">
                {selectedIndex}
              </span>
              <span className="ml-3 text-sm text-neutral-400">
                (All new data and operations will use this index)
              </span>
            </div>
          </div>

          {/* Indices Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-neutral-100 bg-neutral-700 rounded-lg shadow-lg">
              <thead className="bg-neutral-600 text-neutral-100">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Index Name</th>
                  <th className="text-left py-3 px-4 font-semibold">Status</th>
                  <th className="text-left py-3 px-4 font-semibold">Documents</th>
                  <th className="text-left py-3 px-4 font-semibold">Size</th>
                  <th className="text-left py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {esLoading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-neutral-400">
                      <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
                      Loading indices...
                    </td>
                  </tr>
                ) : esIndices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-neutral-400">
                      No indices found
                    </td>
                  </tr>
                ) : (
                  esIndices.map((index) => (
                    <tr
                      key={index.name}
                      className={`border-b border-neutral-600 hover:bg-neutral-600 transition-colors ${
                        index.isSelected ? 'bg-primary bg-opacity-20' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <span className="font-medium">{index.name}</span>
                          {index.isSelected && (
                            <span className="ml-2 px-2 py-1 bg-primary text-white text-xs rounded-full">
                              SELECTED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          index.health === 'green' ? 'bg-green-600' :
                          index.health === 'yellow' ? 'bg-yellow-600' : 'bg-red-600'
                        } text-white`}>
                          {index.health?.toUpperCase() || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-300">
                        {index.docCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-neutral-300">
                        {index.storeSize}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex space-x-2">
                          {!index.isSelected && (
                            <button
                              onClick={() => handleSelectIndex(index.name)}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={isAnyTaskRunning || esLoading}
                            >
                              Select
                            </button>
                          )}
                          <button
                            onClick={() => openESModal("details", { indexName: index.name })}
                            className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out"
                            disabled={esLoading}
                          >
                            <FontAwesomeIcon icon={faInfoCircle} className="mr-1" />
                            Details
                          </button>
                          {!index.name.startsWith('.') && !index.isSelected && (
                            <button
                              onClick={() => handleDeleteIndex(index.name)}
                              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={isAnyTaskRunning || esLoading}
                            >
                              <FontAwesomeIcon icon={faTrash} className="mr-1" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
          </>
        )}

        {/* Configuration Tab */}
        {activeTab === "configuration" && (
          <>
            <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
              <h2 className="text-3xl font-semibold text-white mb-6">
                System Configuration
              </h2>
              
              {configLoading ? (
                <div className="text-center py-8">
                  <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
                  Loading configuration...
                </div>
              ) : config ? (
                <div className="space-y-8">
                  {/* Search Indices Configuration */}
                  <div className="p-6 bg-neutral-700 rounded-lg">
                    <h3 className="text-xl font-semibold text-white mb-4">
                      Search Indices Configuration
                    </h3>
                    <p className="text-neutral-300 mb-4">
                      Select which indices should be searched by default on the homepage.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      {esIndices.map((index) => (
                        <label
                          key={index.name}
                          className="flex items-center p-3 bg-neutral-600 rounded-lg cursor-pointer hover:bg-neutral-500 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSearchIndices.includes(index.name)}
                            onChange={() => {
                              setSelectedSearchIndices(prev => {
                                if (prev.includes(index.name)) {
                                  return prev.filter(idx => idx !== index.name);
                                } else {
                                  return [...prev, index.name];
                                }
                              });
                            }}
                            className="mr-3 w-4 h-4 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
                          />
                          <div className="flex-1">
                            <span className="text-white font-medium">{index.name}</span>
                            <div className="text-sm text-neutral-400">
                              {index.docCount.toLocaleString()} documents
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    
                    <button
                      onClick={updateSearchIndices}
                      className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-75"
                      disabled={selectedSearchIndices.length === 0}
                    >
                      Update Search Indices
                    </button>
                  </div>

                  {/* System Settings */}
                  <div className="p-6 bg-neutral-700 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold text-white">
                        System Settings
                      </h3>
                      {hasUnsavedSystemChanges && (
                        <span className="text-yellow-400 text-sm font-medium">
                          Unsaved changes
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Minimum Visible Characters
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={tempSystemSettings.minVisibleChars}
                          onChange={(e) => handleSystemSettingChange('minVisibleChars', parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <p className="text-xs text-neutral-400 mt-1">
                          Minimum characters to show when masking passwords
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Password Masking Ratio
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          max="0.9"
                          step="0.1"
                          value={tempSystemSettings.maskingRatio}
                          onChange={(e) => handleSystemSettingChange('maskingRatio', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <p className="text-xs text-neutral-400 mt-1">
                          Percentage of password to show (0.1 = 10%, 0.9 = 90%)
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Username Masking Ratio
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          max="0.9"
                          step="0.1"
                          value={tempSystemSettings.usernameMaskingRatio}
                          onChange={(e) => handleSystemSettingChange('usernameMaskingRatio', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <p className="text-xs text-neutral-400 mt-1">
                          Percentage of username to show
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Batch Size
                        </label>
                        <input
                          type="number"
                          min="100"
                          max="5000"
                          step="100"
                          value={tempSystemSettings.batchSize}
                          onChange={(e) => handleSystemSettingChange('batchSize', parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <p className="text-xs text-neutral-400 mt-1">
                          Number of documents to process in each batch
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-2">
                          Show Raw Lines by Default
                        </label>
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id="showRawLineByDefault"
                            checked={tempSystemSettings.showRawLineByDefault}
                            onChange={(e) => handleSystemSettingChange('showRawLineByDefault', e.target.checked)}
                            className="w-4 h-4 text-primary bg-neutral-600 border-neutral-500 rounded focus:ring-primary focus:ring-2"
                          />
                          <label htmlFor="showRawLineByDefault" className="text-white">
                            Allow admin to see raw lines
                          </label>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          When enabled, admin can view the original unprocessed data lines in search results
                        </p>
                      </div>
                    </div>

                    {/* Save/Reset Buttons */}
                    <div className="flex space-x-4">
                      <button
                        onClick={saveSystemSettings}
                        disabled={!hasUnsavedSystemChanges}
                        className="bg-primary hover:bg-button-hover-bg text-white px-6 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        <FontAwesomeIcon icon={faSave} />
                        <span>Save Settings</span>
                      </button>
                      
                      <button
                        onClick={resetSystemSettings}
                        disabled={!hasUnsavedSystemChanges}
                        className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-400">Failed to load configuration</p>
                  <button
                    onClick={fetchConfig}
                    className="mt-4 bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg"
                  >
                    Retry
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Account Management Tab */}
        {activeTab === "accounts" && (
          <>
            <section className="mb-12 p-6 bg-neutral-800 rounded-xl shadow-lg border border-neutral-700">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Account Management</h2>
                <div className="flex space-x-4">
                  <button
                    onClick={toggleGlobalPasswordVisibility}
                    className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg transition duration-150 ease-in-out flex items-center space-x-2"
                  >
                    <FontAwesomeIcon icon={showAllPasswords ? faEyeSlash : faEye} />
                    <span>{showAllPasswords ? "Hide All Passwords" : "Show All Passwords"}</span>
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selected.length === 0 || isAnyTaskRunning}
                    className="bg-danger hover:bg-red-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition duration-150 ease-in-out flex items-center space-x-2"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    <span>Delete Selected ({selected.length})</span>
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
                  <strong>Error:</strong> {error}
                </div>
              )}

              <div className="overflow-hidden border border-neutral-600 rounded-lg">
                <table className="min-w-full divide-y divide-neutral-600">
                  <thead className="bg-neutral-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          className="form-checkbox h-4 w-4 text-blue-400 rounded focus:ring-blue-400 bg-neutral-600 border-neutral-500 cursor-pointer"
                          checked={
                            selected.length === accounts.length &&
                            accounts.length > 0
                          }
                          onChange={selectAll}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        Password
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        Source File
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                    {/* Table body rows */}
                    {loading ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="px-6 py-4 text-center text-neutral-400"
                        >
                          Loading records...
                        </td>
                      </tr>
                    ) : accounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="px-6 py-4 text-center text-neutral-400"
                        >
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      accounts.map((account) => (
                        <tr
                          key={account.id}
                          className="hover:bg-neutral-700 transition duration-150 ease-in-out"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              className="form-checkbox h-4 w-4 text-blue-400 rounded focus:ring-blue-400 bg-neutral-600 border-neutral-500 cursor-pointer"
                              checked={selected.includes(account)}
                              onChange={() => toggleSelect(account)}
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-neutral-200 break-all">
                            {/* Added break-all for URL overflow */}
                            {account.url}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                            {account.username}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                            <div className="flex items-center">
                              {showAllPasswords || !hiddenPasswords[account.id] ? (
                                <span>{account.password}</span>
                              ) : (
                                <span>••••••••</span>
                              )}
                              <button
                                onClick={() => togglePasswordVisibility(account.id)}
                                className="ml-2 text-neutral-400 hover:text-blue-400 transition-colors"
                              >
                                <FontAwesomeIcon
                                  icon={
                                    showAllPasswords || !hiddenPasswords[account.id]
                                      ? faEyeSlash
                                      : faEye
                                  }
                                  className="text-base"
                                />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                            {account.sourceFile}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-3">
                              <button
                                onClick={() => handleEditClick(account)}
                                className="bg-primary hover:bg-button-hover-bg p-3 transform hover:scale-110 transition-transform"
                                title="Edit Account"
                              >
                                <FontAwesomeIcon icon={faEdit} />
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(account.id)}
                                className="bg-danger hover:bg-button-hover-bg p-3 transform hover:scale-110 transition-transform"
                                title="Delete Account"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="mt-6 flex justify-center items-center space-x-2">
                {/* Centered pagination */}
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1 || loading}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-50 transform hover:scale-105 active:scale-95 transition"
                >
                  Previous
                </button>
                {renderPaginationButtons()}
                {/* Render dynamic pagination buttons */}
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages || loading}
                  className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-50 transform hover:scale-105 active:scale-95 transition"
                >
                  Next
                </button>
              </div>
            </section>
          </>
        )}

        {/* Modals Section */}
        {/* Edit Account Modal */}
        {showEditModal && currentEditingAccount && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            {/* Darker overlay, added padding */}
            <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-neutral-700 relative">
              {/* Enhanced modal box */}
              <h3 className="text-2xl font-bold text-white mb-6">Edit Account</h3>
              <button
                onClick={handleCancelEdit}
                className="absolute top-4 right-4 text-neutral-400 hover:text-red-400 text-3xl transition-colors"
              >
                &times;
              </button>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="edit-url"
                    className="block text-sm font-medium text-neutral-300 mb-1"
                  >
                    URL
                  </label>
                  <input
                    type="text"
                    id="edit-url"
                    name="url"
                    value={editFormData.url}
                    onChange={handleEditChange}
                    className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-username"
                    className="block text-sm font-medium text-neutral-300 mb-1"
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="edit-username"
                    name="username"
                    value={editFormData.username}
                    onChange={handleEditChange}
                    className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-password"
                    className="block text-sm font-medium text-neutral-300 mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={editModalPasswordHidden ? "password" : "text"}
                      id="edit-password"
                      name="password"
                      value={editFormData.password}
                      onChange={handleEditChange}
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={toggleEditModalPasswordVisibility}
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-blue-400 transition-colors"
                    >
                      <FontAwesomeIcon
                        icon={editModalPasswordHidden ? faEyeSlash : faEye}
                        className="text-base"
                      />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button
                  onClick={handleSaveEdit}
                  className="bg-primary hover:bg-button-hover-bg text-white px-5 py-2.5 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                  disabled={editLoading}
                >
                  {editLoading ? (
                    <FontAwesomeIcon
                      icon={faCircleNotch}
                      className="fa-spin mr-2"
                    />
                  ) : null}
                  Save Changes
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-opacity-75 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                  disabled={editLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showESModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">
                  {esModalType === "create" && "Create New Index"}
                  {esModalType === "reindex" && "Reindex Data"}
                  {esModalType === "details" && `Index Details: ${esModalData.indexName}`}
                </h3>
                <button
                  onClick={closeESModal}
                  className="text-neutral-400 hover:text-red-400 text-3xl transition-colors"
                >
                  &times;
                </button>
              </div>

              {/* Create Index Modal */}
              {esModalType === "create" && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="new-index-name" className="block text-sm font-medium text-neutral-300 mb-2">
                      Index Name
                    </label>
                    <input
                      type="text"
                      id="new-index-name"
                      value={newIndexName}
                      onChange={(e) => setNewIndexName(e.target.value)}
                      placeholder="Enter index name (lowercase, no spaces)"
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-sm text-neutral-400 mt-1">
                      Index names will be automatically formatted (lowercase, special characters replaced with underscores)
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="new-index-shards" className="block text-sm font-medium text-neutral-300 mb-2">
                        Number of Shards
                      </label>
                      <input
                        type="number"
                        id="new-index-shards"
                        value={newIndexShards}
                        onChange={(e) => setNewIndexShards(e.target.value)}
                        min="1"
                        max="1000"
                        placeholder="1"
                        className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-sm text-neutral-400 mt-1">
                        Range: 1-1000 (default: 1)
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="new-index-replicas" className="block text-sm font-medium text-neutral-300 mb-2">
                        Number of Replicas
                      </label>
                      <input
                        type="number"
                        id="new-index-replicas"
                        value={newIndexReplicas}
                        onChange={(e) => setNewIndexReplicas(e.target.value)}
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-sm text-neutral-400 mt-1">
                        Range: 0-100 (default: 0)
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-neutral-800 p-3 rounded-md">
                    <p className="text-sm text-neutral-300">
                      <strong>Note:</strong> Shards determine how data is distributed across nodes. Replicas provide data redundancy and can improve search performance. 
                      For most use cases, 1 shard and 0-1 replicas are sufficient for small to medium datasets.
                    </p>
                  </div>
                  
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      onClick={handleCreateIndex}
                      className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50"
                      disabled={
                        !newIndexName.trim() || 
                        isAnyTaskRunning ||
                        parseInt(newIndexShards) < 1 || 
                        parseInt(newIndexShards) > 1000 ||
                        parseInt(newIndexReplicas) < 0 || 
                        parseInt(newIndexReplicas) > 100
                      }
                    >
                      Create Index
                    </button>
                                        <button
                      onClick={closeESModal}
                      className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Reindex Modal */}
              {esModalType === "reindex" && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="reindex-source" className="block text-sm font-medium text-neutral-300 mb-2">
                      Source Index
                    </label>
                    <select
                      id="reindex-source"
                      value={reindexSource}
                      onChange={(e) => setReindexSource(e.target.value)}
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select source index</option>
                      {esIndices.map((index) => (
                        <option key={index.name} value={index.name}>
                          {index.name} ({index.docCount.toLocaleString()} docs)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reindex-dest" className="block text-sm font-medium text-neutral-300 mb-2">
                      Destination Index
                    </label>
                    <select
                      id="reindex-dest"
                      value={reindexDest}
                      onChange={(e) => setReindexDest(e.target.value)}
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select destination index</option>
                      {esIndices.map((index) => (
                        <option key={index.name} value={index.name}>
                          {index.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded-lg p-4 mt-4">
                    <p className="text-yellow-200 text-sm">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                      Warning: Reindexing will copy all documents from the source index to the destination index. 
                      If the destination index already contains data, the documents will be merged.
                    </p>
                  </div>
                  <div className="flex justify-end space-x-3 mt-6">
                                        <button
                      onClick={handleReindex}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out disabled:opacity-50"
                      disabled={!reindexSource || !reindexDest || reindexSource === reindexDest || isAnyTaskRunning}
                    >
                      Start Reindexing
                    </button>
                    <button
                      onClick={closeESModal}
                      className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out"
                    >
                      Cancel
                    </button>

                  </div>
                </div>
              )}

              {/* Index Details Modal */}
              {esModalType === "details" && (
                <div className="space-y-6">
                  {esLoading ? (
                    <div className="text-center py-8">
                      <FontAwesomeIcon icon={faCircleNotch} className="fa-spin text-3xl text-blue-400 mb-4" />
                      <p className="text-neutral-400">Loading index details...</p>
                    </div>
                  ) : indexDetails ? (
                    <>
                      {/* Basic Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-neutral-700 p-4 rounded-lg">
                          <h4 className="text-sm text-neutral-400">Documents</h4>
                          <p className="text-2xl font-bold text-white">{indexDetails.stats.docs.count.toLocaleString()}</p>
                        </div>
                        <div className="bg-neutral-700 p-4 rounded-lg">
                          <h4 className="text-sm text-neutral-400">Size</h4>
                          <p className="text-2xl font-bold text-white">{formatBytes(indexDetails.stats.store.size_in_bytes)}</p>
                        </div>
                        <div className="bg-neutral-700 p-4 rounded-lg">
                          <h4 className="text-sm text-neutral-400">Searches</h4>
                          <p className="text-2xl font-bold text-white">{indexDetails.stats.search.query_total.toLocaleString()}</p>
                        </div>
                        <div className="bg-neutral-700 p-4 rounded-lg">
                          <h4 className="text-sm text-neutral-400">Indexing Ops</h4>
                          <p className="text-2xl font-bold text-white">{indexDetails.stats.indexing.index_total.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Mapping */}
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3">Mapping</h4>
                        <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-700 max-h-60 overflow-y-auto">
                          <pre className="text-sm text-neutral-300 whitespace-pre-wrap">
                            {JSON.stringify(indexDetails.mapping, null, 2)}
                          </pre>
                        </div>
                      </div>

                      {/* Settings (condensed) */}
                      <div>
                        <h4 className="text-lg font-semibold text-white mb-3">Key Settings</h4>
                        <div className="bg-neutral-700 p-4 rounded-lg space-y-2">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Number of Shards:</span>
                            <span className="text-white">{indexDetails.settings.index?.number_of_shards || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Number of Replicas:</span>
                            <span className="text-white">{indexDetails.settings.index?.number_of_replicas || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Creation Date:</span>
                            <span className="text-white">
                              {indexDetails.settings.index?.creation_date ? 
                                new Date(parseInt(indexDetails.settings.index.creation_date)).toLocaleString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-neutral-400">
                      Failed to load index details
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    <button
                      onClick={closeESModal}
                      className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg transition duration-150 ease-in-out"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format bytes (moved inside component for access)
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}