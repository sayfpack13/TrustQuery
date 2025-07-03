import React, { useState, useEffect, useCallback } from "react";
import axiosClient from "../../../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faSave,
  faTimes,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";

export default function ConfigurationManagement({ 
  showNotification,
  esIndices,
  availableSearchIndices,
  setAvailableSearchIndices
}) {
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState([]);
  
  // Temporary System Settings State (for manual save)
  const [tempSystemSettings, setTempSystemSettings] = useState({
    minVisibleChars: 2,
    maskingRatio: 0.2,
    usernameMaskingRatio: 0.4,
    batchSize: 1000,
    showRawLineByDefault: false
  });
  const [hasUnsavedSystemChanges, setHasUnsavedSystemChanges] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const response = await axiosClient.get("/api/admin/config");
      setConfig(response.data);
      
      // Set selected search indices
      setSelectedSearchIndices(response.data.searchIndices || []);
      setAvailableSearchIndices(response.data.searchIndices || []);
      
      // Set system settings
      const settings = response.data.systemSettings || {};
      setTempSystemSettings({
        minVisibleChars: settings.minVisibleChars || 2,
        maskingRatio: settings.maskingRatio || 0.2,
        usernameMaskingRatio: settings.usernameMaskingRatio || 0.4,
        batchSize: settings.batchSize || 1000,
        showRawLineByDefault: settings.showRawLineByDefault || false
      });
      setHasUnsavedSystemChanges(false);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to fetch configuration");
    } finally {
      setConfigLoading(false);
    }
  }, [showNotification, setAvailableSearchIndices]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSystemSettingChange = (key, value) => {
    setTempSystemSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasUnsavedSystemChanges(true);
  };

  const saveSystemSettings = async () => {
    try {
      await axiosClient.post("/api/admin/config", {
        adminSettings: tempSystemSettings
      });
      
      setHasUnsavedSystemChanges(false);
      showNotification("success", "System settings saved successfully!");
      fetchConfig(); // Refresh to get the latest config
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to save system settings");
    }
  };

  const resetSystemSettings = () => {
    if (config?.systemSettings) {
      const settings = config.systemSettings;
      setTempSystemSettings({
        minVisibleChars: settings.minVisibleChars || 2,
        maskingRatio: settings.maskingRatio || 0.2,
        usernameMaskingRatio: settings.usernameMaskingRatio || 0.4,
        batchSize: settings.batchSize || 1000,
        showRawLineByDefault: settings.showRawLineByDefault || false
      });
      setHasUnsavedSystemChanges(false);
    }
  };

  const updateSearchIndices = async () => {
    try {
      await axiosClient.post("/api/admin/config/search-indices", {
        indices: selectedSearchIndices
      });
      
      setAvailableSearchIndices(selectedSearchIndices);
      showNotification("success", "Search indices updated successfully!");
      fetchConfig(); // Refresh to get the latest config
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to update search indices");
    }
  };

  return (
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
                  key={index.index || index.name}
                  className="flex items-center p-3 bg-neutral-600 rounded-lg cursor-pointer hover:bg-neutral-500 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSearchIndices.includes(index.index || index.name)}
                    onChange={() => {
                      const indexName = index.index || index.name;
                      setSelectedSearchIndices(prev => {
                        if (prev.includes(indexName)) {
                          return prev.filter(idx => idx !== indexName);
                        } else {
                          return [...prev, indexName];
                        }
                      });
                    }}
                    className="mr-3 w-4 h-4 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
                  />
                  <div className="flex-1">
                    <span className="text-white font-medium">{index.index || index.name}</span>
                    <div className="text-sm text-neutral-400">
                      {(index['docs.count'] || index.docCount || 0).toLocaleString()} documents
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
                  onChange={(e) => handleSystemSettingChange('minVisibleChars', parseInt(e.target.value) || 2)}
                  className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Number of characters to show when masking data
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Masking Ratio
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempSystemSettings.maskingRatio}
                  onChange={(e) => handleSystemSettingChange('maskingRatio', parseFloat(e.target.value) || 0.2)}
                  className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Ratio of characters to mask (0.0 - 1.0)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Username Masking Ratio
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempSystemSettings.usernameMaskingRatio}
                  onChange={(e) => handleSystemSettingChange('usernameMaskingRatio', parseFloat(e.target.value) || 0.4)}
                  className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Special masking ratio for usernames (0.0 - 1.0)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Batch Size
                </label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={tempSystemSettings.batchSize}
                  onChange={(e) => handleSystemSettingChange('batchSize', parseInt(e.target.value) || 1000)}
                  className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Number of records to process in each batch
                </p>
              </div>
            </div>
            
            {/* Admin UI Settings */}
            <div className="mb-6">
              <h4 className="text-lg font-medium text-white mb-3">Admin UI Settings</h4>
              <label className="flex items-center p-3 bg-neutral-600 rounded-lg cursor-pointer hover:bg-neutral-500 transition-colors">
                <input
                  type="checkbox"
                  checked={tempSystemSettings.showRawLineByDefault}
                  onChange={(e) => handleSystemSettingChange('showRawLineByDefault', e.target.checked)}
                  className="mr-3 w-4 h-4 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
                />
                <div>
                  <span className="text-white font-medium">Show Raw Line by Default</span>
                  <div className="text-sm text-neutral-400">
                    Display the raw data line by default in account management
                  </div>
                </div>
              </label>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={saveSystemSettings}
                disabled={!hasUnsavedSystemChanges}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faSave} className="mr-2" />
                Save Changes
              </button>
              
              <button
                onClick={resetSystemSettings}
                disabled={!hasUnsavedSystemChanges}
                className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg shadow-lg transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faTimes} className="mr-2" />
                Reset Changes
              </button>
            </div>
          </div>
          
          {/* Elasticsearch Configuration */}
          <div className="p-6 bg-neutral-700 rounded-lg">
            <h3 className="text-xl font-semibold text-white mb-4">
              Elasticsearch Configuration
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Elasticsearch Nodes
                </label>
                <div className="space-y-2">
                  {config.elasticsearchNodes?.map((node, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-neutral-600 rounded">
                      <span className="text-white text-sm">{node}</span>
                      {config.writeNode === node && (
                        <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                          WRITE
                        </span>
                      )}
                    </div>
                  )) || (
                    <p className="text-neutral-400 text-sm">No nodes configured</p>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Selected Index
                </label>
                <div className="p-3 bg-neutral-600 rounded-lg">
                  <span className="text-white font-medium">{config.selectedIndex}</span>
                  <div className="text-sm text-neutral-400 mt-1">
                    Current index for new data operations
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-600 bg-opacity-20 border border-blue-600 rounded-lg p-4">
              <p className="text-blue-200 text-sm">
                <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                Note: Elasticsearch node and cluster management is available in the "Cluster Management" tab.
              </p>
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
  );
}
