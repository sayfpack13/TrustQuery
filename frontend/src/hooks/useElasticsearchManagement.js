import { useState, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import { faExclamationTriangle, faCheckCircle, faInfoCircle, faCircleNotch, faHourglassStart } from '@fortawesome/free-solid-svg-icons';

export const useElasticsearchManagement = (showNotification, fetchAllTasks) => {
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
    } catch (err) {
      console.error("Failed to fetch ES data:", err);
      showNotification("error", "Failed to fetch Elasticsearch data", faExclamationTriangle);
    } finally {
      setEsLoading(false);
    }
  }, [showNotification]);

  const handleCreateIndex = async (indexName, shards, replicas) => {
    if (!indexName.trim()) {
      showNotification("error", "Index name is required", faExclamationTriangle);
      return;
    }

    const numShards = parseInt(shards) || 1;
    const numReplicas = parseInt(replicas) || 0;

    if (numShards < 1 || numShards > 1000) {
      showNotification("error", "Number of shards must be between 1 and 1000", faExclamationTriangle);
      return;
    }

    if (numReplicas < 0 || numReplicas > 100) {
      showNotification("error", "Number of replicas must be between 0 and 100", faExclamationTriangle);
      return;
    }

    try {
      setEsLoading(true);
      const response = await axiosClient.post("/api/admin/es/indices", {
        indexName,
        shards: numShards,
        replicas: numReplicas,
      });
      
      const { taskId } = response.data;
      showNotification("info", `Index creation for '${indexName}' started...`, faHourglassStart);

      // Poll for task completion
      await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const taskRes = await axiosClient.get(`/api/admin/tasks/${taskId}`);
            if (taskRes.data.completed) {
              clearInterval(interval);
              if (taskRes.data.status === 'success') {
                resolve();
              } else {
                reject(new Error(taskRes.data.error || 'Index creation failed.'));
              }
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 2000);
      });

      showNotification("success", `Index '${indexName}' created successfully.`, faCheckCircle);
    } catch (error) {
      showNotification("error", error.message || error.response?.data?.error || "Failed to start index creation", faExclamationTriangle);
      throw error; // Re-throw to be caught by the component
    } finally {
      setEsLoading(false);
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
      const response = await axiosClient.delete(`/api/indices/${indexName}`);

      if (response.data.taskId) {
        fetchAllTasks();
        closeESModal();
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
      fetchESData();
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
        fetchAllTasks();
        closeESModal();
        showNotification("info", `Reindexing started from "${reindexSource}" to "${reindexDest}"`, faInfoCircle, true);
      }
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to start reindexing", faExclamationTriangle);
    }
  };

  const fetchIndexDetails = async (indexName) => {
    if (!indexName) return null;
    try {
      const response = await axiosClient.get(`/api/indices/${indexName}/details`);
      return response.data;
    } catch (error) {
      console.error("Error fetching index details:", error);
      throw error;
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

  return {
    // State
    esIndices,
    selectedIndex,
    esHealth,
    showESModal,
    esModalType,
    esModalData,
    newIndexName,
    newIndexShards,
    newIndexReplicas,
    reindexSource,
    reindexDest,
    indexDetails,
    esLoading,
    
    // Setters
    setNewIndexName,
    setNewIndexShards,
    setNewIndexReplicas,
    setReindexSource,
    setReindexDest,
    
    // Functions
    fetchESData,
    handleCreateIndex,
    handleDeleteIndex,
    handleSelectIndex,
    handleReindex,
    fetchIndexDetails,
    openESModal,
    closeESModal,
  };
};
