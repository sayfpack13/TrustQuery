require("dotenv").config();

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const parser = require("./parser");
const { Client } = require("@elastic/elasticsearch");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const { syncSearchIndices, getCacheFiltered, refreshClusterCache } = require("./src/cache/indices-cache");
const { createIndexMapping } = require("./src/elasticsearch/client");

// Configuration management
const { loadConfig: loadCentralizedConfig, getConfig, setConfig } = require("./src/config");


const app = express();
const PORT = process.env.PORT || 5000;

const SECRET_KEY = process.env.SECRET_KEY;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// Dynamic configuration getters (removed hardcoded constants)
// Use getConfig() directly in code instead of these constants

const DATA_DIR = path.join(__dirname, "data");
const UNPARSED_DIR = path.join(DATA_DIR, "unparsed");
const PARSED_DIR = path.join(DATA_DIR, "parsed");
const PENDING_DIR = path.join(DATA_DIR, "pending");

const storage = multer.diskStorage({
  destination: PENDING_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);

    let newFilename = baseName;
    if (ext === "") {
      newFilename += ".txt";
    } else if (ext.toLowerCase() !== ".txt") {
      newFilename += ".txt";
    } else {
      newFilename = file.originalname;
    }
    cb(null, newFilename);
  },
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());


const esConfigRoutes = require("./src/routes/elasticsearch-config");
const setupWizardRoutes = require("./src/routes/setup-wizard");
const nodeManagementRoutes = require("./src/routes/node-management");
const clusterManagementRoutes = require("./src/routes/cluster-management");


app.use("/api/admin/es/config", esConfigRoutes);
app.use("/api/setup-wizard", setupWizardRoutes);
app.use("/api/admin/node-management", nodeManagementRoutes);
app.use("/api/admin/cluster-management", clusterManagementRoutes);

// Initialize Elasticsearch client with configuration
const { getES, isElasticsearchAvailable } = require("./src/elasticsearch/client");

// Helper function to get current ES client
function getCurrentES() {
  return getES();
}

// Initialize server and Elasticsearch
async function initializeServer() {
  await loadCentralizedConfig();

  // Verify and clean up node metadata
  const clusterManager = require("./src/elasticsearch/cluster-manager");
  await clusterManager.repairAndVerifyNodeMetadata();

  // Initial cache refresh
  try {
    await refreshClusterCache();
  } catch (error) {
    console.error("Error during initial cache refresh:", error);
    console.warn("Continuing server initialization despite cache refresh error");
  }

  // Log the real structure of searchIndices
  const searchIndices = getConfig("searchIndices");

  // Validate searchIndices: keep only valid { node, index } objects
  if (Array.isArray(searchIndices)) {
    const validIndices = searchIndices.filter((e) => e && typeof e === "object" && "node" in e && "index" in e);
    if (validIndices.length !== searchIndices.length) {
      console.warn(
        `🗑️ Removing invalid entries from searchIndices:`,
        JSON.stringify(
          searchIndices.filter((e) => !(e && typeof e === "object" && "node" in e && "index" in e)),
          null,
          2
        )
      );
      await setConfig("searchIndices", validIndices);
      console.log("💾 Saved cleaned searchIndices to config.");
    }
  }

  // Sync search indices to remove any invalid entries from config
  await syncSearchIndices();
  console.log("🔄 Initial search indices sync completed");

  // Start the server
  app.listen(PORT, () => {
    console.log(`✅ Server running on: http://localhost:${PORT}`);
  });
}

// Start the server after initialization is complete
initializeServer().catch((error) => {
  console.error("❌ Failed to initialize server:", error);
  process.exit(1);
});

// Import task helpers from the dedicated tasks module
const { createTask, updateTask, getAllTasks, getTask, cleanupOldTasks } = require("./src/tasks");
const { verifyJwt } = require("./src/middleware/auth");

// Admin Login endpoint
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required and must be strings." });
  }
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username: ADMIN_USER, role: "admin" }, SECRET_KEY, { expiresIn: "24h" });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// GET all pending files
app.get("/api/admin/pending-files", verifyJwt, async (req, res) => {
  try {
    await fs.mkdir(PENDING_DIR, { recursive: true });
    const files = await fs.readdir(PENDING_DIR);
    res.json({ files });
  } catch (error) {
    console.error("Error reading pending files:", error);
    res.status(500).json({ error: "Failed to list pending files" });
  }
});

// Move file from pending to unparsed
app.post("/api/admin/move-to-unparsed", verifyJwt, async (req, res) => {
  const { filename } = req.body;
  const pendingFilePath = path.join(PENDING_DIR, filename);
  const unparsedFilePath = path.join(UNPARSED_DIR, filename);

  const taskId = createTask("Move to Unparsed", "moving", filename);
  res.json({ taskId });

  (async () => {
    try {
      await fs.rename(pendingFilePath, unparsedFilePath);
      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `File ${filename} moved to unparsed.`,
      });
      console.log(`Task ${taskId} completed: File ${filename} moved to unparsed.`);
    } catch (error) {
      console.error(`Move to unparsed task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// Move file from unparsed to pending
app.post("/api/admin/move-to-pending/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
  const unparsedFilePath = path.join(UNPARSED_DIR, filename);
  const pendingFilePath = path.join(PENDING_DIR, filename);

  const taskId = createTask("Move to Pending", "moving", filename);
  res.json({ taskId });

  (async () => {
    try {
      await fs.rename(unparsedFilePath, pendingFilePath);
      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `File ${filename} moved to pending.`,
      });
      console.log(`Task ${taskId} completed: File ${filename} moved to pending.`);
    } catch (error) {
      console.error(`Move to pending task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// DELETE pending file
app.delete("/api/admin/pending-files/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(PENDING_DIR, filename);

  const taskId = createTask("Delete Pending File", "deleting", filename);
  res.json({ taskId });

  (async () => {
    try {
      await fs.unlink(filePath);
      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `Pending file ${filename} deleted.`,
      });
      console.log(`Task ${taskId} completed: Pending file ${filename} deleted.`);
    } catch (error) {
      console.error(`Delete pending file task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// Shared helper for parsing and indexing files
async function parseAndIndexFiles({ files, parseTargetIndex, parseTargetNode, batchSize, onProgress, onFileDone, taskId }) {
  // Resolve ES client
  let parseES = getCurrentES();
  let resolvedNode = parseTargetNode || getConfig("writeNode");
  if (resolvedNode) {
    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    let nodeUrl = nodeMetadata[resolvedNode]?.nodeUrl;
    if (!nodeUrl && resolvedNode.startsWith("http")) {
      nodeUrl = resolvedNode;
    }
    if (nodeUrl) {
      const { Client } = require("@elastic/elasticsearch");
      parseES = new Client({ node: nodeUrl });
      resolvedNode = nodeUrl;
    }
  }
  // Ensure index exists with correct mapping
  const indexExists = await parseES.indices.exists({ index: parseTargetIndex });
  if (!indexExists) {
    await parseES.indices.create({
      index: parseTargetIndex,
      body: createIndexMapping(),
    });
  }
  // Parse and index each file
  let cumulativeProcessedLines = 0;
  for (const { filePath, parsedFilePath, totalLines } of files) {
    await parser.parseFile(
      filePath,
      async (batch) => {
        const bulkBody = batch.flatMap((doc) => [{ index: { _index: parseTargetIndex } }, { raw_line: doc }]);
        if (bulkBody.length > 0) {
          if (parseES && parseES.bulk) {
            try {
              await parseES.bulk({ refresh: false, body: bulkBody });
            } catch (err) {
              console.error("Bulk indexing error:", err);
            }
          } else {
            console.warn("Elasticsearch client not available for bulk indexing.");
          }
        }
      },
      batchSize,
      (processedLinesInCurrentFile) => {
        if (onProgress) {
          onProgress({
            filePath,
            processed: processedLinesInCurrentFile,
            total: totalLines,
            cumulative: cumulativeProcessedLines + processedLinesInCurrentFile,
          });
        }
      }
    );
    cumulativeProcessedLines += totalLines;
    await fs.rename(filePath, parsedFilePath);
    if (onFileDone) onFileDone({ filePath, parsedFilePath, totalLines });
  }
  return cumulativeProcessedLines;
}

// Refactored /api/admin/parse-all-unparsed
app.post("/api/admin/parse-all-unparsed", verifyJwt, async (req, res) => {
  const { targetIndex, targetNode } = req.body;
  const taskId = createTask("Parse All Unparsed Files", "initializing");
  res.json({ taskId });
  (async () => {
    try {
      const files = await fs.readdir(UNPARSED_DIR);
      const txtFiles = files.filter((file) => path.extname(file).toLowerCase() === ".txt");
      if (txtFiles.length === 0) {
        updateTask(taskId, {
          status: "completed",
          progress: 0,
          total: 0,
          completed: true,
          message: "No .txt files found in unparsed directory to parse.",
        });
        return;
      }
      // Count lines in all files
      let grandTotalLines = 0;
      const fileObjs = [];
      for (const filename of txtFiles) {
        const filePath = path.join(UNPARSED_DIR, filename);
        const parsedFilePath = path.join(PARSED_DIR, filename);
        const totalLines = await parser.countLines(filePath);
        grandTotalLines += totalLines;
        fileObjs.push({ filePath, parsedFilePath, totalLines });
      }
      if (grandTotalLines === 0) {
        updateTask(taskId, {
          status: "completed",
          progress: 0,
          total: 0,
          completed: true,
          message: "No lines found in any .txt files to parse.",
        });
        return;
      }
      updateTask(taskId, {
        total: grandTotalLines,
        message: `Found ${grandTotalLines} lines across ${txtFiles.length} files. Parsing to index '${targetIndex || getSelectedIndex()}' via node '${targetNode || getConfig("writeNode")}'...`,
      });
      let lastProgress = 0;
      await parseAndIndexFiles({
        files: fileObjs,
        parseTargetIndex: targetIndex || getSelectedIndex(),
        parseTargetNode: targetNode || getConfig("writeNode"),
        batchSize: getConfig("batchSize"),
        onProgress: ({ cumulative }) => {
          if (cumulative !== lastProgress) {
            updateTask(taskId, {
              status: "processing files",
              progress: cumulative,
              message: `Processing... ${cumulative}/${grandTotalLines} lines.`,
            });
            lastProgress = cumulative;
          }
        },
      });
      updateTask(taskId, {
        status: "completed",
        progress: grandTotalLines,
        completed: true,
        message: `Successfully parsed and moved ${txtFiles.length} files. Total lines processed: ${grandTotalLines}.`,
      });
      console.log(`Task ${taskId} completed.`);
    } catch (error) {
      console.error(`Parse all unparsed task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// GET all unparsed files
app.get("/api/admin/files", verifyJwt, async (req, res) => {
  try {
    await fs.mkdir(UNPARSED_DIR, { recursive: true });
    const files = await fs.readdir(UNPARSED_DIR);
    res.json({ files });
  } catch (error) {
    console.error("Error reading unparsed files:", error);
    res.status(500).json({ error: "Failed to list unparsed files" });
  }
});

// GET all parsed files
app.get("/api/admin/parsed-files", verifyJwt, async (req, res) => {
  try {
    await fs.mkdir(PARSED_DIR, { recursive: true });
    const files = await fs.readdir(PARSED_DIR);
    res.json({ files });
  } catch (error) {
    console.error("Error reading parsed files:", error);
    res.status(500).json({ error: "Failed to list parsed files" });
  }
});

// UPLOAD endpoint
app.post("/api/admin/upload", verifyJwt, upload.array("files"), async (req, res) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }
  // Optionally, check file types/extensions here if needed
  const taskId = createTask("Upload Files", "uploading", req.files.map((f) => f.originalname).join(", "));
  res.json({ taskId });
  try {
    const uploadedFiles = req.files.map((file) => file.originalname);
    updateTask(taskId, {
      status: "completed",
      progress: uploadedFiles.length,
      total: uploadedFiles.length,
      completed: true,
      message: `Files uploaded successfully: ${uploadedFiles.join(", ")}`,
    });
    console.log(`Task ${taskId} completed: Files ${uploadedFiles.join(", ")} uploaded.`);
  } catch (error) {
    console.error(`Upload task ${taskId} failed:`, error);
    updateTask(taskId, {
      status: "error",
      error: error.message,
      completed: true,
    });
  }
});

// Refactored /api/admin/parse/:filename
app.post("/api/admin/parse/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
  const { targetIndex, targetNode } = req.body;
  if (targetIndex && typeof targetIndex !== "string") {
    return res.status(400).json({ error: "targetIndex must be a string if provided." });
  }
  if (targetNode && typeof targetNode !== "string") {
    return res.status(400).json({ error: "targetNode must be a string if provided." });
  }
  const filePath = path.join(UNPARSED_DIR, filename);
  const parsedFilePath = path.join(PARSED_DIR, filename);
  try {
    await fs.access(filePath);
  } catch (err) {
    return res.status(404).json({ error: "File not found in unparsed directory." });
  }
  const taskId = createTask("Parse File", "initializing", filename);
  res.json({ taskId });
  (async () => {
    try {
      const totalLines = await parser.countLines(filePath);
      updateTask(taskId, {
        total: totalLines,
        message: `Found ${totalLines} lines in ${filename}. Parsing to index '${targetIndex || getSelectedIndex()}' via node '${targetNode || getConfig("writeNode")}'...`,
      });
      await parseAndIndexFiles({
        files: [{ filePath, parsedFilePath, totalLines }],
        parseTargetIndex: targetIndex || getSelectedIndex(),
        parseTargetNode: targetNode || getConfig("writeNode"),
        batchSize: getConfig("batchSize"),
        onProgress: ({ processed }) => {
          updateTask(taskId, {
            status: "parsing",
            progress: processed,
            message: `Parsing file: ${processed}/${totalLines} lines processed...`,
          });
        },
      });
      updateTask(taskId, {
        status: "completed",
        progress: totalLines,
        total: totalLines,
        completed: true,
        message: `Parsed and indexed ${totalLines} lines from ${filename}`,
      });
      console.log(`Task ${taskId} completed successfully.`);
    } catch (error) {
      console.error(`Parse task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// DELETE unparsed file
app.delete("/api/admin/unparsed-files/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(UNPARSED_DIR, filename);

  const taskId = createTask("Delete Unparsed File", "deleting", filename);
  res.json({ taskId });

  (async () => {
    try {
      await fs.unlink(filePath);
      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `Unparsed file ${filename} deleted.`,
      });
      console.log(`Task ${taskId} completed: Unparsed file ${filename} deleted.`);
    } catch (error) {
      console.error(`Delete unparsed file task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// GET accounts with pagination
app.get("/api/admin/accounts", verifyJwt, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 20;
  const from = (page - 1) * size;
  const requestedNode = req.query.node;
  const requestedIndex = req.query.index;
  const requestedCluster = req.query.cluster;
  const { Client } = require("@elastic/elasticsearch");

  try {
    let cachedIndices = await getCacheFiltered();
    const config = getConfig();
    // If cluster filter is provided, filter nodes to only those in the cluster
    if (requestedCluster) {
      cachedIndices = Object.fromEntries(
        Object.entries(cachedIndices).filter(
          ([nodeName, nodeData]) => {
            // Try to get cluster from nodeData or from config.nodeMetadata
            let cluster = nodeData.cluster;
            if (!cluster && config.nodeMetadata && config.nodeMetadata[nodeName]) {
              cluster = config.nodeMetadata[nodeName].cluster;
            }
            return cluster === requestedCluster;
          }
        )
      );
    }

    // Check if any nodes are running
    const runningNodes = Object.values(cachedIndices).filter(node => node.status === "running");
    if (runningNodes.length === 0) {
      return res.status(503).json({
        error: "No Elasticsearch nodes are currently running",
        results: [],
        total: 0
      });
    }

    // Determine which index(es) to search and which ES client to use
    let searchIndex;
    let es;
    let targetNodeUrl;

    if (requestedNode && requestedIndex) {
      // Only allow search if node is running
      if (!cachedIndices[requestedNode] || cachedIndices[requestedNode].status !== "running") {
        return res.status(503).json({
          error: `Node '${requestedNode}' is not running or not reachable`,
          results: [],
          total: 0,
        });
      }
      // Specific index on specific node requested
      let nodeData = cachedIndices[requestedNode];
      let nodeCacheKey = requestedNode;
      const nodeMetadata = config.nodeMetadata || {};
      if (!nodeData) {
        const url = Object.keys(nodeMetadata).find((url) => nodeMetadata[url].name === requestedNode);
        if (url && cachedIndices[nodeMetadata[url].name]) {
          nodeData = cachedIndices[nodeMetadata[url].name];
          nodeCacheKey = nodeMetadata[url].name;
        } else if (url && cachedIndices[url]) {
          nodeData = cachedIndices[url];
          nodeCacheKey = url;
        }
      }
      if (nodeData && !nodeData.nodeUrl && nodeMetadata[requestedNode] && nodeMetadata[requestedNode].nodeUrl) {
        nodeData.nodeUrl = nodeMetadata[requestedNode].nodeUrl;
      }
      if (
        !nodeData ||
        !nodeData.indices ||
        !Object.keys(
          Array.isArray(nodeData.indices)
            ? nodeData.indices.reduce((acc, idx) => {
                acc[idx.index] = true;
                return acc;
              }, {})
            : nodeData.indices
        ).includes(requestedIndex)
      ) {
        return res.status(400).json({
          error: `Index '${requestedIndex}' not found on node '${requestedNode}'`,
          results: [],
          total: 0,
        });
      }
      if (nodeData.status !== "running") {
        return res.status(503).json({
          error: `Node '${requestedNode}' is not running or not reachable`,
          results: [],
          total: 0,
        });
      }
      let nodeUrl = nodeData.nodeUrl;
      if (!nodeUrl && nodeMetadata[requestedNode] && nodeMetadata[requestedNode].nodeUrl) {
        nodeUrl = nodeMetadata[requestedNode].nodeUrl;
      }
      if (!nodeUrl) {
        nodeUrl = `http://localhost:${nodeData.port || 9200}`;
      }
      searchIndex = requestedIndex;
      targetNodeUrl = nodeUrl;
      es = new Client({ node: targetNodeUrl });
    } else if (requestedNode && !requestedIndex) {
      if (!cachedIndices[requestedNode] || cachedIndices[requestedNode].status !== "running") {
        return res.status(503).json({
          error: `Node '${requestedNode}' is not running or not reachable`,
          results: [],
          total: 0,
        });
      }
      const nodeData = cachedIndices[requestedNode];
      if (!nodeData || !nodeData.nodeUrl) {
        return res.status(400).json({
          error: `Node '${requestedNode}' not found or not configured`,
          results: [],
          total: 0,
        });
      }
      if (!nodeData.indices || nodeData.indices.length === 0) {
        return res.json({
          results: [],
          total: 0,
          message: `No indices found on node '${requestedNode}'`,
        });
      }
      searchIndex = nodeData.indices.map((idx) => idx.index).join(",");
      targetNodeUrl = nodeData.nodeUrl;
      es = new Client({ node: targetNodeUrl });
    } else if (!requestedNode && requestedIndex) {
      let indexExists = false;
      for (const [, nodeData] of Object.entries(cachedIndices)) {
        if (nodeData.status !== 'running') continue;
        if (nodeData.indices && nodeData.indices.find((idx) => idx.index === requestedIndex)) {
          indexExists = true;
          break;
        }
      }
      if (!indexExists) {
        return res.status(400).json({
          error: `Index '${requestedIndex}' not found on any configured node`,
          results: [],
          total: 0,
        });
      }
      searchIndex = requestedIndex;
      es = getCurrentES();
    } else {
      // No specific node or index - use all available indices from all running nodes
      const allIndices = [];
      let anyRunningNode = false;
      for (const [nodeName, nodeData] of Object.entries(cachedIndices)) {
        if (nodeData.status === 'running' && nodeData.indices && nodeData.indices.length > 0) {
          anyRunningNode = true;
          const nodeClient = new Client({ node: nodeData.nodeUrl });
          for (const indexInfo of nodeData.indices) {
            allIndices.push({
              node: nodeName,
              index: indexInfo.index,
              client: nodeClient
            });
          }
        }
      }
      if (allIndices.length > 0) {
        es = allIndices[0].client;
        searchIndex = allIndices.map(i => i.index).join(',');
        console.log(`No search indices configured, using all available indices: ${searchIndex}`);
      } else {
        return res.json({
          results: [],
          total: 0,
          message: anyRunningNode
            ? "No indices found on running nodes. Please create indices first."
            : "No indices available.",
        });
      }
    }

    // Execute search query
    try {
      // If we don't have a client or index to search, return empty results
      if (!es || !searchIndex) {
        return res.json({
          results: [],
          total: 0,
          message: "No searchable indices available",
        });
      }

      const response = await es.search({
        index: searchIndex,
        from,
        size,
        body: {
          query: {
            match_all: {},
          },
          // Remove the problematic sort by _id
          // Use doc_id for consistent pagination if needed
        },
      });

      // Process results
      const hits = response.hits.hits;
      const results = hits.map((hit) => {
        const source = hit._source;
        const rawLine = source.raw_line;

        if (!rawLine) {
          return {
            id: hit._id,
            url: "Unknown",
            username: "Unknown",
            password: "Unknown",
            _index: hit._index,
            node: requestedNode || null,
          };
        }

        const { url, username, password } = parser.parseLineForDisplay(rawLine);

        return {
          id: hit._id,
          url,
          username,
          password,
          _index: hit._index,
          node: requestedNode || null,
        };
      });

      res.json({
        results,
        total: response.hits.total.value,
        message: requestedNode
          ? `Showing accounts from node ${requestedNode}`
          : undefined,
      });
    } catch (error) {
      console.error("Error searching accounts:", error);
      res.status(500).json({
        error: "Failed to search accounts: " + error.message,
        results: [],
        total: 0,
      });
    }
  } catch (error) {
    console.error("Error in accounts API:", error);
    res.status(500).json({
      error: "Failed to process request: " + error.message,
      results: [],
      total: 0,
    });
  }
});

// DELETE single account
app.delete("/api/admin/accounts/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;
  const requestedNode = req.query.node;
  const requestedIndex = req.query.index;

  try {
    if (!requestedNode || !requestedIndex) {
      return res.status(400).json({
        error: "Both node and index are required for account deletion.",
      });
    }

    // Check if the specific node is running
    const cachedIndices = await getCacheFiltered();
    const nodeData = cachedIndices[requestedNode];

    if (!nodeData || !nodeData.nodeUrl) {
      return res.status(400).json({
        error: `Node '${requestedNode}' not found or not configured`,
      });
    }

    if (nodeData.status !== "running") {
      return res.status(503).json({
        error: `Node '${requestedNode}' is not running. Please start the node and try again.`,
      });
    }

    // Create ES client for the specific node
    const { Client } = require("@elastic/elasticsearch");
    const es = new Client({ 
      node: nodeData.nodeUrl,
      requestTimeout: 30000,
      sniffOnStart: false,
      sniffOnConnectionFault: false,
    });

    // Test connection to the specific node
    try {
      await es.ping();
    } catch (pingError) {
      console.error(`Failed to connect to node ${requestedNode}:`, pingError);
      return res.status(503).json({
        error: `Cannot connect to node '${requestedNode}'. Please check if it's running properly.`,
      });
    }

    await es.delete({
      index: requestedIndex,
      id: id,
      refresh: true,
    });

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete account" });
  }
});

// PUT (update) single account
app.put("/api/admin/accounts/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;
  const { url, username, password } = req.body;
  const requestedNode = req.query.node;
  const requestedIndex = req.query.index;
  if (!requestedNode || !requestedIndex) {
    return res.status(400).json({ error: "Both node and index are required for account update." });
  }
  if (typeof url !== "string" || typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "url, username, and password are required and must be strings." });
  }

  try {
    // Check if the specific node is running
    const cachedIndices = await getCacheFiltered();
    const nodeData = cachedIndices[requestedNode];

    if (!nodeData || !nodeData.nodeUrl) {
      return res.status(400).json({
        error: `Node '${requestedNode}' not found or not configured`,
      });
    }

    if (nodeData.status !== "running") {
      return res.status(503).json({
        error: `Node '${requestedNode}' is not running. Please start the node and try again.`,
      });
    }

    // Create ES client for the specific node
    const { Client } = require("@elastic/elasticsearch");
    const es = new Client({ 
      node: nodeData.nodeUrl,
      requestTimeout: 30000,
      sniffOnStart: false,
      sniffOnConnectionFault: false,
    });

    // Test connection to the specific node
    try {
      await es.ping();
    } catch (pingError) {
      console.error(`Failed to connect to node ${requestedNode}:`, pingError);
      return res.status(503).json({
        error: `Cannot connect to node '${requestedNode}'. Please check if it's running properly.`,
      });
    }

    // Construct the raw_line from the provided fields
    const raw_line = `${url}:${username}:${password}`;

    await es.update({
      index: requestedIndex,
      id: id,
      body: {
        doc: { raw_line },
      },
      refresh: true,
    });

    res.json({ message: "Account updated successfully" });
  } catch (error) {
    console.error("Error updating account:", error);
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update account" });
  }
});

// BULK DELETE accounts by IDs (now expects array of { id, node, index })
app.post("/api/admin/accounts/bulk-delete", verifyJwt, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid or empty array of items provided. Each item must have id, node, and index." });
  }
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.id || !item.node || !item.index) {
      return res.status(400).json({ error: "Each item must be an object with id, node, and index properties." });
    }
  }
  const taskId = createTask("Bulk Delete", "deleting");
  res.json({ taskId });

  (async () => {
    try {
      const chunkSize = 1000;
      let deletedCount = 0;

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunkItems = items.slice(i, i + chunkSize);

        // Group by node+index for efficient bulk
        const groupMap = {};
        for (const { id, node, index } of chunkItems) {
          if (!node || !index || !id) continue;
          const key = `${node}::${index}`;
          if (!groupMap[key]) groupMap[key] = { node, index, ids: [] };
          groupMap[key].ids.push(id);
        }

        for (const group of Object.values(groupMap)) {
          const { node, index, ids } = group;
          // Get ES client for node
          const cachedIndices = await getCacheFiltered();
          const nodeData = cachedIndices[node];
          if (!nodeData || !nodeData.nodeUrl) continue;
          const { Client } = require("@elastic/elasticsearch");
          const es = new Client({ node: nodeData.nodeUrl });

          let bulkResponse;
          try {
            bulkResponse = await es.bulk({
              refresh: true,
              body: ids.flatMap((id) => [{ delete: { _index: index, _id: id } }]),
            });
          } catch (esError) {
            console.error(`Elasticsearch bulk request failed for node ${node}, index ${index}:`, esError);
            updateTask(taskId, {
              status: "error",
              error: esError.message,
              completed: true,
            });
            return;
          }

          const bulkItems = bulkResponse.items;
          const currentDeleted = bulkItems.filter(
            (item) => item.delete && (item.delete.result === "deleted" || item.delete.result === "not_found")
          ).length;
          deletedCount += currentDeleted;
        }

        updateTask(taskId, {
          status: "deleting",
          progress: deletedCount,
          total: items.length,
          message: `Deleted ${deletedCount}/${items.length} accounts (including missing).`,
        });
      }

      updateTask(taskId, {
        status: "completed",
        progress: deletedCount,
        total: items.length,
        completed: true,
        message: `Bulk delete completed: ${deletedCount} accounts processed.`,
      });
      console.log(`Task ${taskId} completed: Bulk deleted ${deletedCount} accounts.`);
    } catch (error) {
      console.error(`Bulk delete task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// DELETE ALL accounts and move parsed files back to unparsed
app.post("/api/admin/accounts/clean", verifyJwt, async (req, res) => {
  const taskId = createTask("Clean Database", "initializing");
  res.json({ taskId });

  (async () => {
    try {
      let accountsToDelete = 0;
      let filesToMove = 0;
      let filesMoved = 0;
      let accountsDeleted = 0;

      try {
        const es = getCurrentES();
        const response = await es.count({ index: getSelectedIndex() });
        accountsToDelete = response.count;
        console.log(`Task ${taskId}: Found ${accountsToDelete} accounts to delete.`);
      } catch (countError) {
        console.error(`Task ${taskId}: Error getting account count from Elasticsearch:`, countError);
        updateTask(taskId, {
          status: "error",
          error: `Failed to get total account count: ${countError.message || "Unknown error"}`,
          completed: true,
        });
        return;
      }

      const parsedFiles = await fs.readdir(PARSED_DIR);
      filesToMove = parsedFiles.length;
      console.log(`Task ${taskId}: Found ${filesToMove} files to move.`);

      // Estimated total progress units is sum of accounts and files
      const estimatedTotalProgressUnits = accountsToDelete + filesToMove;
      updateTask(taskId, {
        total: estimatedTotalProgressUnits,
        message: "Initializing clean task: counting items...",
      });

      updateTask(taskId, {
        status: "deleting accounts",
        message: `Starting deletion of ${accountsToDelete} accounts...`,
      });

      // Perform delete by query
      const es = getCurrentES();
      const deleteResponse = await es.deleteByQuery({
        index: getSelectedIndex(),
        body: {
          query: { match_all: {} },
        },
        refresh: true, // Refresh index after deletion
      });

      accountsDeleted =
        deleteResponse.body && deleteResponse.body.deleted !== undefined ? deleteResponse.body.deleted : 0;
      console.log(`Task ${taskId}: Deleted ${accountsDeleted} accounts from Elasticsearch.`);

      updateTask(taskId, {
        status: "accounts deleted",
        progress: accountsDeleted,
        message: `Deleted ${accountsDeleted} accounts. Starting file movement...`,
      });

      for (const file of parsedFiles) {
        const oldPath = path.join(PARSED_DIR, file);
        const newPath = path.join(UNPARSED_DIR, file);
        await fs.rename(oldPath, newPath);
        filesMoved++;

        updateTask(taskId, {
          status: "moving files",
          // Progress is sum of deleted accounts and moved files
          progress: accountsDeleted + filesMoved,
          message: `Moving files: ${filesMoved}/${filesToMove} files moved.`,
        });
      }
      console.log(`Task ${taskId}: Moved ${filesMoved} files from parsed to unparsed.`);

      updateTask(taskId, {
        status: "completed",
        progress: accountsDeleted + filesMoved,
        completed: true,
        fileMovedCount: filesMoved,
        message: `Cleaned database: deleted ${accountsDeleted} accounts and moved ${filesMoved} files.`,
      });
      console.log(`Task ${taskId} completed.`);
    } catch (error) {
      console.error(`Clean task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// GET all current tasks
app.get("/api/admin/tasks", verifyJwt, (req, res) => {
  // Return all tasks so the frontend can filter for active/recent/completed
  const allTasks = getAllTasks();
  res.json(Object.values(allTasks));
});

// GET a specific task
app.get("/api/admin/tasks/:taskId", verifyJwt, (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (task) {
    res.json(task);
  } else {
    res.status(404).json({ error: "Task not found" });
  }
});

// DELETE a specific task (only if completed or errored)
const tasksStore = require("./src/tasks");
app.delete("/api/admin/tasks/:taskId", verifyJwt, (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  if (!task.completed && task.status !== "error") {
    return res.status(400).json({ error: "Cannot delete a task that is not completed or errored" });
  }
  // Actually delete from the in-memory store
  if (tasksStore && tasksStore.deleteTask) {
    tasksStore.deleteTask(taskId);
  } else if (tasksStore.tasks) {
    delete tasksStore.tasks[taskId];
  }
  res.json({ message: "Task deleted" });
});

// POST task actions (clear completed/error, clear all)
app.post("/api/admin/tasks/:action", verifyJwt, (req, res) => {
  const { action } = req.params;
  if (action === "clear-completed") {
    // Clear completed and error tasks
    const allTasks = getAllTasks();
    Object.keys(allTasks).forEach((taskId) => {
      if (allTasks[taskId].completed || allTasks[taskId].status === "error") {
        delete allTasks[taskId];
      }
    });
    res.json({
      message: `Cleared completed/error tasks`,
      remainingTasks: Object.keys(getAllTasks()).length,
    });
  } else if (action === "clear-all") {
    // Clear all tasks
    const allTasks = getAllTasks();
    const totalCount = Object.keys(allTasks).length;
    Object.keys(allTasks).forEach((taskId) => delete allTasks[taskId]);
    res.json({
      message: `Cleared all ${totalCount} tasks`,
      remainingTasks: 0,
    });
  } else if (action === "cleanup-old") {
    cleanupOldTasks();
    res.json({ message: "Cleaned up old tasks" });
  } else {
    res.status(400).json({ error: "Unknown action" });
  }
});

// ==================== CONFIGURATION MANAGEMENT ENDPOINTS ====================

// GET current configuration
app.get("/api/admin/config", verifyJwt, (req, res) => {
  try {
    res.json(getConfig());
  } catch (error) {
    console.error("Error fetching configuration:", error);
    res.status(500).json({ error: "Failed to fetch configuration" });
  }
});

// POST update configuration
app.post("/api/admin/config", verifyJwt, async (req, res) => {
  try {
    const { searchIndices, minVisibleChars, maskingRatio, usernameMaskingRatio, batchSize, adminSettings } = req.body;

    const updates = {};

    // Handle direct config updates
    if (searchIndices !== undefined && !Array.isArray(searchIndices)) {
      return res.status(400).json({ error: "searchIndices must be an array if provided." });
    }
    if (minVisibleChars !== undefined && typeof minVisibleChars !== "number") {
      return res.status(400).json({ error: "minVisibleChars must be a number if provided." });
    }
    if (maskingRatio !== undefined && typeof maskingRatio !== "number") {
      return res.status(400).json({ error: "maskingRatio must be a number if provided." });
    }
    if (usernameMaskingRatio !== undefined && typeof usernameMaskingRatio !== "number") {
      return res.status(400).json({ error: "usernameMaskingRatio must be a number if provided." });
    }
    if (batchSize !== undefined && typeof batchSize !== "number") {
      return res.status(400).json({ error: "batchSize must be a number if provided." });
    }

    if (searchIndices !== undefined) updates.searchIndices = searchIndices;
    if (minVisibleChars !== undefined) updates.minVisibleChars = minVisibleChars;
    if (maskingRatio !== undefined) updates.maskingRatio = maskingRatio;
    if (usernameMaskingRatio !== undefined) updates.usernameMaskingRatio = usernameMaskingRatio;
    if (batchSize !== undefined) updates.batchSize = batchSize;

    // Handle adminSettings - if sent as complete object, merge individual fields
    if (adminSettings !== undefined) {
      const currentAdminSettings = getConfig("adminSettings") || {};

      // If adminSettings contains system settings that should be at root level
      if (adminSettings.minVisibleChars !== undefined) updates.minVisibleChars = adminSettings.minVisibleChars;
      if (adminSettings.maskingRatio !== undefined) updates.maskingRatio = adminSettings.maskingRatio;
      if (adminSettings.usernameMaskingRatio !== undefined)
        updates.usernameMaskingRatio = adminSettings.usernameMaskingRatio;
      if (adminSettings.batchSize !== undefined) updates.batchSize = adminSettings.batchSize;

      // UI-specific settings go in adminSettings
      const uiSettings = {};
      // No UI settings currently needed

      if (Object.keys(uiSettings).length > 0) {
        updates.adminSettings = { ...currentAdminSettings, ...uiSettings };
      }
    }

    await setConfig(updates);

    res.json({
      message: "Configuration updated successfully",
      config: getConfig(),
    });
  } catch (error) {
    console.error("Error updating configuration:", error);
    res.status(500).json({ error: "Failed to update configuration", details: error.message });
  }
});

// POST update search indices
// Store searchIndices as array of { node, index } objects
app.post("/api/admin/config/search-indices", verifyJwt, async (req, res) => {
  try {
    const { indices } = req.body;

    if (!Array.isArray(indices)) {
      return res.status(400).json({ error: "Indices must be an array of { node, index } objects" });
    }

    for (const entry of indices) {
      if (!entry || typeof entry !== "object" || !entry.node || !entry.index) {
        return res.status(400).json({ error: "Each search index must have both node and index properties." });
      }
    }

    // Allow empty array to clear all search indices (makes search return nothing)
    if (indices.length === 0) {
      await setConfig("searchIndices", []);
      return res.json({
        message: "Search indices cleared - search will return no results",
        searchIndices: [],
        config: getConfig(),
      });
    }

    // Validate that each entry is { node, index } and exists in cache
    let cachedIndices;
    try {
      cachedIndices = await getCacheFiltered();
    } catch (cacheError) {
      throw new Error(`Cache access failed: ${cacheError.message}`);
    }

    const allAvailable = [];
    for (const [nodeName, nodeData] of Object.entries(cachedIndices)) {
      if (nodeData.indices && Array.isArray(nodeData.indices)) {
        nodeData.indices.forEach((idx) => {
          allAvailable.push({ node: nodeName, index: idx.index });
        });
      }
    }

    for (const entry of indices) {
      if (!entry.node || !entry.index) {
        return res.status(400).json({
          error: "Each search index must have both node and index properties.",
        });
      }
      if (!allAvailable.find((ai) => ai.node === entry.node && ai.index === entry.index)) {
        return res.status(400).json({
          error: `Index '${entry.index}' not found on node '${entry.node}'`,
        });
      }
    }

    await setConfig("searchIndices", indices);

    res.json({
      message: "Search indices updated successfully",
      searchIndices: indices,
      config: getConfig(),
    });
  } catch (error) {
    console.error("Error updating search indices:", error);
    res.status(500).json({ error: "Failed to update search indices", details: error.message });
  }
});

// ==================== END CONFIGURATION MANAGEMENT ====================

// Storage for selected index (uses configuration)
function getSelectedIndex() {
  // For backward compatibility, check both selectedIndex and searchIndices
  const selectedIndex = getConfig("selectedIndex");
  const searchIndices = getConfig("searchIndices") || [];

  // If we have searchIndices configured, use those (modern approach)
  if (searchIndices.length > 0) {
    // If array of { node, index }, return comma-separated indices
    if (typeof searchIndices[0] === "object" && searchIndices[0] !== null && "index" in searchIndices[0]) {
      return searchIndices.map((e) => e.index).join(",");
    } else {
      return searchIndices.join(",");
    }
  }

  // Fallback to old selectedIndex if no searchIndices
  return selectedIndex || "";
}

async function setSelectedIndex(indexName) {
  await setConfig("selectedIndex", indexName);
}
// ==================== ELASTICSEARCH MANAGEMENT ENDPOINTS ====================

// GET all Elasticsearch indices with basic info
app.get("/api/admin/es/indices", verifyJwt, async (req, res) => {
  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.json({
        indices: [],
        selectedIndex: getSelectedIndex(),
        message: "Elasticsearch not available",
      });
    }

    const es = getCurrentES();
    // Use cat.indices to get a lightweight list of indices
    const indicesResponse = await es.cat.indices({
      format: "json",
      h: "health,status,index,uuid,pri,rep,doc.count,store.size",
      s: "index:asc", // Sort by index name
    });

    const indices = indicesResponse.map((index) => ({
      name: index.index,
      health: index.health,
      status: index.status,
      uuid: index.uuid,
      "doc.count": index["doc.count"] || 0,
      "store.size": index["store.size"] || 0,
      isSelected: index.index === getSelectedIndex(),
    }));

    res.json({
      indices: indices,
      selectedIndex: getSelectedIndex(),
    });
  } catch (error) {
    console.error("Error fetching Elasticsearch indices:", error);
    res.status(500).json({ error: "Failed to fetch indices information" });
  }
});

// DELETE Elasticsearch index
app.delete("/api/indices/:indexName", verifyJwt, async (req, res) => {
  const { indexName } = req.params;

  // Prevent deletion of system indices and current selected index being used
  if (indexName.startsWith(".") || indexName === getSelectedIndex()) {
    return res.status(400).json({
      error:
        indexName === getSelectedIndex()
          ? "Cannot delete the currently selected index"
          : "Cannot delete system indices",
    });
  }

  const taskId = createTask("Delete Index", "deleting", indexName);
  res.json({ taskId });

  (async () => {
    try {
      // Check if index exists
      const es = getCurrentES();
      if (!es) {
        updateTask(taskId, {
          status: "error",
          error: "Elasticsearch client not available. Is a node running?",
          completed: true,
        });
        return;
      }
      const exists = await es.indices.exists({ index: indexName });
      if (!exists) {
        updateTask(taskId, {
          status: "error",
          error: `Index '${indexName}' does not exist`,
          completed: true,
        });
        return;
      }

      // Delete the index
      await es.indices.delete({ index: indexName });

      // Sync search indices to remove the deleted index from configuration
      try {
        const { syncSearchIndices } = require("./src/cache/indices-cache");
        await syncSearchIndices();
        console.log(`🔄 Synced search indices after deleting index '${indexName}'`);
      } catch (syncError) {
        console.warn(`⚠️ Failed to sync search indices after deleting index:`, syncError.message);
      }

      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `Index '${indexName}' deleted successfully`,
      });
      console.log(`Task ${taskId} completed: Index '${indexName}' deleted.`);
    } catch (error) {
      console.error(`Delete index task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// POST set selected index for new data operations
app.post("/api/admin/es/select-index", verifyJwt, async (req, res) => {
  const { indexName } = req.body;
  if (!indexName || typeof indexName !== "string") {
    return res.status(400).json({ error: "Index name is required and must be a string." });
  }

  try {
    // Verify the index exists
    const es = getCurrentES();
    const exists = await es.indices.exists({ index: indexName });
    if (!exists) {
      return res.status(404).json({ error: `Index '${indexName}' does not exist` });
    }

    // Update the selected index with proper error handling
    await setSelectedIndex(indexName);

    res.json({
      message: `Selected index set to '${indexName}'`,
      selectedIndex: getSelectedIndex(),
    });
  } catch (error) {
    console.error("❌ Error setting selected index:", error);
    res.status(500).json({ error: "Failed to set selected index: " + error.message });
  }
});

// GET Elasticsearch cluster health and info
app.get("/api/admin/es/health", verifyJwt, async (req, res) => {
  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.json({
        cluster: null,
        version: null,
        storage: null,
        selectedIndex: getSelectedIndex(),
        message: "Elasticsearch not available",
      });
    }

    const es = getCurrentES();
    const [health, info, stats] = await Promise.all([es.cluster.health(), es.info(), es.cluster.stats()]);

    res.json({
      cluster: {
        name: health.cluster_name,
        status: health.status,
        numberOfNodes: health.number_of_nodes,
        numberOfDataNodes: health.number_of_data_nodes,
        activePrimaryShards: health.active_primary_shards,
        activeShards: health.active_shards,
        relocatingShards: health.relocating_shards,
        initializingShards: health.initializing_shards,
        unassignedShards: health.unassigned_shards,
      },
      version: {
        number: info.version.number,
        luceneVersion: info.version.lucene_version,
      },
      storage: {
        totalSize: stats.indices.store.size_in_bytes,
        totalSizeReadable: stats.indices.store.size_in_bytes,
        documentCount: stats.indices.doc.count,
      },
      selectedIndex: getSelectedIndex(),
    });
  } catch (error) {
    console.error("Error fetching Elasticsearch health:", error);
    res.status(500).json({ error: "Failed to fetch cluster health" });
  }
});

// Route to get details for a specific index
app.get("/api/indices/:indexName/details", verifyJwt, async (req, res) => {
  const { indexName } = req.params;
  const client = getCurrentES();
  if (!client) {
    return res.status(503).json({ error: "Elasticsearch client not available." });
  }

  try {
    // Fetch all details in parallel for efficiency
    const [settingsResponse, mappingsResponse, statsResponse] = await Promise.all([
      client.indices.getSettings({ index: indexName }),
      client.indices.getMapping({ index: indexName }),
      client.indices.stats({ index: indexName }),
    ]);

    // Safely access stats to prevent crashes on unhealthy indices
    const stats = statsResponse.indices[indexName];
    const docsCount = stats && stats.total && stats.total.docs ? stats.total.doc.count : 0;
    const storeSize = stats && stats.total && stats.total.store ? stats.total.store.size_in_bytes : 0;

    const details = {
      settings: settingsResponse[indexName].settings,
      mappings: mappingsResponse[indexName].mappings,
      stats: {
        docs: {
          count: docsCount,
        },
        store: {
          size_in_bytes: storeSize,
        },
      },
    };

    res.json(details);
  } catch (error) {
    console.error(`Error fetching details for index ${indexName}:`, error);
    // Return a generic error to the client
    res.status(500).json({ error: `Failed to fetch details for index ${indexName}` });
  }
});

// Get documents from a specific index with pagination
app.get("/api/indices/:indexName/documents", verifyJwt, async (req, res) => {
  const { indexName } = req.params;
  const { from = 0, size = 10 } = req.query;

  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.status(503).json({ error: "Elasticsearch not available" });
    }

    const es = getCurrentES();
    const response = await es.search({
      index: indexName,
      from: from,
      size: size,
      body: {
        query: { match_all: {} },
      },
    });

    const total = response.hits.total.value;
    const results = response.hits.hits.map((hit) => {
      // Assuming the document structure is known and consistent
      return { id: hit._id, ...hit._source };
    });

    res.json({ results, total });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ==================== PUBLIC ENDPOINTS ====================

// GET total accounts count (public endpoint)
app.get("/api/total-accounts", async (req, res) => {
  try {
    const config = getConfig();
    const searchIndices = config.searchIndices || [];
    const nodeMetadata = config.nodeMetadata || {};

    // If no search indices are configured, return 0
    if (searchIndices.length === 0) {
      return res.json({
        totalAccounts: 0,
        searchIndices: [],
        message: "No search indices configured",
      });
    }

    let totalCount = 0;
    const availableIndices = [];
    let anySuccess = false;

    // Only count indices on running nodes
    for (const entry of searchIndices) {
      let nodeName, indexName;
      if (typeof entry === "object" && entry.node && entry.index) {
        nodeName = entry.node;
        indexName = entry.index;
      } else {
        // fallback for legacy config
        nodeName = null;
        indexName = entry;
      }
      if (nodeName && (!nodeMetadata[nodeName] || nodeMetadata[nodeName].status !== 'running')) {
        continue; // skip non-running nodes
      }
      let es = null;
      if (nodeName && nodeMetadata[nodeName] && nodeMetadata[nodeName].nodeUrl) {
        const { Client } = require("@elastic/elasticsearch");
        es = new Client({ node: nodeMetadata[nodeName].nodeUrl });
      } else {
        es = getCurrentES();
      }
      try {
        const response = await es.count({ index: indexName });
        totalCount += response.count;
        availableIndices.push({ node: nodeName, index: indexName });
        anySuccess = true;
      } catch (indexError) {
        console.warn(`Failed to count documents in index ${indexName} (node: ${nodeName}):`, indexError.message);
        // Continue with other indices even if one fails
      }
    }

    res.json({
      totalAccounts: totalCount,
      searchIndices: availableIndices,
      message: anySuccess ? undefined : "Elasticsearch not available",
    });
  } catch (error) {
    console.error("Error fetching total accounts:", error);
    res.json({
      totalAccounts: 0,
      searchIndices: [],
      message: "Error fetching total accounts",
    });
  }
});

// Helper function to check if request is from an admin user
function isAdminRequest(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const token = authHeader.split(" ")[1];
    if (!token) return false;

    const decoded = jwt.verify(token, SECRET_KEY);
    return decoded && decoded.role === "admin";
  } catch (error) {
    return false;
  }
}

// GET search endpoint (public endpoint)
app.get("/api/search", async (req, res) => {
  try {
    const { q, page = 1, size, max } = req.query;
    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    const isAdmin = isAdminRequest(req);
    const startTime = Date.now();

    if (!q || !q.trim()) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Prepare search params
    let pageSize = parseInt(size) || 20;
    let pageNum = parseInt(page) || 1;
    let maxTotal = (max && !isNaN(parseInt(max))) ? parseInt(max) : 10000;
    const from = (pageNum - 1) * pageSize;

    // Build all {node, index} pairs from all running nodes that are reachable (fast TCP check)
    const { isNodeRunning } = require("./src/elasticsearch/node-utils");
    const runningNodeIndexPairs = [];
    for (const [nodeName, nodeData] of Object.entries(nodeMetadata)) {
      if (nodeData.status !== "running" || !Array.isArray(nodeData.indices)) continue;
      try {
        const alive = await isNodeRunning(nodeName, { fastMode: true });
        if (!alive) continue;
      } catch (e) {
        continue;
      }
      for (const idx of nodeData.indices) {
        runningNodeIndexPairs.push({ node: nodeName, index: idx.index });
      }
    }
    if (runningNodeIndexPairs.length === 0) {
      return res.json({
        results: [],
        total: 0,
        searchIndices: [],
        message: "No online nodes or indices available for search.",
      });
    }

    // Group indices by node for efficient querying
    const clientsCache = {};
    const searchLog = [];
    let esAvailable = false;
    const nodeWarnings = [];
    let totalCount = 0;
    let allResults = [];
    let searchedIndices = [];
    const indicesByNode = {};
    for (const { node, index } of runningNodeIndexPairs) {
      if (!indicesByNode[node]) indicesByNode[node] = [];
      indicesByNode[node].push(index);
    }

    // For each node, query all its indices in one request
    const searchPromises = Object.entries(indicesByNode).map(async ([node, indices]) => {
      let nodeUrl = nodeMetadata[node]?.nodeUrl;
      if (!nodeUrl && node.startsWith("http")) nodeUrl = node;
      if (!nodeUrl) nodeUrl = `http://localhost:9200`;
      if (!clientsCache[nodeUrl]) {
        const { Client } = require("@elastic/elasticsearch");
        clientsCache[nodeUrl] = new Client({
          node: nodeUrl,
          compression: true,
          sniffOnStart: false,
          sniffOnConnectionFault: false,
          maxRetries: 1
        });
      }
      const es = clientsCache[nodeUrl];
      try {
        // Compose query: match, autocomplete, and ngram for substring search
        const shouldQueries = [
          { match: { "raw_line": { query: q, operator: "and" } } },
          { match: { "raw_line.autocomplete": { query: q } } },
          // Use ngram subfield for fast substring search
          { match: { "raw_line.ngram": { query: q } } }
        ];
        const response = await es.search({
          index: indices,
          track_total_hits: true,
          from,
          size: pageSize,
          body: {
            _source: ["raw_line"],
            sort: ["_doc"],
            query: {
              bool: {
                should: shouldQueries,
                minimum_should_match: 1,
              },
            },
          }
        });
        esAvailable = true;
        const indexResults = response.hits.hits.map((hit) => {
          const parsedAccount = parser.parseLineForDisplay(hit._source.raw_line);
          if (isAdmin) {
            return {
              id: hit._id,
              ...parsedAccount,
              raw_line: hit._source.raw_line,
              _index: hit._index,
              node,
            };
          } else {
            const maskedAccount = applyMaskingForPublicSearch(parsedAccount, config);
            return {
              id: hit._id,
              ...maskedAccount,
              _index: hit._index,
              node,
            };
          }
        });
        searchLog.push({ node, indices, count: indexResults.length });
        searchedIndices.push(...indices.map(idx => ({ node, index: idx })));
        totalCount += response.hits.total && response.hits.total.value ? response.hits.total.value : 0;
        allResults.push(...indexResults);
        return null;
      } catch (indexError) {
        console.error(`Error searching ${node}/${indices}:`, indexError.message);
        searchLog.push({ node, indices, error: indexError.message });
        nodeWarnings.push({ node, indices, error: indexError.message });
        return null;
      }
    });
    await Promise.all(searchPromises);

    // Log which nodes/indices were searched and how many results
    console.log("[SEARCH LOG]", searchLog);

    // If no ES available
    if (!esAvailable) {
      return res.json({
        results: [],
        total: 0,
        searchIndices: [],
        message: "Elasticsearch not available",
        time_ms: Date.now() - startTime,
        warnings: nodeWarnings
      });
    }
    // If there are no results at all
    if (allResults.length === 0) {
      return res.json({
        results: [],
        total: 0,
        searchIndices: searchedIndices,
        message: nodeWarnings.length > 0 ? "All nodes timed out or failed" : "No results found",
        time_ms: Date.now() - startTime,
        warnings: nodeWarnings.length > 0 ? nodeWarnings : undefined
      });
    }
    // If there are results in total, but this page is empty (e.g., page out of range)
    if (allResults.length === 0 && totalCount > 0) {
      return res.json({
        results: [],
        total: totalCount,
        searchIndices: searchedIndices,
        page: pageNum,
        size: pageSize,
        time_ms: Date.now() - startTime
      });
    }
    const executionTime = Date.now() - startTime;
    res.json({
      results: allResults,
      total: totalCount,
      searchIndices: searchedIndices,
      page: pageNum,
      size: pageSize,
      time_ms: executionTime,
      warnings: nodeWarnings.length > 0 ? nodeWarnings : undefined
    });
  } catch (error) {
    console.error("Error performing search:", error);
    res.status(500).json({
      error: "Search failed",
      details: error.message,
    });
  }
});


// Helper function to apply masking based on character ratio
function maskString(str, ratio, minVisible = 2) {
  if (!str || typeof str !== "string" || str.length === 0) {
    return "";
  }

  if (ratio <= 0) {
    return str; // No masking
  }

  if (ratio >= 1) {
    return "*".repeat(str.length); // Full masking
  }

  const totalVisibleChars = Math.max(minVisible, Math.floor(str.length * (1 - ratio)));
  const maskedChars = str.length - totalVisibleChars;

  if (maskedChars <= 0) {
    return str; // No masking needed
  }

  // For very short strings, show beginning and end
  if (str.length <= 4) {
    const visiblePart = str.substring(0, Math.ceil(totalVisibleChars / 2));
    const maskedPart = "*".repeat(maskedChars);
    const endPart =
      totalVisibleChars > visiblePart.length
        ? str.substring(str.length - (totalVisibleChars - visiblePart.length))
        : "";
    return visiblePart + maskedPart + endPart;
  }

  // For longer strings, mask the middle part
  const startVisible = Math.ceil(totalVisibleChars / 2);
  const endVisible = totalVisibleChars - startVisible;

  const startPart = str.substring(0, startVisible);
  const endPart = endVisible > 0 ? str.substring(str.length - endVisible) : "";
  const maskedPart = "*".repeat(maskedChars);

  return startPart + maskedPart + endPart;
}

// Helper function to apply masking for public search results
function applyMaskingForPublicSearch(accountData, config) {
  const maskingRatio = config.maskingRatio || 0.2;
  const usernameMaskingRatio = config.usernameMaskingRatio || 0.4;
  const minVisibleChars = config.minVisibleChars || 2;

  return {
    url: maskString(accountData.url || "", maskingRatio, minVisibleChars), // URL is now also masked
    username: maskString(accountData.username || "", usernameMaskingRatio, minVisibleChars),
    password: maskString(accountData.password || "", maskingRatio, minVisibleChars),
    // Note: raw_line, index, highlight are intentionally excluded for privacy
  };
}
