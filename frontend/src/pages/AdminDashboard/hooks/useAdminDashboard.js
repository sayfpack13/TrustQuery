import { useState, useCallback, useRef, useEffect } from 'react';
import { faCheckCircle, faExclamationTriangle, faCircleNotch, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../../../api/axiosClient';
import useSound from '../../../components/useSound';

export const useAdminDashboard = () => {
  // Notification State
  const [notification, setNotification] = useState({
    isVisible: false,
    type: "", // 'success', 'error', 'info'
    message: "",
    icon: null,
    isLoading: false,
  });

  // Error state
  const [error, setError] = useState("");

  // Sound hooks
  const { playSound: playSuccessSound } = useSound("/sounds/success.mp3");
  const { playSound: playErrorSound } = useSound("/sounds/error.mp3");

  // Task progress tracking
  const [currentRunningTaskId, setCurrentRunningTaskId] = useState(
    () => localStorage.getItem("currentTaskId") || null
  );
  const [tasksList, setTasksList] = useState([]);
  const [lastNotifiedTaskId, setLastNotifiedTaskId] = useState(null);

  // Ref for polling interval ID
  const pollingIntervalRef = useRef(null);
  const hasPlayedCompletionSoundRef = useRef(false);

  // For disabling buttons that trigger tasks
  const isAnyTaskRunning = tasksList.some(
    (task) => !task.completed && task.status !== "error"
  );

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
  }, [currentRunningTaskId, showNotification, playSuccessSound, playErrorSound]);

  // Notification and error handling for task actions
  const handleTaskAction = async (action, payload, successMessage, errorMessage) => {
    setError("");
    try {
      const response = await axiosClient.post(`/api/admin/tasks/${action}`, payload);
      
      // Some task actions create new tasks, others just manage existing ones
      if (response.data.taskId) {
        // Action created a new task
        const newTaskId = response.data.taskId;
        localStorage.setItem("currentTaskId", newTaskId);
        setCurrentRunningTaskId(newTaskId);
        showNotification("info", successMessage, faCircleNotch, true);
      } else {
        // Action just managed existing tasks (like clear)
        showNotification("success", response.data.message || successMessage, faCheckCircle);
      }
      
      fetchAllTasks(); // Refresh tasks
    } catch (err) {
      setError(err.response?.data?.error || errorMessage);
      playErrorSound();
    }
  };

  // Function to estimate remaining time for a task
  const estimateRemainingTime = (start, progress, total) => {
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
  };

  // Function to remove a task from the list (dismiss from UI)
  const removeTask = (idToRemove) => {
    setTasksList((prev) => prev.filter((t) => t.taskId !== idToRemove));
    // If the task being removed is the currently running one, clear currentRunningTaskId
    if (idToRemove === currentRunningTaskId) {
      localStorage.removeItem("currentTaskId");
      setCurrentRunningTaskId(null);
    }
  };

  // Effect to play sound when error state changes (for general errors, not task errors)
  useEffect(() => {
    if (error) {
      playErrorSound();
      showNotification("error", error, faExclamationTriangle);
    }
  }, [error, playErrorSound, showNotification]);

  // Effect to manage polling based on presence of active tasks
  useEffect(() => {
    const anyActiveTasks = tasksList.some(
      (task) => !task.completed && task.status !== "error"
    );

    if (anyActiveTasks) {
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          fetchAllTasks();
        }, 3000); // Poll every 3 seconds
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
  }, [tasksList, fetchAllTasks]);

  return {
    // State
    notification,
    error,
    tasksList,
    currentRunningTaskId,
    isAnyTaskRunning,

    // Functions
    showNotification,
    hideNotification,
    fetchAllTasks,
    handleTaskAction,
    estimateRemainingTime,
    removeTask,
    setError,

    // Setters
    setCurrentRunningTaskId,

    // Sound functions
    playSuccessSound,
    playErrorSound
  };
};
