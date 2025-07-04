import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faServer, faInfoCircle, faFileAlt, faDatabase, faCircleNotch, faHdd, faPlus, faTrash, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../../../api/axiosClient';
import { useElasticsearchManagement } from '../../../hooks/useElasticsearchManagement';

export default function NodeDetailsModal({ show, onClose, node }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [nodeIndices, setNodeIndices] = useState([]);
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [showCreateIndexForm, setShowCreateIndexForm] = useState(false);
  const [isCreatingIndex, setIsCreatingIndex] = useState(false);
  const [newIndexName, setNewIndexName] = useState('');
  const [newIndexShards, setNewIndexShards] = useState('1');
  const [newIndexReplicas, setNewIndexReplicas] = useState('0');
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState(null);

  const { deleteIndex, pollTask } = useElasticsearchManagement(console.log);

  const fetchNodeIndices = async () => {
    if (node) {
      setIndicesLoading(true);
      try {
        const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/indices`);
        setNodeIndices(response.data);
      } catch (error) {
        console.error("Failed to load node indices", error);
        setNodeIndices([]);
      } finally {
        setIndicesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'configuration' && node) {
      const fetchConfig = async () => {
        setConfigLoading(true);
        try {
          const response = await axiosClient.get(`/api/admin/cluster-advanced/${node.name}/config`);
          setConfigContent(response.data);
        } catch (error) {
          setConfigContent('Failed to load configuration.');
        } finally {
          setConfigLoading(false);
        }
      };
      fetchConfig();
    } else if (activeTab === 'indices' && node) {
      fetchNodeIndices();
    }
  }, [activeTab, node]);

  const handleCreateIndex = async () => {
    setIsCreatingIndex(true);
    try {
      await axiosClient.post(`/api/admin/cluster-advanced/${node.name}/indices`, {
        indexName: newIndexName,
        shards: newIndexShards,
        replicas: newIndexReplicas,
      });
      setShowCreateIndexForm(false);
      setNewIndexName('');
      setNewIndexShards('1');
      setNewIndexReplicas('0');
      fetchNodeIndices(); // Refresh the list
    } catch (error) {
      console.error("Failed to create index", error);
    } finally {
      setIsCreatingIndex(false);
    }
  };

  const handleDeleteClick = (index) => {
    setIndexToDelete(index);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (indexToDelete) {
      try {
        const response = await deleteIndex(indexToDelete.index);
      } catch (err) {
        console.error("Error deleting index", err);
      } finally {
        setShowDeleteModal(false);
        setIndexToDelete(null);
        fetchNodeIndices(); // Refresh list after deletion attempt
      }
    }
  };

  if (!show || !node) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-neutral-700 p-4 rounded-lg">
                <h4 className="text-lg font-semibold text-white mb-2">Node Status</h4>
                <p className={`text-lg font-bold ${node.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                  {node.isRunning ? 'Running' : 'Stopped'}
                </p>
              </div>
              <div className="bg-neutral-700 p-4 rounded-lg">
                <h4 className="text-lg font-semibold text-white mb-2">Cluster</h4>
                <p className="text-lg text-neutral-300">{node.cluster || 'trustquery-cluster'}</p>
              </div>
              <div className="bg-neutral-700 p-4 rounded-lg col-span-1 md:col-span-2">
                <h4 className="text-lg font-semibold text-white mb-2">Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(node.roles).filter(([, enabled]) => enabled).map(([role]) => (
                    <span key={role} className="bg-primary text-white px-3 py-1 text-sm rounded-full">{role}</span>
                  ))}
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-xl font-semibold text-white mb-4 flex items-center">
                <FontAwesomeIcon icon={faHdd} className="mr-2" />
                Disk Usage
              </h4>
              <p className="text-neutral-400">Disk usage information is not available in this view.</p>
            </div>
          </div>
        );
      case 'indices':
        if (indicesLoading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading indices...
            </div>
          );
        }
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Indices on {node.name}</h3>
              <button
                onClick={() => setShowCreateIndexForm(!showCreateIndexForm)}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Create Index
              </button>
            </div>
            
            {showCreateIndexForm && (
              <div className="bg-neutral-700 p-4 rounded-lg mb-4">
                <h4 className="text-lg font-semibold mb-2">New Index</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newIndexName}
                    onChange={(e) => setNewIndexName(e.target.value)}
                    placeholder="Enter index name"
                    className="w-full p-2 rounded-md bg-neutral-800 text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={newIndexShards}
                      onChange={(e) => setNewIndexShards(e.target.value)}
                      placeholder="Shards"
                      className="w-full p-2 rounded-md bg-neutral-800 text-white"
                    />
                    <input
                      type="number"
                      value={newIndexReplicas}
                      onChange={(e) => setNewIndexReplicas(e.target.value)}
                      placeholder="Replicas"
                      className="w-full p-2 rounded-md bg-neutral-800 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-2 space-x-2">
                  <button onClick={() => setShowCreateIndexForm(false)} className="bg-neutral-600 px-3 py-1 rounded">Cancel</button>
                  <button onClick={handleCreateIndex} className="bg-primary px-3 py-1 rounded w-24" disabled={isCreatingIndex}>
                    {isCreatingIndex ? <FontAwesomeIcon icon={faCircleNotch} spin /> : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
            
            <table className="w-full text-neutral-100 bg-neutral-600 rounded-lg">
              <thead className="bg-neutral-500">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Health</th>
                  <th className="text-left py-3 px-4 font-semibold">Index</th>
                  <th className="text-left py-3 px-4 font-semibold">Docs</th>
                  <th className="text-left py-3 px-4 font-semibold">Storage</th>
                  <th className="text-left py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nodeIndices.map(index => (
                  <tr key={index.uuid} className="border-b border-neutral-500">
                    <td className="py-3 px-4">
                      <span className={`inline-block w-3 h-3 rounded-full ${index.health === 'green' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                    </td>
                    <td className="py-3 px-4">{index.index}</td>
                    <td className="py-3 px-4">{index.docCount}</td>
                    <td className="py-3 px-4">{index['store.size']}</td>
                    <td className="py-3 px-4">
                      <button onClick={() => handleDeleteClick(index)} className="text-red-500 hover:text-red-400">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'configuration':
        if (configLoading) {
          return (
            <div className="text-center py-8">
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Loading configuration...
            </div>
          );
        }
        return (
          <div>
            <h3 className="text-xl font-semibold text-white mb-4">elasticsearch.yml</h3>
            <pre className="bg-neutral-900 p-4 rounded-lg text-sm text-neutral-300 overflow-x-auto">
              <code>{configContent}</code>
            </pre>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
        <div className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-neutral-600">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-neutral-700">
            <h2 className="text-2xl font-semibold text-white flex items-center">
              <FontAwesomeIcon icon={faServer} className="mr-3 text-primary" />
              Manage Node: {node.name}
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
              <FontAwesomeIcon icon={faTimes} size="lg" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-700">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'overview' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('indices')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'indices' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faDatabase} className="mr-2" />
              Indices
            </button>
            <button
              onClick={() => setActiveTab('configuration')}
              className={`py-3 px-6 font-medium text-sm transition-colors duration-200 ${activeTab === 'configuration' ? 'border-b-2 border-primary text-primary' : 'text-neutral-400 hover:text-white'}`}
            >
              <FontAwesomeIcon icon={faFileAlt} className="mr-2" />
              Configuration
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60]">
          <div className="bg-neutral-800 p-8 rounded-lg shadow-2xl border border-neutral-600">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-3 text-red-500" />
              Confirm Deletion
            </h3>
            <p className="text-neutral-300 mb-6">
              Are you sure you want to delete the index <span className="font-bold text-white">{indexToDelete?.index}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button onClick={() => setShowDeleteModal(false)} className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg">
                Cancel
              </button>
              <button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 