import React, { useState, useEffect, useCallback } from "react";
import axiosClient from "../../../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faSave,
  faTimes,
  faInfoCircle,
  faSearch,
  faDatabase,
  faCogs,
  faCheckCircle,
  faServer,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { formatBytes } from "../../../utils/format";
import buttonStyles from '../../../components/ButtonStyles';

  
export default function ConfigurationManagement({ 
  showNotification,
  enhancedNodesData = {},
  setShowSetupWizard,
  disabled = false
}) {
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState([]);
  // Use enhancedNodesData prop instead of local state
  const indicesByNodes = enhancedNodesData;
  const [indicesCacheInfo, setIndicesCacheInfo] = useState({});
  
  // Simplified System Settings State
  const [tempSystemSettings, setTempSystemSettings] = useState({
    minVisibleChars: 2,
    maskingRatio: 0.2,
    usernameMaskingRatio: 0.4,
    batchSize: 1000
  });
  const [hasUnsavedSystemChanges, setHasUnsavedSystemChanges] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUpdatingIndices, setIsUpdatingIndices] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const response = await axiosClient.get("/api/admin/config");
      
      setConfig(response.data);
      
      // Set selected search indices
      setSelectedSearchIndices(response.data.searchIndices || []);        // Set system settings from the correct location
        const adminSettings = response.data.adminSettings || {};
        const systemSettings = response.data;
        setTempSystemSettings({
          minVisibleChars: systemSettings.minVisibleChars || 2,
          maskingRatio: systemSettings.maskingRatio || 0.2,
          usernameMaskingRatio: systemSettings.usernameMaskingRatio || 0.4,
          batchSize: systemSettings.batchSize || 1000,
          showRawLineByDefault: adminSettings.showRawLineByDefault || false
        });
      setHasUnsavedSystemChanges(false);
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to fetch configuration", faTimes);
    } finally {
      setConfigLoading(false);
    }
  }, []); // Empty dependency array to prevent re-creation

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Update indices data when enhancedNodesData prop changes
  useEffect(() => {
    // This effect ensures the component re-renders when node indices are updated
  }, [enhancedNodesData]);

  const handleSystemSettingChange = (key, value) => {
    setTempSystemSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasUnsavedSystemChanges(true);
  };

  const saveSystemSettings = async () => {
    if (isSavingSettings) return; // Prevent double save

    setIsSavingSettings(true);
    try {
      await axiosClient.post("/api/admin/config", {
        adminSettings: tempSystemSettings
      });
      
      setHasUnsavedSystemChanges(false);
      showNotification("success", "System settings saved successfully!", faCheckCircle);
      await fetchConfig(); // Refresh to get the latest config
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to save system settings", faTimes);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const resetSystemSettings = () => {
    if (config) {
      const adminSettings = config.adminSettings || {};        setTempSystemSettings({
          minVisibleChars: config.minVisibleChars || 2,
          maskingRatio: config.maskingRatio || 0.2,
          usernameMaskingRatio: config.usernameMaskingRatio || 0.4,
          batchSize: config.batchSize || 1000
        });
      setHasUnsavedSystemChanges(false);
    }
  };

  const updateSearchIndices = async () => {
    if (isUpdatingIndices) return; // Prevent double update

    setIsUpdatingIndices(true);
    try {
      await axiosClient.post("/api/admin/config/search-indices", {
        indices: selectedSearchIndices
      });
      
      const message = selectedSearchIndices.length === 0 
        ? "Search disabled - public search will return no results" 
        : "Search configuration updated successfully!";
      
      showNotification("success", message, faCheckCircle);
      await fetchConfig(); // Refresh configuration
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to update search configuration", faTimes);
    } finally {
      setIsUpdatingIndices(false);
    }
  };

  return (
    <section className="mb-12 p-6 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700">
      <h2 className="text-3xl font-semibold text-white mb-6 flex items-center">
        <FontAwesomeIcon icon={faCogs} className="mr-3 text-primary" />
        System Configuration
      </h2>
      
      {/* Setup Wizard Section */}
      <div className="mb-8 p-6 bg-blue-900/20 rounded-lg border border-blue-800/30">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center mb-2">
              <FontAwesomeIcon icon={faCogs} className="mr-3 text-blue-400" />
              Setup Wizard
            </h3>
            <p className="text-neutral-300">
              Need help setting up Elasticsearch on your machine? Use our guided setup wizard for Windows or Linux systems.
            </p>
          </div>
          <button
            onClick={() => setShowSetupWizard(true)}
            className={buttonStyles.primary}
          >
            <FontAwesomeIcon icon={faCogs} className="mr-2" />
            Launch Setup Wizard
          </button>
        </div>
      </div>
      
      {configLoading ? (
        <div className="text-center py-8">
          <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
          Loading configuration...
        </div>
      ) : config ? (
        <div className="space-y-8">
          {/* Search Indices Configuration */}
          <div className="p-6 bg-neutral-700 rounded-lg border border-neutral-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center">
                <FontAwesomeIcon icon={faSearch} className="mr-3 text-green-400" />
                Multi-Index Search Configuration
              </h3>
            </div>
            
            <p className="text-neutral-300 mb-4">
              Select which indices should be included in searches across all your Elasticsearch nodes. 
              Users will search across all selected indices simultaneously for comprehensive results.
            </p>
            
            {/* Cache info and summary */}
            {indicesCacheInfo.totalNodes && (
              <div className="mb-4 p-3 bg-neutral-800 rounded-lg border border-neutral-600">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-neutral-300">
                    <strong>{indicesCacheInfo.runningNodes}/{indicesCacheInfo.totalNodes}</strong> nodes running
                  </div>
                  <div className="text-sm text-neutral-300">
                    <strong>{Object.values(indicesByNodes).reduce((total, node) => 
                      total + (node.indices ? node.indices.length : 0), 0
                    )}</strong> total indices available
                  </div>
                </div>
              </div>
            )}
            
            {selectedSearchIndices.length > 0 ? (
              <div className="mb-4 p-3 bg-blue-600 bg-opacity-20 border border-blue-600 rounded-lg">
                <p className="text-blue-200 text-sm flex items-center">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                  Currently configured for search: <strong className="ml-1">{selectedSearchIndices.join(', ')}</strong>
                </p>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-amber-600 bg-opacity-20 border border-amber-600 rounded-lg">
                <p className="text-amber-200 text-sm flex items-center">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                  No search indices configured. Public search will return no results until indices are selected.
                </p>
              </div>
            )}
            
            {configLoading ? (
              <div className="text-center py-6 text-neutral-400">
                <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
                Loading indices data...
              </div>
            ) : Object.keys(indicesByNodes).length === 0 ? (
              <div className="bg-amber-600 bg-opacity-20 border border-amber-600 rounded-lg p-4">
                <p className="text-amber-200 text-sm flex items-center">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                  No nodes configured or nodes are not running. Configure nodes in the Cluster Management tab first.
                </p>
              </div>
            ) : (
              <>
                {/* Indices grouped by nodes */}
                <div className="space-y-6">
                  {Object.entries(indicesByNodes).map(([nodeName, nodeData]) => (
                    <div key={nodeName} className="border border-neutral-600 rounded-lg overflow-hidden">                        <div className="bg-neutral-800 px-4 py-3 border-b border-neutral-600">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <FontAwesomeIcon icon={faServer} className="text-primary" />
                              <h4 className="text-lg font-medium text-white">{nodeName}</h4>
                              <div className={`flex items-center space-x-2 px-2 py-1 rounded ${
                                nodeData.isRunning ? 'bg-green-600' : 'bg-red-600'
                              }`}>
                                <div className={`w-2 h-2 rounded-full ${
                                  nodeData.isRunning ? 'bg-green-200' : 'bg-red-200'
                                }`}></div>
                                <span className="text-white text-sm">
                                  {nodeData.isRunning ? 'Running' : 'Stopped'}
                                </span>
                              </div>
                              {nodeData.isRunning && nodeData.indices && (
                                <span className="text-sm text-neutral-400">
                                  {nodeData.indices.filter(idx => selectedSearchIndices.includes(idx.index)).length}/
                                  {nodeData.indices.length} selected for search
                                </span>
                              )}
                            </div>
                            <span className="text-sm text-neutral-400">{nodeData.nodeUrl}</span>
                          </div>
                          {nodeData.error && (
                            <div className="mt-2 text-red-400 text-sm">
                              <FontAwesomeIcon icon={faTimes} className="mr-1" />
                              {nodeData.error}
                            </div>
                          )}
                        </div>
                      
                      {nodeData.indices && nodeData.indices.length > 0 ? (
                        <div className="p-4">
                          {/* Node selection controls */}
                          <div className="flex items-center justify-between mb-3 pb-3 border-b border-neutral-600">
                            <span className="text-sm text-neutral-300">
                              {nodeData.indices.length} indices on this node
                              {!nodeData.isRunning && (
                                <span className="ml-2 text-amber-400">(from cache - node stopped)</span>
                              )}
                            </span>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  const nodeIndices = nodeData.indices.map(idx => idx.index);
                                  setSelectedSearchIndices(prev => {
                                    const withoutNodeIndices = prev.filter(idx => !nodeIndices.includes(idx));
                                    return [...withoutNodeIndices, ...nodeIndices];
                                  });
                                }}
                                className="text-xs px-3 py-1 rounded-lg font-semibold bg-gradient-to-r from-green-400 to-green-600 text-white shadow hover:from-green-500 hover:to-green-700 transition-all duration-200"
                              >
                                Select All
                              </button>
                              <button
                                onClick={() => {
                                  const nodeIndices = nodeData.indices.map(idx => idx.index);
                                  setSelectedSearchIndices(prev => prev.filter(idx => !nodeIndices.includes(idx)));
                                }}
                                className="text-xs px-3 py-1 rounded-lg font-semibold bg-gradient-to-r from-red-400 to-red-600 text-white shadow hover:from-red-500 hover:to-red-700 transition-all duration-200"
                              >
                                Deselect All
                              </button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {nodeData.indices.map((index) => (
                              <label
                                key={`${nodeName}-${index.index}`}
                                className="flex items-center p-3 bg-neutral-600 rounded-lg cursor-pointer hover:bg-neutral-500 transition-colors border border-neutral-500 hover:border-neutral-400"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSearchIndices.includes(index.index)}
                                  onChange={() => {
                                    setSelectedSearchIndices(prev => {
                                      if (prev.includes(index.index)) {
                                        return prev.filter(idx => idx !== index.index);
                                      } else {
                                        return [...prev, index.index];
                                      }
                                    });
                                  }}
                                  className="mr-3 w-4 h-4 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <FontAwesomeIcon icon={faDatabase} className="text-blue-400" />
                                      <span className="text-white font-medium">{index.index}</span>
                                    </div>
                                    <span className={`w-3 h-3 rounded-full ${
                                      index.health === 'green' ? 'bg-green-500' : 
                                      index.health === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                                    }`} title={`Health: ${index.health}`}></span>
                                  </div>
                                  <div className="text-sm text-neutral-400 mt-1 flex items-center justify-between">
                                    <span>{(index["doc.count"]|| 0
                                    ).toLocaleString()} documents</span>
                                    <span className="text-xs">{formatBytes(index['store.size'])}</span>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : !nodeData.isRunning ? (
                        <div className="p-4 text-center text-neutral-500">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-2xl mb-2 text-amber-500" />
                          <p>Node is not running</p>
                          <p className="text-xs mt-1 text-neutral-400">
                            Start the node to see available indices, or indices from cache will be shown if available
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-neutral-400">
                          <FontAwesomeIcon icon={faDatabase} className="text-2xl mb-2" />
                          <p>No indices found on this node</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-600">
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-neutral-400">
                      {selectedSearchIndices.length} indices selected for search across all nodes
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const allIndices = Object.values(indicesByNodes)
                            .filter(node => node.indices)
                            .flatMap(node => node.indices.map(idx => idx.index));
                          setSelectedSearchIndices(allIndices);
                        }}
                        className="text-xs px-3 py-1 rounded-lg font-semibold bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow hover:from-blue-500 hover:to-cyan-500 transition-all duration-200"
                        disabled={configLoading}
                      >
                        Select All Indices
                      </button>
                      <button
                        onClick={() => setSelectedSearchIndices([])}
                        className="text-xs px-3 py-1 rounded-lg font-semibold bg-gradient-to-r from-gray-400 to-gray-700 text-white shadow hover:from-gray-500 hover:to-gray-800 transition-all duration-200"
                        disabled={configLoading}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={updateSearchIndices}
                    disabled={isUpdatingIndices}
                    className="inline-flex items-center px-6 py-2 rounded-xl font-semibold shadow-lg bg-gradient-to-r from-green-400 to-green-600 text-white hover:from-green-500 hover:to-green-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                    {isUpdatingIndices ? 'Updating...' : selectedSearchIndices.length === 0 ? 'Disable Search (Clear All)' : 'Update Search Configuration'}
                    {isUpdatingIndices && <FontAwesomeIcon icon={faCircleNotch} spin className="ml-2 text-white" />}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* System Settings */}
          <div className="p-6 bg-neutral-700 rounded-lg border border-neutral-600">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center">
                <FontAwesomeIcon icon={faCogs} className="mr-3 text-blue-400" />
                System Settings
              </h3>
              {hasUnsavedSystemChanges && (
                <span className="text-yellow-400 text-sm font-medium flex items-center">
                  <FontAwesomeIcon icon={faInfoCircle} className="mr-1" />
                  Unsaved changes
                </span>
              )}
            </div>
            
            <div className="space-y-6">
              {/* Data Display Settings */}
              <div>
                <h4 className="text-lg font-medium text-white mb-4">Data Display & Masking</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      Number of characters to show when masking sensitive data
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      General Masking Ratio
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
                      Ratio of characters to mask (0.0 = none, 1.0 = all)
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
                      Special masking ratio for usernames and identifiers
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      Processing Batch Size
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
                      Number of records to process in each batch operation
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-4 mt-8 pt-6 border-t border-neutral-600">
              <button
                onClick={disabled ? undefined : saveSystemSettings}
                disabled={disabled || !hasUnsavedSystemChanges || isSavingSettings}
                className={buttonStyles.primary}
              >
                <FontAwesomeIcon icon={faSave} className="mr-2" />
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
                {isSavingSettings && <FontAwesomeIcon icon={faCircleNotch} spin className="ml-2 text-white" />}
              </button>
              <button
                onClick={disabled ? undefined : resetSystemSettings}
                disabled={disabled || !hasUnsavedSystemChanges}
                className={buttonStyles.cancel}
              >
                <FontAwesomeIcon icon={faTimes} className="mr-2" />
                Reset Changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-neutral-400 mb-4">Failed to load configuration</p>
          <button
            onClick={fetchConfig}
            className="inline-flex items-center px-4 py-2 rounded-xl font-semibold shadow-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-purple-600 hover:to-pink-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faCircleNotch} className="mr-2" />
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
