import React, { useState, useEffect, useCallback } from "react";
import axiosClient from "../../../api/axiosClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faEdit,
  faTrash,
  faCircleNotch,
  faCheckCircle,
  faTimes,
  faServer,
  faDatabase,
  faFilter,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";

export default function AccountManagement({ 
  showNotification,
  isAnyTaskRunning
}) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Node and index filtering state
  const [availableNodes, setAvailableNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedIndex, setSelectedIndex] = useState('');
  const [availableIndices, setAvailableIndices] = useState([]);
  const [indicesLoading, setIndicesLoading] = useState(false);

  // Password visibility state for the main table (per-row, overridden by global toggle)
  const [hiddenPasswords, setHiddenPasswords] = useState({});
  // Global password visibility state for the main table
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  // Password visibility state for the edit modal
  const [editModalPasswordHidden, setEditModalPasswordHidden] = useState(false);

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

  // Fetch available nodes and indices
  const fetchNodesAndIndices = useCallback(async () => {
    try {
      setIndicesLoading(true);
      const response = await axiosClient.get("/api/admin/indices-by-nodes");
      const indicesByNodes = response.data.indicesByNodes || {};
      
      // Extract nodes and their indices
      const nodes = [];
      const allIndices = [];
      
      Object.entries(indicesByNodes).forEach(([nodeName, nodeData]) => {
        nodes.push({
          name: nodeName,
          url: nodeData.nodeUrl,
          isRunning: nodeData.isRunning,
          indices: nodeData.indices || []
        });
        
        if (nodeData.indices) {
          nodeData.indices.forEach(index => {
            if (!allIndices.find(idx => idx.index === index.index)) {
              allIndices.push({
                ...index,
                nodeName: nodeName
              });
            }
          });
        }
      });
      
      setAvailableNodes(nodes);
      setAvailableIndices(allIndices);
    } catch (error) {
      console.error("Failed to fetch nodes and indices:", error);
      showNotification("error", "Failed to load nodes and indices data", faTimes);
    } finally {
      setIndicesLoading(false);
    }
  }, [showNotification]);

  // Fetch accounts data
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch accounts normally (with node/index filter if selected)
      const params = { page, size: pageSize };
      if (selectedNode) params.node = selectedNode;
      if (selectedIndex) params.index = selectedIndex;
      
      const accountsRes = await axiosClient.get("/api/admin/accounts", { params });

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
      showNotification("error", err.response?.data?.error || "Failed to fetch accounts", faTimes);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, showNotification, selectedNode, selectedIndex, availableNodes]);

  useEffect(() => {
    fetchNodesAndIndices();
  }, [fetchNodesAndIndices]);

  useEffect(() => {
    if (availableNodes.length > 0) {
      fetchAccounts();
    }
  }, [fetchAccounts, availableNodes]);

  // Calculate total pages
  const totalPages = Math.ceil(total / pageSize);

  // Toggle password visibility for individual rows
  const togglePasswordVisibility = (accountId) => {
    setHiddenPasswords((prev) => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  // Toggle global password visibility
  const toggleGlobalPasswordVisibility = () => {
    setShowAllPasswords((prev) => !prev);
  };

  // Toggle password visibility in the edit modal
  const toggleEditModalPasswordVisibility = () => {
    setEditModalPasswordHidden((prev) => !prev);
  };

  // Handle selection
  const toggleSelect = (account) => {
    setSelected((prev) =>
      prev.includes(account)
        ? prev.filter((acc) => acc !== account)
        : [...prev, account]
    );
  };

  const selectAll = () => {
    setSelected(selected.length === accounts.length ? [] : [...accounts]);
  };

  // Handle edit click
  const handleEditClick = (account) => {
    setCurrentEditingAccount(account);
    setEditFormData({
      url: account.url,
      username: account.username,
      password: account.password,
    });
    setEditModalPasswordHidden(false); // Reset password visibility in modal
    setShowEditModal(true);
  };

  // Handle edit form input changes
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!currentEditingAccount) return;

    setEditLoading(true);
    try {
      await axiosClient.put(`/api/admin/accounts/${currentEditingAccount.id}`, editFormData);
      showNotification("success", "Account updated successfully!", faCheckCircle);
      fetchAccounts(); // Refresh the data
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to update account", faTimes);
    } finally {
      setEditLoading(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setShowEditModal(false);
    setCurrentEditingAccount(null);
    setEditFormData({ url: "", username: "", password: "" });
  };

  // Handle delete account
  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm("Are you sure you want to delete this account?")) {
      return;
    }

    try {
      await axiosClient.delete(`/api/admin/accounts/${accountId}`);
      showNotification("success", "Account deleted successfully!", faCheckCircle);
      fetchAccounts(); // Refresh the data
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete account", faTimes);
    }
  };

  // Handle delete selected accounts
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selected.length} selected account(s)?`)) {
      return;
    }

    try {
      const deletePromises = selected.map((account) =>
        axiosClient.delete(`/api/admin/accounts/${account.id}`)
      );
      await Promise.all(deletePromises);
      showNotification("success", `${selected.length} account(s) deleted successfully!`, faCheckCircle);
      fetchAccounts(); // Refresh the data
    } catch (err) {
      showNotification("error", err.response?.data?.error || "Failed to delete selected accounts", faTimes);
    }
  };

  // Pagination helpers
  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setPage(pageNum);
    } else {
      setPageInput(page.toString());
    }
  };

  // Render pagination buttons
  const renderPaginationButtons = () => {
    const buttons = [];
    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <button
          key={i}
          onClick={() => setPage(i)}
          className={`px-3 py-2 rounded-lg transition ${
            i === page
              ? "bg-primary text-white"
              : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
          }`}
          disabled={loading}
        >
          {i}
        </button>
      );
    }

    return (
      <>
        {buttons}
        <form onSubmit={handlePageInputSubmit} className="flex items-center ml-4">
          <span className="text-neutral-400 text-sm mr-2">Go to page:</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            onChange={handlePageInputChange}
            className="w-16 px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
        <div className="text-neutral-400 text-sm ml-4">
          Page {page} of {totalPages} ({total.toLocaleString()} total)
        </div>
      </>
    );
  };

  return (
    <>
      <section className="mb-12 p-6 bg-neutral-800 rounded-xl shadow-lg border border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">Account Management</h2>
          <div className="flex space-x-4">
            <button
              onClick={toggleGlobalPasswordVisibility}
              className="bg-primary hover:bg-button-hover-bg text-white px-4 py-2 rounded-lg transition duration-150 ease-in-out flex items-center space-x-2"
            >
              <FontAwesomeIcon icon={showAllPasswords ? faEyeSlash : faEye} />
              <span>{showAllPasswords ? "Hide All Passwords" : "Show All Passwords"}</span>
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selected.length === 0 || isAnyTaskRunning}
              className="bg-danger hover:bg-red-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition duration-150 ease-in-out flex items-center space-x-2"
            >
              <FontAwesomeIcon icon={faTrash} />
              <span>Delete Selected ({selected.length})</span>
            </button>
          </div>
        </div>

        {/* Filtering Controls */}
        <div className="mb-6 p-4 bg-neutral-700 rounded-lg border border-neutral-600">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faFilter} className="text-blue-400" />
              <span className="text-white font-medium">Filter:</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faServer} className="text-green-400" />
              <label className="text-neutral-300">Node:</label>
              <select
                value={selectedNode}
                onChange={(e) => setSelectedNode(e.target.value)}
                className="bg-neutral-600 border border-neutral-500 text-white rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={indicesLoading}
              >
                <option value="">All Nodes</option>
                {availableNodes.map(node => (
                  <option key={node.name} value={node.name}>
                    {node.name} {node.isRunning ? '(Running)' : '(Stopped)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faDatabase} className="text-blue-400" />
              <label className="text-neutral-300">Index:</label>
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(e.target.value)}
                className="bg-neutral-600 border border-neutral-500 text-white rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={indicesLoading}
              >
                <option value="">All Indices</option>
                {availableIndices
                  .filter(index => !selectedNode || index.nodeName === selectedNode)
                  .map(index => (
                    <option key={`${index.nodeName}-${index.index}`} value={index.index}>
                      {index.index} ({index.nodeName})
                    </option>
                  ))
                }
              </select>
            </div>

            <button
              onClick={() => {
                setPage(1);
                fetchAccounts();
              }}
              disabled={loading || indicesLoading}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition duration-150 ease-in-out flex items-center space-x-1"
            >
              <FontAwesomeIcon icon={faRefresh} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="overflow-hidden border border-neutral-600 rounded-lg">
          <table className="min-w-full divide-y divide-neutral-600">
            <thead className="bg-neutral-700">
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
                      Node
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                      Index
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700">
                  {loading ? (
                    <tr>
                      <td
                        colSpan="8"
                        className="px-6 py-4 text-center text-neutral-400"
                      >
                        Loading records...
                      </td>
                    </tr>
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td
                        colSpan="8"
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                          <div className="flex items-center space-x-2">
                            <FontAwesomeIcon icon={faServer} className="text-green-400" />
                            <span>{account._source?.node || account.node || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                          <div className="flex items-center space-x-2">
                            <FontAwesomeIcon icon={faDatabase} className="text-blue-400" />
                            <span>{account._index || account.index || 'Unknown'}</span>
                          </div>
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
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1 || loading}
                className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-50 transform hover:scale-105 active:scale-95 transition"
              >
                Previous
              </button>
              {renderPaginationButtons()}
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages || loading}
                className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg shadow-md disabled:opacity-50 transform hover:scale-105 active:scale-95 transition"
              >
                Next
              </button>
            </div>
      </section>

      {/* Edit Account Modal */}
      {showEditModal && currentEditingAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-neutral-700 relative">
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
                    type="button"
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
                className="bg-primary hover:bg-button-hover-bg text-white px-5 py-2.5 rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50"
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
                className="bg-neutral-600 hover:bg-neutral-500 text-white px-5 py-2.5 rounded-lg shadow-md transition duration-150 ease-in-out"
                disabled={editLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
