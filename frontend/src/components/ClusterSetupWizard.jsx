import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faServer, 
  faPlay, 
  faStop, 
  faTrash, 
  faCog, 
  faInfoCircle, 
  faCheckCircle, 
  faExclamationTriangle,
  faPlus,
  faMinus,
  faDatabase,
  faFolder,
  faCircleNotch,
  faDownload,
  faTerminal,
  faClipboard,
  faLightbulb,
  faArrowRight,
  faArrowLeft
} from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../api/axiosClient';

const ClusterSetupWizard = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [setupType, setSetupType] = useState('development'); // 'development' or 'production'
  const [clusterConfig, setClusterConfig] = useState({
    clusterName: 'trustquery-cluster',
    nodes: [
      {
        name: 'node-1',
        host: 'localhost',
        port: 9200,
        transportPort: 9300,
        dataPath: 'C:\\elasticsearch\\node-1\\data',
        logsPath: 'C:\\elasticsearch\\node-1\\logs',
        roles: { master: true, data: true, ingest: true }
      }
    ]
  });
  const [loading, setLoading] = useState(false);
  const [activeNodes, setActiveNodes] = useState([]);
  const [connectionTests, setConnectionTests] = useState({});
  const [localNodes, setLocalNodes] = useState([]);
  const [setupGuide, setSetupGuide] = useState(null);

  const checkActiveNodes = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster');
      // Extract nodes from the cluster response
      const nodes = response.data.nodes || [];
      setActiveNodes(nodes);
    } catch (error) {
      console.error('Error checking active nodes:', error);
      setActiveNodes([]);
    }
  };

  const testNodeConnection = async (nodeUrl) => {
    setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'testing' }));
    try {
      const response = await fetch(`${nodeUrl}/_cluster/health`);
      if (response.ok) {
        setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'success' }));
        return true;
      } else {
        setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'failed' }));
        return false;
      }
    } catch (error) {
      setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'failed' }));
      return false;
    }
  };

  const fetchLocalNodes = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes');
      setLocalNodes(response.data.nodes || []);
    } catch (error) {
      console.error('Error fetching local nodes:', error);
    }
  };

  const fetchSetupGuide = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/setup-guide');
      setSetupGuide(response.data);
    } catch (error) {
      console.error('Error fetching setup guide:', error);
      // Set a default setup guide if the API is not available
      setSetupGuide({
        steps: [
          {
            step: 1,
            title: "Download Elasticsearch",
            description: "Download Elasticsearch from the official website",
            commands: [
              "Visit https://www.elastic.co/downloads/elasticsearch",
              "Download the Windows ZIP file",
              "Extract to C:\\elasticsearch"
            ]
          },
          {
            step: 2,
            title: "Configure Elasticsearch",
            description: "Edit the elasticsearch.yml configuration file",
            commands: [
              "Edit C:\\elasticsearch\\config\\elasticsearch.yml",
              "Set cluster.name: trustquery-cluster",
              "Set node.name: node-1"
            ]
          },
          {
            step: 3,
            title: "Start Elasticsearch",
            description: "Run Elasticsearch from the command line",
            commands: [
              "Open PowerShell as Administrator",
              "cd C:\\elasticsearch",
              "bin\\elasticsearch.bat"
            ]
          }
        ]
      });
    }
  };

  useEffect(() => {
    checkActiveNodes();
    fetchLocalNodes();
    fetchSetupGuide();
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const addNode = () => {
    const newNodeIndex = clusterConfig.nodes.length + 1;
    const newNode = {
      name: `node-${newNodeIndex}`,
      host: 'localhost',
      port: 9200 + newNodeIndex - 1,
      transportPort: 9300 + newNodeIndex - 1,
      dataPath: `C:\\elasticsearch\\node-${newNodeIndex}\\data`,
      logsPath: `C:\\elasticsearch\\node-${newNodeIndex}\\logs`,
      roles: { master: true, data: true, ingest: true }
    };
    setClusterConfig(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  const removeNode = (index) => {
    if (clusterConfig.nodes.length > 1) {
      setClusterConfig(prev => ({
        ...prev,
        nodes: prev.nodes.filter((_, i) => i !== index)
      }));
    }
  };

  const updateNode = (index, field, value) => {
    setClusterConfig(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, i) => 
        i === index ? { ...node, [field]: value } : node
      )
    }));
  };

  const updateNodeRole = (index, role, value) => {
    setClusterConfig(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, i) => 
        i === index ? { 
          ...node, 
          roles: { ...node.roles, [role]: value } 
        } : node
      )
    }));
  };

  const createCluster = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.post('/api/admin/cluster-advanced/create', clusterConfig);
      onComplete(response.data);
    } catch (error) {
      console.error('Error creating cluster:', error);
      alert('Failed to create cluster: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const startNode = async (nodeName) => {
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/start`);
      await fetchLocalNodes();
    } catch (error) {
      console.error('Error starting node:', error);
      alert('Failed to start node: ' + (error.response?.data?.error || error.message));
    }
  };

  const stopNode = async (nodeName) => {
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/stop`);
      await fetchLocalNodes();
    } catch (error) {
      console.error('Error stopping node:', error);
      alert('Failed to stop node: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteNode = async (nodeName) => {
    if (window.confirm(`Are you sure you want to delete node "${nodeName}"?`)) {
      try {
        await axiosClient.delete(`/api/admin/cluster-advanced/nodes/${nodeName}`);
        await fetchLocalNodes();
      } catch (error) {
        console.error('Error deleting node:', error);
        alert('Failed to delete node: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faInfoCircle} className="text-4xl text-blue-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Elasticsearch Cluster Setup</h3>
        <p className="text-neutral-400">
          This wizard will help you create and manage an Elasticsearch cluster on your system
        </p>
      </div>

      {setupGuide && (
        <div className="bg-neutral-700 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Prerequisites</h4>
          <div className="space-y-4">
            {setupGuide.steps.map((step, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-white">{step.title}</h5>
                  <p className="text-sm text-neutral-400 mb-2">{step.description}</p>
                  <div className="bg-neutral-800 rounded p-2">
                    {step.commands.map((cmd, idx) => (
                      <div key={idx} className="text-xs text-neutral-300 font-mono">
                        {cmd}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Next: Configure Cluster
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faDatabase} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Cluster Configuration</h3>
        <p className="text-neutral-400">
          Configure your cluster name and node settings
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Cluster Name
          </label>
          <input
            type="text"
            value={clusterConfig.clusterName}
            onChange={(e) => setClusterConfig(prev => ({...prev, clusterName: e.target.value}))}
            className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="trustquery-cluster"
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-white">Nodes Configuration</h4>
            <button
              onClick={addNode}
              className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1" />
              Add Node
            </button>
          </div>

          <div className="space-y-4">
            {clusterConfig.nodes.map((node, index) => (
              <div key={index} className="bg-neutral-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-medium text-white">Node {index + 1}</h5>
                  {clusterConfig.nodes.length > 1 && (
                    <button
                      onClick={() => removeNode(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Node Name
                    </label>
                    <input
                      type="text"
                      value={node.name}
                      onChange={(e) => updateNode(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      value={node.host}
                      onChange={(e) => updateNode(index, 'host', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      HTTP Port
                    </label>
                    <input
                      type="number"
                      value={node.port}
                      onChange={(e) => updateNode(index, 'port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Transport Port
                    </label>
                    <input
                      type="number"
                      value={node.transportPort}
                      onChange={(e) => updateNode(index, 'transportPort', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Data Path
                    </label>
                    <input
                      type="text"
                      value={node.dataPath}
                      onChange={(e) => updateNode(index, 'dataPath', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Logs Path
                    </label>
                    <input
                      type="text"
                      value={node.logsPath}
                      onChange={(e) => updateNode(index, 'logsPath', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Node Roles
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.master}
                        onChange={(e) => updateNodeRole(index, 'master', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Master</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.data}
                        onChange={(e) => updateNodeRole(index, 'data', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Data</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.ingest}
                        onChange={(e) => updateNodeRole(index, 'ingest', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Ingest</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Next: Review & Create
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Review & Create</h3>
        <p className="text-neutral-400">
          Review your cluster configuration and create the cluster
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Cluster Summary</h4>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-300">Cluster Name:</span>
            <span className="text-white font-medium">{clusterConfig.clusterName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Total Nodes:</span>
            <span className="text-white font-medium">{clusterConfig.nodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Master Nodes:</span>
            <span className="text-white font-medium">
              {clusterConfig.nodes.filter(n => n.roles.master).length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Data Nodes:</span>
            <span className="text-white font-medium">
              {clusterConfig.nodes.filter(n => n.roles.data).length}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Nodes Details</h4>
        <div className="space-y-3">
          {clusterConfig.nodes.map((node, index) => (
            <div key={index} className="bg-neutral-600 rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-medium">{node.name}</span>
                <span className="text-neutral-300">{node.host}:{node.port}</span>
              </div>
              <div className="text-sm text-neutral-400">
                <div>Data: {node.dataPath}</div>
                <div>Roles: {Object.entries(node.roles).filter(([, enabled]) => enabled).map(([role]) => role).join(', ')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={createCluster}
          disabled={loading}
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Creating Cluster...
            </>
          ) : (
            'Create Cluster'
          )}
        </button>
      </div>
    </div>
  );

  const renderLocalNodes = () => (
    <div className="mt-8">
      <h4 className="text-lg font-semibold text-white mb-4">Local Nodes Management</h4>
      {localNodes.length === 0 ? (
        <p className="text-neutral-400">No local nodes configured</p>
      ) : (
        <div className="space-y-3">
          {localNodes.map((node, index) => (
            <div key={index} className="bg-neutral-700 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h5 className="font-medium text-white">{node.name}</h5>
                <p className="text-sm text-neutral-400">
                  {node['network.host'] || 'localhost'}:{node['http.port'] || 'N/A'}
                </p>
                <p className="text-sm text-neutral-400">
                  Status: <span className={`font-medium ${node.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                    {node.status}
                  </span>
                </p>
              </div>
              <div className="flex space-x-2">
                {node.isRunning ? (
                  <button
                    onClick={() => stopNode(node.name)}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
                  >
                    <FontAwesomeIcon icon={faStop} className="mr-1" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => startNode(node.name)}
                    className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm"
                  >
                    <FontAwesomeIcon icon={faPlay} className="mr-1" />
                    Start
                  </button>
                )}
                <button
                  onClick={() => deleteNode(node.name)}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        // Close modal when clicking backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-neutral-800 rounded-xl shadow-2xl w-full max-w-5xl border border-neutral-700 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors z-10"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step <= currentStep ? 'bg-blue-600 text-white' : 'bg-neutral-600 text-neutral-400'
                  }`}>
                    {step}
                  </div>
                  {step < 3 && (
                    <div className={`w-16 h-1 mx-2 ${
                      step < currentStep ? 'bg-blue-600' : 'bg-neutral-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}

          {/* Local Nodes Management */}
          {renderLocalNodes()}
        </div>
      </div>
    </div>
  );
};

export default ClusterSetupWizard;
