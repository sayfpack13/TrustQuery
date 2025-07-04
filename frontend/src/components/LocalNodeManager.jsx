import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faServer, 
  faPlus, 
  faTimes,
  faFolder,
  faDatabase,
  faNetworkWired,
  faInfoCircle,
  faCog,
  faExclamationTriangle,
  faCheckCircle,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../api/axiosClient';

const LocalNodeManager = ({ 
  isOpen, 
  onClose, 
  clusterManagement,
  mode = 'create', // 'create' or 'edit'
  nodeToEdit
}) => {
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [newClusterName, setNewClusterName] = useState('');
  const [showNewCluster, setShowNewCluster] = useState(false);
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationSuggestions, setValidationSuggestions] = useState({});
  const [isValidating, setIsValidating] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false);
  const [lastValidatedConfig, setLastValidatedConfig] = useState(null); // Track successful validation

  const updatePathsForNewName = (newName, oldName, currentDataPath, currentLogsPath, setDataPath, setLogsPath) => {
    const defaultDataPath = (name) => `C:\\elasticsearch\\${name}\\data`;
    const defaultLogsPath = (name) => `C:\\elasticsearch\\${name}\\logs`;

    if (oldName !== newName) {
        // Update data path if it's empty or was the default for the old name
        if (!currentDataPath || currentDataPath === defaultDataPath(oldName)) {
            setDataPath(defaultDataPath(newName));
        }
        // Update logs path if it's empty or was the default for the old name
        if (!currentLogsPath || currentLogsPath === defaultLogsPath(oldName)) {
            setLogsPath(defaultLogsPath(newName));
        }
    }
  };

  const handleNodeNameChange = (e) => {
      const newName = e.target.value;
      const oldName = newNodeName;
      setNewNodeName(newName);
      updatePathsForNewName(newName, oldName, newNodeDataPath, newNodeLogsPath, setNewNodeDataPath, setNewNodeLogsPath);
  };

  // Track validation to prevent duplicates
  const validationTimeoutRef = useRef(null);
  const lastValidationConfigRef = useRef(null);

  const {
    newNodeName,
    setNewNodeName,
    newNodeHost,
    setNewNodeHost,
    newNodePort,
    setNewNodePort,
    newNodeTransportPort,
    setNewNodeTransportPort,
    newNodeCluster,
    setNewNodeCluster,
    newNodeDataPath,
    setNewNodeDataPath,
    newNodeLogsPath,
    setNewNodeLogsPath,
    newNodeRoles,
    setNewNodeRoles,
    clusters,
    createLocalNode,
    createCluster,
    updateLocalNode
  } = clusterManagement;

  useEffect(() => {
    if (mode === 'edit' && nodeToEdit) {
      setNewNodeName(nodeToEdit.name || '');
      setNewNodeHost(nodeToEdit.host || 'localhost');
      setNewNodePort(nodeToEdit.port || '9200');
      setNewNodeTransportPort(nodeToEdit.transportPort || '9300');
      setNewNodeCluster(nodeToEdit.cluster || 'trustquery-cluster');
      setNewNodeDataPath(nodeToEdit.dataPath || `C:\\elasticsearch\\${nodeToEdit.name}\\data`);
      setNewNodeLogsPath(nodeToEdit.logsPath || `C:\\elasticsearch\\${nodeToEdit.name}\\logs`);
      // Assuming roles are part of the node object, otherwise they need to be fetched
      setNewNodeRoles(nodeToEdit.roles || {
        master: true,
        data: true,
        ingest: true,
      });
    } else if (mode === 'create') {
      // Reset form for create mode
      setNewNodeName('');
      setNewNodeHost('localhost');
      setNewNodePort('9200');
      setNewNodeTransportPort('9300');
      setNewNodeCluster('trustquery-cluster');
      setNewNodeDataPath('');
      setNewNodeLogsPath('');
      setNewNodeRoles({
        master: true,
        data: true,
        ingest: true,
      });
    }
  }, [nodeToEdit, mode, setNewNodeName, setNewNodeHost, setNewNodePort, setNewNodeTransportPort, setNewNodeCluster, setNewNodeDataPath, setNewNodeLogsPath, setNewNodeRoles]);

  // Remove auto-validation on input change - validation now only happens on button click

  // Cleanup validation timeout on unmount or close
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Reset validation state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      lastValidationConfigRef.current = null;
      setLastValidatedConfig(null);
      setValidationErrors([]);
      setValidationSuggestions({});
      setShowValidationErrors(false);
      setIsValidating(false);
      setIsApplyingSuggestions(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = (role) => {
    setNewNodeRoles(prev => ({
      ...prev,
      [role]: !prev[role]
    }));
  };

  const handleCreateCluster = async () => {
    if (newClusterName.trim()) {
      await createCluster(newClusterName);
      setNewNodeCluster(newClusterName);
      setNewClusterName('');
      setShowNewCluster(false);
    }
  };

  // Validation function
  const validateNodeConfiguration = async (nodeConfig) => {
    // When editing, we need to pass the original node name to the validation function
    const requestBody = mode === 'edit' 
      ? { nodeConfig: nodeConfig, originalName: nodeToEdit?.name } 
      : { nodeConfig: nodeConfig };

    // Create a unique key for this configuration
    const configKey = JSON.stringify({
      name: nodeConfig.name,
      host: nodeConfig.host,
      port: nodeConfig.port,
      transportPort: nodeConfig.transportPort,
      cluster: nodeConfig.cluster,
      dataPath: nodeConfig.dataPath,
      logsPath: nodeConfig.logsPath,
      mode: mode // Include mode in cache key
    });
    
    // Skip if we're already validating
    if (isValidating) {
      return false;
    }
    
    // Check if this exact config was already successfully validated
    if (lastValidatedConfig === configKey) {
      return true; // Already validated and passed
    }
    
    lastValidationConfigRef.current = configKey;
    setIsValidating(true);
    setValidationErrors([]);
    setValidationSuggestions({});
    
    try {
      const response = await axiosClient.post('/api/admin/cluster-advanced/nodes/validate', requestBody);
      
      if (!response.data.valid) {
        setValidationErrors(response.data.conflicts || []);
        setValidationSuggestions(response.data.suggestions || {});
        setShowValidationErrors(true);
        return false;
      } else {
        // Validation passed - clear any previous errors
        setValidationErrors([]);
        setValidationSuggestions({});
        setShowValidationErrors(false);
        setLastValidatedConfig(configKey); // Remember this config was validated successfully
        return true;
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationErrors([{
        type: 'general',
        message: 'Failed to validate configuration: ' + (error.response?.data?.error || error.message)
      }]);
      setShowValidationErrors(true);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Auto-suggest available ports
  const applySuggestions = async () => {
    setIsApplyingSuggestions(true);
    
    // Clear any pending validation first
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    console.log('Applying suggestions:', validationSuggestions);

    if (validationSuggestions.httpPort) {
      setNewNodePort(validationSuggestions.httpPort.toString());
    }
    if (validationSuggestions.transportPort) {
      setNewNodeTransportPort(validationSuggestions.transportPort.toString());
    }
    if (validationSuggestions.nodeName && validationSuggestions.nodeName.length > 0) {
      const suggestedName = validationSuggestions.nodeName[0];
      const oldName = newNodeName;
      setNewNodeName(suggestedName);
      // Update paths with the new node name
      updatePathsForNewName(suggestedName, oldName, newNodeDataPath, newNodeLogsPath, setNewNodeDataPath, setNewNodeLogsPath);
    }
    
    // Clear validation state completely after applying suggestions
    lastValidationConfigRef.current = null;
    setLastValidatedConfig(null); // Reset successful validation tracking
    setValidationErrors([]);
    setValidationSuggestions({});
    setShowValidationErrors(false);
    
    console.log('Suggestions applied, validation state cleared');
    
    // Give a longer delay to prevent immediate re-validation
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsApplyingSuggestions(false);
  };

  // Apply specific node name suggestion
  const applyNodeNameSuggestion = async (suggestedName) => {
    // Clear any pending validation first
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    const oldName = newNodeName;
    setNewNodeName(suggestedName);
    // Update paths with the new node name
    updatePathsForNewName(suggestedName, oldName, newNodeDataPath, newNodeLogsPath, setNewNodeDataPath, setNewNodeLogsPath);
    
    // Clear validation state completely after applying suggestion
    lastValidationConfigRef.current = null;
    setLastValidatedConfig(null); // Reset successful validation tracking
    setValidationErrors([]);
    setValidationSuggestions({});
    setShowValidationErrors(false);
    
    // Give a longer delay to prevent immediate re-validation
    await new Promise(resolve => setTimeout(resolve, 500));
  };

  // Auto-suggest ports when cluster is selected
  const handleClusterChange = async (clusterName) => {
    setNewNodeCluster(clusterName);
    
    // Clear any pending validation timeout to avoid conflicts
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    // No auto-validation here - only manual validation on button click
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4">
      <div className="bg-neutral-800 rounded-xl shadow-2xl w-full max-w-4xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-neutral-700">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <FontAwesomeIcon icon={faServer} className="mr-3 text-blue-400" />
            {mode === 'create' ? 'Create New Local Node' : 'Edit Local Node'}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors text-2xl"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Node Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                <FontAwesomeIcon icon={faServer} className="mr-2" />
                Node Name *
                {validationErrors.some(e => e.type === 'node_name') && (
                  <span className="ml-2 text-red-400 text-xs">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                    Name already exists
                  </span>
                )}
              </label>
              <input
                type="text"
                value={newNodeName}
                onChange={handleNodeNameChange}
                placeholder="e.g., node-1, data-node-01"
                className={`w-full p-3 border rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 ${
                  validationErrors.some(e => e.type === 'node_name') 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-neutral-700 focus:ring-blue-500'
                }`}
              />
              <p className="text-neutral-400 text-xs mt-1">Unique identifier for this node</p>
            </div>

            {/* Cluster Assignment */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                <FontAwesomeIcon icon={faDatabase} className="mr-2" />
                Cluster
              </label>
              <div className="flex space-x-2">
                <select
                  value={newNodeCluster}
                  onChange={(e) => handleClusterChange(e.target.value)}
                  className="flex-1 p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(clusters || []).map(cluster => (
                    <option key={cluster} value={cluster}>{cluster}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCluster(!showNewCluster)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-md transition duration-150"
                  title="Create new cluster"
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
              </div>
              {showNewCluster && (
                <div className="mt-2 flex space-x-2">
                  <input
                    type="text"
                    value={newClusterName}
                    onChange={(e) => setNewClusterName(e.target.value)}
                    placeholder="New cluster name"
                    className="flex-1 p-2 border border-neutral-700 rounded-md bg-neutral-900 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleCreateCluster}
                    className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-md text-sm transition duration-150"
                  >
                    Create
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Network Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                <FontAwesomeIcon icon={faNetworkWired} className="mr-2" />
                Host
              </label>
              <input
                type="text"
                value={newNodeHost}
                onChange={(e) => setNewNodeHost(e.target.value)}
                placeholder="localhost"
                className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                HTTP Port
                {validationErrors.some(e => e.type === 'http_port') && (
                  <span className="ml-2 text-red-400 text-xs">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                    Port conflict
                  </span>
                )}
              </label>
              <input
                type="number"
                value={newNodePort}
                onChange={(e) => setNewNodePort(e.target.value)}
                placeholder="9200"
                className={`w-full p-3 border rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 ${
                  validationErrors.some(e => e.type === 'http_port') 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-neutral-700 focus:ring-blue-500'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Transport Port
                {validationErrors.some(e => e.type === 'transport_port') && (
                  <span className="ml-2 text-red-400 text-xs">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                    Port conflict
                  </span>
                )}
              </label>
              <input
                type="number"
                value={newNodeTransportPort}
                onChange={(e) => setNewNodeTransportPort(e.target.value)}
                placeholder="9300"
                className={`w-full p-3 border rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 ${
                  validationErrors.some(e => e.type === 'transport_port') 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-neutral-700 focus:ring-blue-500'
                }`}
              />
            </div>
          </div>

          {/* Node Roles */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-3">
              <FontAwesomeIcon icon={faCog} className="mr-2" />
              Node Roles
            </label>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(newNodeRoles).map(([role, enabled]) => (
                <label key={role} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => handleRoleChange(role)}
                    className="form-checkbox text-blue-600 bg-neutral-900 border-neutral-700 rounded focus:ring-blue-500"
                  />
                  <span className="text-neutral-300 capitalize">{role}</span>
                </label>
              ))}
            </div>
            <p className="text-neutral-400 text-xs mt-2">
              Master: Can be elected as cluster master • Data: Stores and searches data • Ingest: Processes documents before indexing
            </p>
          </div>

          {/* Advanced Configuration */}
          <div className="mt-4 space-y-4 p-4 bg-neutral-900 rounded-lg border border-neutral-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  <FontAwesomeIcon icon={faFolder} className="mr-2" />
                  Data Path
                  {validationErrors.some(e => e.type === 'data_path') && (
                    <span className="ml-2 text-red-400 text-xs">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                      Path conflict
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={newNodeDataPath}
                  onChange={(e) => setNewNodeDataPath(e.target.value)}
                  placeholder="C:\\elasticsearch\\node-name\\data"
                  className={`w-full p-3 border rounded-md bg-neutral-800 text-white focus:outline-none focus:ring-2 ${
                    validationErrors.some(e => e.type === 'data_path')
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-700 focus:ring-blue-500'
                  }`}
                />
                <p className="text-neutral-400 text-xs mt-1">Where node data will be stored</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  <FontAwesomeIcon icon={faFolder} className="mr-2" />
                  Logs Path
                  {validationErrors.some(e => e.type === 'logs_path') && (
                    <span className="ml-2 text-red-400 text-xs">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1" />
                      Path conflict
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={newNodeLogsPath}
                  onChange={(e) => setNewNodeLogsPath(e.target.value)}
                  placeholder="C:\\elasticsearch\\node-name\\logs"
                  className={`w-full p-3 border rounded-md bg-neutral-800 text-white focus:outline-none focus:ring-2 ${
                    validationErrors.some(e => e.type === 'logs_path')
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-700 focus:ring-blue-500'
                  }`}
                />
                <p className="text-neutral-400 text-xs mt-1">Where node logs will be stored</p>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="p-4 bg-neutral-900 rounded-lg border border-dashed border-neutral-700">
            <div className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faInfoCircle} className="text-blue-400 mt-1" />
              <div>
                <h4 className="text-blue-200 font-medium mb-2">Local Node Management</h4>
                <p className="text-blue-200 text-sm">
                  This creates a fully configured Elasticsearch node that can run independently. 
                  Each node has its own configuration file, data directory, and startup script.
                  Nodes can be started, stopped, and managed individually without affecting others.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Running Node Warning - Show only in edit mode when node is running */}
        {mode === 'edit' && nodeToEdit?.isRunning && (
          <div className="mt-6 p-4 bg-amber-900 rounded-lg border border-amber-700">
            <h3 className="text-lg font-semibold text-amber-100 mb-2 flex items-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
              Node is Currently Running
            </h3>
            <p className="text-amber-200 text-sm mb-3">
              Configuration changes are disabled while the node is running. Stop the node first to make changes, or the changes will require a restart to take effect.
            </p>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-amber-200 text-sm font-medium">Status: Running on port {nodeToEdit.port}</span>
            </div>
          </div>
        )}

        {/* Validation Section - Show validation errors and suggestions for both create and edit modes */}
        {showValidationErrors && validationErrors.length > 0 && (
          <div className="mt-6 p-4 bg-red-900 rounded-lg border border-red-700">
            <h3 className="text-lg font-semibold text-red-100 mb-3 flex items-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
              Configuration Conflicts Detected
            </h3>
            <div className="space-y-2 mb-4">
              {validationErrors.map((error, index) => (
                <div key={index} className="text-red-200 text-sm flex items-start">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 mt-1 text-red-400 flex-shrink-0" />
                  <span>{error.message}</span>
                </div>
              ))}
            </div>
            
            {/* Auto-fix suggestions */}
            {Object.keys(validationSuggestions).length > 0 && (
              <div className="border-t border-red-700 pt-4">
                <h4 className="text-red-100 font-medium mb-3">Suggested Solutions:</h4>
                <div className="space-y-3">
                  {(validationSuggestions.httpPort || validationSuggestions.transportPort) && (
                    <div className="bg-red-800 p-3 rounded">
                      <p className="text-red-100 text-sm mb-2">Auto-fix port conflicts:</p>
                      <div className="flex items-center space-x-2">
                        {validationSuggestions.httpPort && (
                          <span className="text-red-200 text-xs">HTTP: {validationSuggestions.httpPort}</span>
                        )}
                        {validationSuggestions.transportPort && (
                          <span className="text-red-200 text-xs">Transport: {validationSuggestions.transportPort}</span>
                        )}
                        <button
                          onClick={applySuggestions}
                          disabled={isApplyingSuggestions}
                          className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs transition duration-150 disabled:opacity-50"
                        >
                          {isApplyingSuggestions ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Apply'}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {validationSuggestions.nodeName && validationSuggestions.nodeName.length > 0 && (
                    <div className="bg-red-800 p-3 rounded">
                      <p className="text-red-100 text-sm mb-2">Suggested node names:</p>
                      <div className="flex flex-wrap gap-2">
                        {validationSuggestions.nodeName.map((name, idx) => (
                          <button
                            key={idx}
                            onClick={() => applyNodeNameSuggestion(name)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition duration-150"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validation Button - Show for both create and edit modes */}
        <div className="mt-6 p-4 bg-neutral-700 rounded-lg border border-neutral-600">
          <h3 className="text-lg font-semibold text-white mb-3">
            <FontAwesomeIcon icon={faCheckCircle} className="mr-2 text-green-400" />
            Configuration Validation
          </h3>
          <p className="text-neutral-300 text-sm mb-4">
            {mode === 'create' 
              ? 'Validate your node configuration before creation to check for conflicts with existing nodes.'
              : 'Validate your changes before updating to check for conflicts with other nodes.'
            }
          </p>
          <button
            onClick={async () => {
              const nodeConfig = {
                name: newNodeName,
                host: newNodeHost,
                port: parseInt(newNodePort),
                transportPort: parseInt(newNodeTransportPort),
                cluster: newNodeCluster,
                dataPath: newNodeDataPath,
                logsPath: newNodeLogsPath,
                roles: newNodeRoles
              };
              await validateNodeConfiguration(nodeConfig);
            }}
            disabled={!newNodeName.trim() || isValidating || isApplyingSuggestions}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={isValidating ? faSpinner : faCheckCircle} className={`mr-2 ${isValidating ? 'fa-spin' : ''}`} />
            {isValidating ? 'Validating...' : `Validate ${mode === 'create' ? 'Configuration' : 'Changes'}`}
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg transition duration-150"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (mode === 'create') {
                const nodeConfig = {
                  name: newNodeName,
                  host: newNodeHost,
                  port: parseInt(newNodePort),
                  transportPort: parseInt(newNodeTransportPort),
                  cluster: newNodeCluster,
                  dataPath: newNodeDataPath,
                  logsPath: newNodeLogsPath,
                  roles: newNodeRoles
                };
                
                console.log('Creating node with config:', nodeConfig);
                
                // Always validate before creating (single source of truth)
                const isValid = await validateNodeConfiguration(nodeConfig);
                console.log('Validation result:', isValid);
                
                if (!isValid) {
                  console.log('Validation failed, stopping node creation');
                  return; // Stop if validation fails
                }
                
                console.log('Validation passed, proceeding with node creation');
                
                try {
                  await createLocalNode(nodeConfig);
                  console.log('Node created successfully');
                  onClose();
                } catch (error) {
                  console.error('Failed to create node:', error);
                  // Error will be handled by createLocalNode
                }
              } else {
                // For edit mode, validate first then call updateLocalNode
                const nodeConfig = {
                  name: newNodeName,
                  host: newNodeHost,
                  port: parseInt(newNodePort),
                  transportPort: parseInt(newNodeTransportPort),
                  cluster: newNodeCluster,
                  dataPath: newNodeDataPath,
                  logsPath: newNodeLogsPath,
                  roles: newNodeRoles
                };
                
                console.log('Updating node with config:', nodeConfig);
                
                // Always validate before updating (single source of truth)
                const isValid = await validateNodeConfiguration(nodeConfig);
                console.log('Edit validation result:', isValid);
                
                if (!isValid) {
                  console.log('Edit validation failed, stopping node update');
                  return; // Stop if validation fails
                }
                
                console.log('Edit validation passed, proceeding with node update');
                
                try {
                  await updateLocalNode(nodeToEdit.name, nodeConfig);
                  console.log('Node updated successfully');
                  onClose();
                } catch (error) {
                  console.error('Failed to update node:', error);
                  
                  // Handle validation conflicts from backend
                  if (error.validationData) {
                    console.log('Backend validation failed during update:', error.validationData);
                    setValidationErrors(error.validationData.conflicts || []);
                    setValidationSuggestions(error.validationData.suggestions || {});
                    setShowValidationErrors(true);
                    return; // Don't close the modal, show validation errors
                  }
                  
                  // For other errors, let the hook handle the notification
                }
              }
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              !newNodeName.trim() || 
              isValidating || 
              isApplyingSuggestions || 
              (mode === 'edit' && nodeToEdit?.isRunning)
            }
          >
            <FontAwesomeIcon icon={isValidating ? faSpinner : faServer} className={`mr-2 ${isValidating ? 'fa-spin' : ''}`} />
            {isValidating ? 'Validating...' : isApplyingSuggestions ? 'Applying Changes...' : (mode === 'create' ? 'Create Node' : 'Update Node')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalNodeManager;
