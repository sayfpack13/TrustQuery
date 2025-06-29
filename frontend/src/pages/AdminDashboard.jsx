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
  const fetchAllTasks = async () => {
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
        showNotification(
          "info",
          `${anyActiveTask.type}${anyActiveTask.filename ? ` (${anyActiveTask.filename})` : ''} - ${
            anyActiveTask.message || "Processing..."
          }`,
          faCircleNotch,
          true
        );
        hasPlayedCompletionSoundRef.current = false; // Reset sound flag if tasks are active
      } else {
        // If no active tasks, clear currentRunningTaskId if it was set
        if (currentRunningTaskId) {
          localStorage.removeItem("currentTaskId");
          setCurrentRunningTaskId(null);
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
          fetchData(); // This is the intended data refresh upon task completion
          hasPlayedCompletionSoundRef.current = true; // Prevent multiple sound plays
        }
      }
    } catch (err) {
      console.error("Error fetching all tasks:", err);
      // If error, ensure current running task is cleared to stop continuous polling for a dead task
      if (currentRunningTaskId) {
        localStorage.removeItem("currentTaskId");
        setCurrentRunningTaskId(null);
      }
      setTasksList([]); // Clear tasks on error
      showNotification(
        "error",
        "Failed to fetch tasks.",
        faExclamationTriangle
      );
      playErrorSound();
    }
  };

  // Effect for initial data fetching on mount
  useEffect(() => {
    fetchData(); // Initial fetch for accounts and files
    fetchAllTasks(); // Initial fetch for tasks
  }, []);

  // Effect to manage polling based on presence of active tasks
  useEffect(() => {
    const anyActiveTasks = tasksList.some(
      (task) => !task.completed && task.status !== "error"
    );

    if (anyActiveTasks) {
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          fetchAllTasks(); // Poll all tasks
        }, 1000); // Poll every 1 second for more real-time updates
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
  }, [tasksList, currentRunningTaskId]); // Depend on tasksList to react to changes in task activity

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
    [isAnyTaskRunning, showNotification] // Added showNotification to dependency array
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
      // Directly update the accounts state for immediate UI reflection
      setAccounts((prevAccounts) =>
        prevAccounts.filter((account) => account.id !== id)
      );
      setTotal((prevTotal) => prevTotal - 1); // Decrement total count
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

  // Function to toggle individual password visibility
  const togglePasswordVisibility = (id) => {
    setHiddenPasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // New function for modal password visibility
  const toggleEditModalPasswordVisibility = () => {
    setEditModalPasswordHidden((prev) => !prev);
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
    setEditFormData({
      ...editFormData,
      [e.target.name]: e.target.value,
    });
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
      setAccounts((prevAccounts) =>
        prevAccounts.map((account) =>
          account.id === currentEditingAccount.id
            ? { ...account, ...editFormData }
            : account
        )
      );
      setShowEditModal(false);
      setCurrentEditingAccount(null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to update account."
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
            page === i
              ? "bg-blue-600 text-white"
              : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700"
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
          <FontAwesomeIcon icon={faListCheck} className="mr-2 text-blue-400" />
          Active/Recent Tasks
        </h3>
        <ul className="space-y-4 max-h-60 overflow-y-auto pr-2">
          {/* Added overflow-y-auto and pr-2 for scrollbar */}
          {recentTasks.map((task) => {
            const isCompleted = task.completed;
            const percent =
              task.total > 0
                ? Math.round((task.progress / task.total) * 100)
                : 0;

            let statusColorClass = "text-neutral-400";
            if (isCompleted) {
              statusColorClass =
                task.status === "completed" ? "text-green-400" : "text-red-400";
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
              <li
                key={task.taskId}
                className="border border-neutral-700 rounded-lg p-4 relative bg-neutral-800 hover:bg-neutral-700 transition duration-200 ease-in-out shadow-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="text-lg text-white">
                      {task.type} {task.filename ? `(${task.filename})` : ""}
                    </strong>
                    <p className={`text-sm ${statusColorClass}`}>
                      {isCompleted
                        ? task.status === "completed"
                          ? "Completed"
                          : "Failed"
                        : task.status || "In progress"}
                    </p>
                    {task.fileMovedCount > 0 && ( // Display fileMovedCount only if > 0
                      <p className="text-xs text-neutral-400 mt-1">
                        Files moved: {task.fileMovedCount}
                      </p>
                    )}
                    {task.message && (
                      <p className="text-xs text-neutral-400 mt-1">
                        {task.message}
                      </p>
                    )}
                  </div>
                  {isCompleted && (
                    <button
                      onClick={() => removeTask(task.taskId)}
                      className="absolute top-2 right-2 text-neutral-400 hover:text-red-400 text-xl transition-colors duration-200"
                      title="Dismiss task"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Progress bar logic: only show if total > 0 and not completed with error or just initialized */}
                {!isCompleted && task.total > 0 && (
                  <div className="mt-3 w-full bg-neutral-700 rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${Math.min(100, percent)}%`,
                      }}
                    ></div>
                  </div>
                )}
                <div className="mt-2 flex justify-between text-sm text-neutral-400">
                  {task.total > 0 && task.progress !== undefined && !isCompleted ? (
                    <>
                      <span>{percent}%</span>
                      <span>
                        {task.progress} / {task.total} lines
                      </span>
                    </>
                  ) : task.progress !== undefined && !isCompleted ? (
                    <span>{task.progress} items processed</span>
                  ) : task.total > 0 && isCompleted ? (
                    <span>{task.progress} / {task.total} lines processed</span>
                  ) : null} {/* If completed, show final progress if total > 0 */}
                </div>
                {/* ETA: only show if not completed and progress > 0 and total > 0 */}
                {!isCompleted && task.startTime && task.progress > 0 && task.total > 0 && (
                  <p className="text-xs text-neutral-400 mt-1">
                    ETA: {estimateRemainingTime(task.startTime, task.progress, task.total)}
                  </p>
                )}
                {task.error && (
                  <p className="mt-2 text-red-400 text-sm">
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    {task.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-neutral-950 font-inter text-neutral-100">
      {/* Enhanced overall page style */}
      {/* Notification Pop-up */}
      {notification.isVisible && (
        <div
          className={`fixed bottom-5 right-5 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-3
            ${notification.type === "success" ? "bg-green-600 text-white" : ""}
            ${notification.type === "error" ? "bg-red-600 text-white" : ""}
            ${notification.type === "info" ? "bg-primary text-white" : ""}
          `}
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
        {/* Enhanced main content wrapper */}
        <div className="flex justify-between items-center mb-10 pb-4 border-b border-neutral-700">
          {/* Enhanced header styling */}
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
        {/* Task Details Component */}
        <TaskDetails tasks={tasksList} />
        <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
          {/* Consistent section styling */}
          <h2 className="text-3xl font-semibold text-white mb-6">
            Upload New File
          </h2>
          {/* Changed uploadPercentage condition to avoid confusion with parsing progress */}
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
        <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
          <h2 className="text-3xl font-semibold text-white mb-6 flex items-center justify-between">
            <span>Account Management ({total})</span>
            <button
              onClick={() => setShowAllPasswords(!showAllPasswords)}
              className="bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1 rounded-full text-sm shadow-md transition transform hover:scale-105 active:scale-95"
            >
              <FontAwesomeIcon
                icon={showAllPasswords ? faEyeSlash : faEye}
                className="mr-2"
              />
              {showAllPasswords ? "Hide All Passwords" : "Show All Passwords"}
            </button>
          </h2>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <button
              onClick={handleBulkDelete}
              className="bg-red-700 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg shadow-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
              disabled={
                selected.length === 0 || isAnyTaskRunning || showEditModal
              }
            >
              Delete Selected ({selected.length})
            </button>
            <button
              onClick={handleDeleteAll}
              className="bg-red-700 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg shadow-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
              disabled={isAnyTaskRunning || showEditModal}
            >
              Delete All records & Clear Database
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg shadow-inner border border-neutral-700">
            {/* Table container with overflow */}
            <table className="min-w-full bg-neutral-800 text-neutral-100 divide-y divide-neutral-700">
              {/* Table styling */}
              <thead className="bg-neutral-700">
                {/* Table header background */}
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
      </div>
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
    </div>
  );
}
