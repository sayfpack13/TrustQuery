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
  faSpinner,
  faSitemap,
} from "@fortawesome/free-solid-svg-icons";
import buttonStyles from "../../../components/ButtonStyles";

const AccountManagement = React.memo(function AccountManagement({
  showNotification,
  isAnyTaskRunning,
  enhancedNodesData = {},
  clustersList = [],
  disabled = false,
}) {
  // Spinner for loading states
  const spinner = (
    <FontAwesomeIcon icon={faCircleNotch} spin className="ml-2 text-white" />
  );
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;


  // Cluster, node, and index filtering state
  const [selectedCluster, setSelectedCluster] = useState("");
  const [selectedNode, setSelectedNode] = useState("");
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(""); // format: nodeName::indexName


  // Filter nodes by selected cluster
  const availableNodes = React.useMemo(() => {
    if (selectedCluster) {
      // Only show nodes that belong to the selected cluster
      return Object.entries(enhancedNodesData)
        .filter(([nodeName, nodeData]) => {
          // Defensive: nodeData.cluster may be undefined/null
          return (nodeData.cluster || "trustquery-cluster") === selectedCluster;
        })
        .map(([nodeName, nodeData]) => ({
          name: nodeName,
          url: nodeData.nodeUrl,
          status: nodeData.status,
          indices: nodeData.indices || [],
          cluster: nodeData.cluster,
        }));
    }
    // If no cluster selected, show all nodes
    return Object.entries(enhancedNodesData).map(([nodeName, nodeData]) => ({
      name: nodeName,
      url: nodeData.nodeUrl,
      status: nodeData.status,
      indices: nodeData.indices || [],
      cluster: nodeData.cluster,
    }));
  }, [enhancedNodesData, selectedCluster]);

  // Build unique node+index pairs for selection, filtered by cluster
  const availableNodeIndices = React.useMemo(() => {
    const all = [];
    Object.entries(enhancedNodesData).forEach(([nodeName, nodeData]) => {
      if (
        (!selectedCluster || nodeData.cluster === selectedCluster || (nodeData.cluster == null && selectedCluster === "trustquery-cluster")) &&
        nodeData.indices
      ) {
        nodeData.indices.forEach((index) => {
          all.push({
            nodeName,
            indexName: index.index,
            label: `${index.index} (${nodeName})`,
          });
        });
      }
    });
    return all;
  }, [enhancedNodesData, selectedCluster]);

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
  const [deletingAccountIds, setDeletingAccountIds] = useState(new Set()); // Track which accounts are being deleted

  // Check if any nodes are running
  const anyNodesRunning = React.useMemo(() => {
    return availableNodes.some(node => node.status === 'running');
  }, [availableNodes]);

  // Fetch accounts data
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);

      // If no nodes for selected cluster, render empty
      if (selectedCluster && availableNodes.length === 0) {
        setAccounts([]);
        setTotal(0);
        return;
      }

      // If no nodes are running, render empty
      if (!anyNodesRunning) {
        setAccounts([]);
        setTotal(0);
        showNotification(
          "error",
          "No Elasticsearch nodes are currently running. Please start at least one node to view accounts.",
          faServer
        );
        return;
      }

      // If all nodes for this cluster have no indices, render empty
      if (availableNodes.length > 0 && availableNodes.every(n => !n.indices || n.indices.length === 0)) {
        setAccounts([]);
        setTotal(0);
        return;
      }

      // Parse cluster, node+index selection
      const params = { page, size: pageSize };
      let node = selectedNode;
      let index = "";
      if (selectedNodeIndex) {
        const [n, i] = selectedNodeIndex.split("::");
        node = n;
        index = i;
      }
      if (selectedCluster) params.cluster = selectedCluster;

      // Check if selected node is running before making the request
      if (node) {
        const nodeData = availableNodes.find(n => n.name === node);
        if (nodeData?.status !== 'running') {
          setAccounts([]);
          setTotal(0);
          showNotification(
            "warning",
            `Node '${node}' is not running. Please start the node or select a different one.`,
            faServer
          );
          return;
        }
      }

      if (node) params.node = node;
      if (index) params.index = index;

      const accountsRes = await axiosClient.get("/api/admin/accounts", {
        params,
      });

      const fetchedAccounts = accountsRes.data.results || [];
      setAccounts(fetchedAccounts);
      setTotal(accountsRes.data.total || 0);

      // Show success message if data was filtered
      if (node || index) {
        const filterMsg = [];
        if (node) filterMsg.push(`node '${node}'`);
        if (index) filterMsg.push(`index '${index}'`);
        showNotification(
          "success",
          `Showing accounts from ${filterMsg.join(" and ")}`,
          faFilter
        );
      }

      // Initialize hiddenPasswords state to hide all passwords by default
      const initialHiddenState = {};
      fetchedAccounts.forEach((account) => {
        initialHiddenState[account.id] = true;
      });
      setHiddenPasswords(initialHiddenState);

      setSelected([]);
      setShowEditModal(false);
      setCurrentEditingAccount(null);
    } catch (err) {
      setAccounts([]);
      setTotal(0);
      showNotification(
        "error",
        err.response?.data?.error || "Failed to fetch accounts",
        faTimes
      );
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    showNotification,
    selectedNode,
    selectedNodeIndex,
    availableNodes,
    anyNodesRunning,
    selectedCluster
  ]);

  // Add refresh function
  const handleRefresh = async () => {
    try {
      showNotification('info', 'Refreshing accounts data...', faRefresh);
      await fetchAccounts();
      showNotification('success', 'Accounts data refreshed successfully', faCheckCircle);
    } catch (error) {
      showNotification('error', 'Failed to refresh accounts data', faTimes);
    }
  };

  useEffect(() => {
    // If cluster has no nodes, or all nodes have no indices, clear accounts immediately
    if ((selectedCluster && availableNodes.length === 0) ||
        (availableNodes.length > 0 && availableNodes.every(n => !n.indices || n.indices.length === 0))) {
      setAccounts([]);
      setTotal(0);
      return;
    }
    fetchAccounts();
  }, [fetchAccounts, availableNodes, selectedCluster]);

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

  // Get node and index info from an account
  const getAccountNodeIndex = useCallback((account) => {
    // First try to get from current filters
    if (selectedNode && selectedNodeIndex) {
      const [node, index] = selectedNodeIndex.split("::");
      return { node, index };
    }
    
    // Then try to get from the account data
    if (account._index || account.index) {
      // Try to find which node this index belongs to
      for (const node of availableNodes) {
        if (node.indices?.some(idx => idx.index === (account._index || account.index))) {
          return {
            node: node.name,
            index: account._index || account.index
          };
        }
      }
    }
    
    return null;
  }, [selectedNode, selectedNodeIndex, availableNodes]);

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!currentEditingAccount || editLoading) return;

    const nodeInfo = getAccountNodeIndex(currentEditingAccount);
    if (!nodeInfo) {
      showNotification(
        "error",
        "Cannot update account: Node and index information is required",
        faTimes
      );
      return;
    }

    // Check if node is running before proceeding
    const nodeData = availableNodes.find(n => n.name === nodeInfo.node);
    if (nodeData?.status !== 'running') {
      showNotification(
        "error",
        `Cannot update account: Node '${nodeInfo.node}' is not running`,
        faTimes
      );
      return;
    }

    setEditLoading(true);
    try {
      await axiosClient.put(
        `/api/admin/accounts/${currentEditingAccount.id}`,
        editFormData,
        { params: nodeInfo }
      );
      showNotification(
        "success",
        "Account updated successfully!",
        faCheckCircle
      );

      // Close modal on success
      setShowEditModal(false);
      setCurrentEditingAccount(null);
      setEditFormData({ url: "", username: "", password: "" });

      // Refresh the data
      await fetchAccounts();
    } catch (err) {
      showNotification(
        "error",
        err.response?.data?.error || "Failed to update account",
        faTimes
      );
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
    if (deletingAccountIds.has(accountId)) return;

    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      showNotification(
        "error",
        "Account not found",
        faTimes
      );
      return;
    }

    const nodeInfo = getAccountNodeIndex(account);
    if (!nodeInfo) {
      showNotification(
        "error",
        "Cannot delete account: Node and index information is required",
        faTimes
      );
      return;
    }

    // Check if node is running before proceeding
    const nodeData = availableNodes.find(n => n.name === nodeInfo.node);
    if (nodeData?.status !== 'running') {
      showNotification(
        "error",
        `Cannot delete account: Node '${nodeInfo.node}' is not running`,
        faTimes
      );
      return;
    }

    setDeletingAccountIds(prev => new Set([...prev, accountId]));
    try {
      await axiosClient.delete(`/api/admin/accounts/${accountId}`, {
        params: nodeInfo
      });
      showNotification(
        "success",
        "Account deleted successfully!",
        faCheckCircle
      );
      await fetchAccounts();
    } catch (err) {
      showNotification(
        "error",
        err.response?.data?.error || "Failed to delete account",
        faTimes
      );
    } finally {
      setDeletingAccountIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(accountId);
        return newSet;
      });
    }
  };

  // Handle delete selected
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    // Group selected accounts by node+index
    const groups = {};
    for (const account of selected) {
      const nodeInfo = getAccountNodeIndex(account);
      if (!nodeInfo) {
        showNotification(
          "error",
          `Cannot delete account ${account.id}: Missing node/index information`,
          faTimes
        );
        continue;
      }

      const key = `${nodeInfo.node}::${nodeInfo.index}`;
      if (!groups[key]) {
        groups[key] = {
          node: nodeInfo.node,
          index: nodeInfo.index,
          items: []
        };
      }
      groups[key].items.push(account.id);
    }

    // Check if any groups were created
    if (Object.keys(groups).length === 0) {
      showNotification(
        "error",
        "Cannot delete accounts: No valid node/index information found",
        faTimes
      );
      return;
    }

    // Process each group
    for (const group of Object.values(groups)) {
      // Check if node is running
      const nodeData = availableNodes.find(n => n.name === group.node);
      if (nodeData?.status !== 'running') {
        showNotification(
          "warning",
          `Skipping accounts on node '${group.node}' - node is not running`,
          faTimes
        );
        continue;
      }

      group.items.forEach(id => setDeletingAccountIds(prev => new Set([...prev, id])));

      try {
        await axiosClient.post("/api/admin/accounts/bulk-delete", {
          items: group.items.map(id => ({
            id,
            node: group.node,
            index: group.index
          }))
        });
        showNotification(
          "success",
          `Deleted ${group.items.length} accounts from ${group.node}/${group.index}`,
          faCheckCircle
        );
      } catch (err) {
        showNotification(
          "error",
          `Failed to delete accounts from ${group.node}/${group.index}: ${err.response?.data?.error || err.message}`,
          faTimes
        );
      } finally {
        group.items.forEach(id => setDeletingAccountIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        }));
      }
    }

    await fetchAccounts();
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
          disabled={disabled || loading}
        >
          {i}
        </button>
      );
    }

    return (
      <>
        {buttons}
        <form
          onSubmit={handlePageInputSubmit}
          className="flex items-center ml-4"
        >
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
          <h2 className="text-3xl font-semibold text-white mb-6 flex items-center">
            <FontAwesomeIcon icon={faDatabase} className="mr-3 text-primary" />
            Account Management
          </h2>

          <div className="flex space-x-4">
            <button
              className={buttonStyles.primary}
              onClick={toggleGlobalPasswordVisibility}
              disabled={disabled}
            >
              <FontAwesomeIcon
                icon={showAllPasswords ? faEyeSlash : faEye}
                className="mr-2"
              />
              {showAllPasswords ? "Hide All Passwords" : "Show All Passwords"}
            </button>
            <button
              className={buttonStyles.delete}
              onClick={handleDeleteSelected}
              disabled={
                disabled || selected.length === 0 || isAnyTaskRunning || loading
              }
            >
              <FontAwesomeIcon icon={faTrash} className="mr-2" />
              {loading ? "Deleting..." : `Delete Selected (${selected.length})`}
              {loading && spinner}
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

            {/* Cluster Filter */}
            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faSitemap} className="text-purple-400" />
              <label className="text-neutral-300">Cluster:</label>
              <select
                value={selectedCluster}
                onChange={(e) => {
                  setSelectedCluster(e.target.value);
                  setSelectedNode("");
                  setSelectedNodeIndex("");
                }}
                className="bg-neutral-600 border border-neutral-500 text-white rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-purple-400"
                disabled={disabled || loading || clustersList.length === 0}
              >
                <option value="">All Clusters</option>
                {clustersList.map((cluster) => (
                  <option key={cluster.name} value={cluster.name}>
                    {cluster.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Node Filter */}
            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faServer} className="text-green-400" />
              <label className="text-neutral-300">Node:</label>
              <select
                value={selectedNode}
                onChange={(e) => {
                  setSelectedNode(e.target.value);
                  setSelectedNodeIndex("");
                }}
                className="bg-neutral-600 border border-neutral-500 text-white rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={disabled || loading || !anyNodesRunning}
              >
                <option value="">All Nodes</option>
                {availableNodes.map((node) => (
                  <option
                    key={node.name}
                    value={node.name}
                    disabled={node.status !== 'running'}
                    className={node.status !== 'running' ? "text-gray-400" : ""}
                  >
                    {node.name} {node.status !== 'running' ? "(Not Running)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Index Filter */}
            <div className="flex items-center space-x-2">
              <FontAwesomeIcon icon={faDatabase} className="text-blue-400" />
              <label className="text-neutral-300">Index:</label>
              <select
                value={selectedNodeIndex}
                onChange={(e) => setSelectedNodeIndex(e.target.value)}
                className="bg-neutral-600 border border-neutral-500 text-white rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={disabled || loading || !selectedNode || !anyNodesRunning}
              >
                <option value="">All Indices</option>
                {availableNodeIndices
                  .filter(
                    (ni) =>
                      !selectedNode || // Show all if no node selected
                      ni.nodeName === selectedNode // Only show indices for selected node
                  )
                  .map((ni) => (
                    <option
                      key={`${ni.nodeName}::${ni.indexName}`}
                      value={`${ni.nodeName}::${ni.indexName}`}
                    >
                      {ni.label}
                    </option>
                  ))}
              </select>
            </div>

            <button
              className={buttonStyles.refresh}
              onClick={handleRefresh}
              disabled={disabled || loading || !anyNodesRunning}
            >
              <FontAwesomeIcon
                icon={loading ? faSpinner : faRefresh}
                className={"mr-2" + (loading ? " fa-spin" : "")}
              />
              Refresh
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
                      selected.length === accounts.length && accounts.length > 0
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
                      <div className="flex items-center space-x-2">
                        <FontAwesomeIcon
                          icon={faServer}
                          className="text-green-400"
                        />
                        <span>
                          {account._source?.node || account.node || account._node || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-200">
                      <div className="flex items-center space-x-2">
                        <FontAwesomeIcon
                          icon={faDatabase}
                          className="text-blue-400"
                        />
                        <span>
                          {account._index || account.index || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-3">
                        <button
                          className={buttonStyles.primary + " p-3"}
                          onClick={() => handleEditClick(account)}
                          disabled={
                            disabled ||
                            editLoading ||
                            deletingAccountIds.has(account.id)
                          }
                          title="Edit Account"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          className={buttonStyles.delete + " p-3"}
                          onClick={() => handleDeleteAccount(account.id)}
                          disabled={
                            disabled ||
                            loading ||
                            deletingAccountIds.has(account.id)
                          }
                          title="Delete Account"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          {deletingAccountIds.has(account.id) && spinner}
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
            disabled={disabled || page === 1 || loading}
            className={buttonStyles.neutral}
          >
            Previous
          </button>
          {renderPaginationButtons()}
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={disabled || page === totalPages || loading}
            className={buttonStyles.neutral}
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
                className={buttonStyles.primary + " px-5 py-2.5"}
                onClick={handleSaveEdit}
                disabled={disabled || editLoading}
              >
                {editLoading && (
                  <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
                )}
                Save Changes
              </button>
              <button
                className={buttonStyles.cancel + " px-5 py-2.5"}
                onClick={handleCancelEdit}
                disabled={disabled || editLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default AccountManagement;
