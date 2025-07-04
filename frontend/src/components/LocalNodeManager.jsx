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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [showNewCluster, setShowNewCluster] = useState(false);
  
  // Validation state
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationSuggestions, setValidationSuggestions] = useState({});
  const [isValidating, setIsValidating] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  
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

  // Real-time validation when ports change (debounced)
  useEffect(() => {
    // Clear existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    if (mode === 'create' && newNodeName && newNodePort && newNodeTransportPort) {
      validationTimeoutRef.current = setTimeout(async () => {
        const nodeConfig = {
          name: newNodeName,
          host: newNodeHost,
          port: parseInt(newNodePort),
          transportPort: parseInt(newNodeTransportPort),
          cluster: newNodeCluster,
        };
        
        // Only validate if ports are valid numbers
        if (!isNaN(nodeConfig.port) && !isNaN(nodeConfig.transportPort)) {
          await validateNodeConfiguration(nodeConfig);
        }
      }, 1000); // 1 second debounce
    }

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [newNodeName, newNodeHost, newNodePort, newNodeTransportPort, newNodeCluster, mode]);

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
      setValidationErrors([]);
      setValidationSuggestions({});
      setShowValidationErrors(false);
      setIsValidating(false);
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

  const generateDefaultPaths = () => {
    if (newNodeName) {
      setNewNodeDataPath(`C:\\elasticsearch\\${newNodeName}\\data`);
      setNewNodeLogsPath(`C:\\elasticsearch\\${newNodeName}\\logs`);
    }
  };

  // Validation function
  const validateNodeConfiguration = async (nodeConfig) => {
    // Create a unique key for this configuration
    const configKey = JSON.stringify({
      name: nodeConfig.name,
      host: nodeConfig.host,
      port: nodeConfig.port,
      transportPort: nodeConfig.transportPort,
      cluster: nodeConfig.cluster
    });
    
    // Skip if we're already validating the same configuration
    if (isValidating || lastValidationConfigRef.current === configKey) {
      return false;
    }
    
    lastValidationConfigRef.current = configKey;
    setIsValidating(true);
    setValidationErrors([]);
    setValidationSuggestions({});
    
    try {
      const response = await axiosClient.post('/api/admin/cluster-advanced/nodes/validate', nodeConfig);
      
      if (!response.data.valid) {
        setValidationErrors(response.data.conflicts || []);
        setValidationSuggestions(response.data.suggestions || {});
        setShowValidationErrors(true);
        return false;
      }
      
      setShowValidationErrors(false);
      return true;
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
  const applySuggestions = () => {
    if (validationSuggestions.httpPort) {
      setNewNodePort(validationSuggestions.httpPort.toString());
    }
    if (validationSuggestions.transportPort) {
      setNewNodeTransportPort(validationSuggestions.transportPort.toString());
    }
    if (validationSuggestions.nodeName && validationSuggestions.nodeName.length > 0) {
      setNewNodeName(validationSuggestions.nodeName[0]); // Use first suggestion
    }
    
    // Reset validation state to allow fresh validation
    lastValidationConfigRef.current = null;
    setShowValidationErrors(false);
  };

  // Apply specific node name suggestion
  const applyNodeNameSuggestion = (suggestedName) => {
    setNewNodeName(suggestedName);
    
    // Reset validation state to allow fresh validation
    lastValidationConfigRef.current = null;
    setShowValidationErrors(false);
  };

  // Auto-suggest ports when cluster is selected
  const handleClusterChange = async (clusterName) => {
    setNewNodeCluster(clusterName);
    
    // Clear any pending validation timeout to avoid conflicts
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    // If creating a new node and cluster name matches existing nodes, suggest available ports
    if (mode === 'create' && newNodeName) {
      try {
        const tempConfig = {
          name: newNodeName,
          host: newNodeHost,
          port: parseInt(newNodePort) || 9200,
          transportPort: parseInt(newNodeTransportPort) || 9300,
          cluster: clusterName,
        };
        
        const response = await axiosClient.post('/api/admin/cluster-advanced/nodes/validate', tempConfig);
        
        if (!response.data.valid && response.data.suggestions) {
          // Auto-apply suggestions for port conflicts
          const hasPortConflicts = response.data.conflicts.some(c => 
            c.type === 'http_port' || c.type === 'transport_port'
          );
          
          if (hasPortConflicts) {
            if (response.data.suggestions.httpPort) {
              setNewNodePort(response.data.suggestions.httpPort.toString());
            }
            if (response.data.suggestions.transportPort) {
              setNewNodeTransportPort(response.data.suggestions.transportPort.toString());
            }
          }
          
          // Auto-apply node name suggestion if there's a name conflict
          const hasNameConflict = response.data.conflicts.some(c => c.type === 'node_name');
          if (hasNameConflict && response.data.suggestions.nodeName && response.data.suggestions.nodeName.length > 0) {
            setNewNodeName(response.data.suggestions.nodeName[0]);
          }
        }
      } catch (error) {
        console.log('Auto-suggestion failed:', error);
      }
    }
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
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="e.g., node-1, data-node-01"
                className={`w-full p-3 border rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 ${
                  validationErrors.some(e => e.type === 'node_name') 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-neutral-700 focus:ring-blue-500'
                }`}
                onBlur={generateDefaultPaths}
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
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
              Advanced Configuration
              <span className="ml-2 text-neutral-500">{showAdvanced ? '▼' : '▶'}</span>
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <FontAwesomeIcon icon={faFolder} className="mr-2" />
                      Data Path
                    </label>
                    <input
                      type="text"
                      value={newNodeDataPath}
                      onChange={(e) => setNewNodeDataPath(e.target.value)}
                      placeholder="C:\elasticsearch\node-name\data"
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-neutral-400 text-xs mt-1">Where node data will be stored</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      <FontAwesomeIcon icon={faFolder} className="mr-2" />
                      Logs Path
                    </label>
                    <input
                      type="text"
                      value={newNodeLogsPath}
                      onChange={(e) => setNewNodeLogsPath(e.target.value)}
                      placeholder="C:\elasticsearch\node-name\logs"
                      className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-neutral-400 text-xs mt-1">Where node logs will be stored</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-4">
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

        {/* Validation Errors */}
        {showValidationErrors && validationErrors.length > 0 && (
          <div className="mx-6 mb-4 p-4 bg-red-600 rounded-lg border border-red-500">
            <div className="flex items-start space-x-3">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-100 text-xl mt-1" />
              <div className="flex-1">
                <h4 className="text-red-100 font-semibold mb-2">Configuration Conflicts Detected</h4>
                <div className="space-y-2">
                  {validationErrors.map((error, index) => (
                    <div key={index} className="text-red-200 text-sm">
                      • {error.message}
                    </div>
                  ))}
                </div>
                
                {/* Suggestions */}
                {(validationSuggestions.httpPort || validationSuggestions.transportPort || validationSuggestions.nodeName) && (
                  <div className="mt-4 space-y-3">
                    {/* Port Suggestions */}
                    {(validationSuggestions.httpPort || validationSuggestions.transportPort) && (
                      <div className="p-3 bg-red-700 rounded border border-red-600">
                        <h5 className="text-red-100 font-medium mb-2">Suggested Available Ports:</h5>
                        <div className="space-y-1 text-red-200 text-sm">
                          {validationSuggestions.httpPort && (
                            <div>• HTTP Port: {validationSuggestions.httpPort}</div>
                          )}
                          {validationSuggestions.transportPort && (
                            <div>• Transport Port: {validationSuggestions.transportPort}</div>
                          )}
                        </div>
                        <button
                          onClick={applySuggestions}
                          className="mt-3 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm transition duration-150"
                        >
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                          Apply Port Suggestions
                        </button>
                      </div>
                    )}
                    
                    {/* Node Name Suggestions */}
                    {validationSuggestions.nodeName && validationSuggestions.nodeName.length > 0 && (
                      <div className="p-3 bg-red-700 rounded border border-red-600">
                        <h5 className="text-red-100 font-medium mb-2">Suggested Available Node Names:</h5>
                        <div className="space-y-2">
                          {validationSuggestions.nodeName.map((suggestedName, index) => (
                            <div key={index} className="flex items-center justify-between bg-red-800 p-2 rounded">
                              <span className="text-red-200 text-sm font-mono">{suggestedName}</span>
                              <button
                                onClick={() => applyNodeNameSuggestion(suggestedName)}
                                className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs transition duration-150"
                              >
                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />
                                Use This
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => applyNodeNameSuggestion(validationSuggestions.nodeName[0])}
                          className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition duration-150"
                        >
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                          Use First Suggestion
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowValidationErrors(false)}
                className="text-red-200 hover:text-white transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </div>
        )}

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
                // Validate configuration before creating
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
                
                const isValid = await validateNodeConfiguration(nodeConfig);
                if (isValid) {
                  await createLocalNode();
                  onClose();
                }
              } else {
                // For edit mode, call updateLocalNode
                await updateLocalNode(nodeToEdit.name, {
                  name: newNodeName,
                  host: newNodeHost,
                  port: parseInt(newNodePort),
                  transportPort: parseInt(newNodeTransportPort),
                  cluster: newNodeCluster,
                  dataPath: newNodeDataPath,
                  logsPath: newNodeLogsPath,
                  roles: newNodeRoles
                });
                onClose();
              }
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!newNodeName.trim() || isValidating}
          >
            <FontAwesomeIcon icon={isValidating ? faSpinner : faServer} className={`mr-2 ${isValidating ? 'fa-spin' : ''}`} />
            {isValidating ? 'Validating...' : (mode === 'create' ? 'Create Node' : 'Update Node')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalNodeManager;
