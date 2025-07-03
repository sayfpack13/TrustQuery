import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faServer, 
  faPlus, 
  faTimes,
  faFolder,
  faDatabase,
  faNetworkWired,
  faInfoCircle,
  faCog
} from '@fortawesome/free-solid-svg-icons';

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
    createCluster
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
    }
  }, [nodeToEdit, mode, setNewNodeName, setNewNodeHost, setNewNodePort, setNewNodeTransportPort, setNewNodeCluster, setNewNodeDataPath, setNewNodeLogsPath, setNewNodeRoles]);

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
              </label>
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="e.g., node-1, data-node-01"
                className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) => setNewNodeCluster(e.target.value)}
                  className="flex-1 p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {clusters.map(cluster => (
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
              </label>
              <input
                type="number"
                value={newNodePort}
                onChange={(e) => setNewNodePort(e.target.value)}
                placeholder="9200"
                className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Transport Port
              </label>
              <input
                type="number"
                value={newNodeTransportPort}
                onChange={(e) => setNewNodeTransportPort(e.target.value)}
                placeholder="9300"
                className="w-full p-3 border border-neutral-700 rounded-md bg-neutral-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              await createLocalNode();
              onClose();
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition duration-150"
            disabled={!newNodeName.trim()}
          >
            <FontAwesomeIcon icon={faServer} className="mr-2" />
            {mode === 'create' ? 'Create Node' : 'Update Node'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalNodeManager;
