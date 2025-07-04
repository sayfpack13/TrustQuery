require('dotenv').config();

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const parser = require("./parser");
const { Client } = require("@elastic/elasticsearch");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { randomUUID } = require("crypto");
const cors = require("cors");

// Configuration management
const { loadConfig: loadCentralizedConfig, getConfig, setConfig, saveConfig } = require("./src/config");

// Configuration state will be managed by centralized config module

// Helper to format bytes into a human-readable string
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

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
    if (ext === '') {
      newFilename += '.txt';
    } else if (ext.toLowerCase() !== '.txt') {
      newFilename += '.txt';
    } else {
      newFilename = file.originalname;
    }
    cb(null, newFilename);
  }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Import route modules
const clusterAdvancedRoutes = require('./src/routes/cluster-advanced');
const esConfigRoutes = require('./src/routes/elasticsearch-config');

// Add route middleware
app.use('/api/admin/cluster-advanced', clusterAdvancedRoutes);
app.use('/api/admin/es/config', esConfigRoutes);

// Initialize Elasticsearch client with configuration
const { initializeElasticsearchClients, getES, isElasticsearchAvailable } = require('./src/elasticsearch/client');

// Helper function to get current ES client
function getCurrentES() {
  return getES();
}

// Initialize server and Elasticsearch
async function initializeServer() {
  await loadCentralizedConfig();
  
  // Start the server
  app.listen(PORT, () => {
    console.log(`✅ Server running on: http://localhost:${PORT}`);
  });
}

// Start the server after initialization is complete
initializeServer().catch(error => {
    console.error("❌ Failed to initialize server:", error);
    process.exit(1);
});

// In-memory task store
const tasks = {};

// Helper function to create a new task and add it to the in-memory store
function createTask(type, initialStatus = "pending", filename = null) {
  const taskId = randomUUID();
  tasks[taskId] = {
    taskId: taskId,
    type: type,
    status: initialStatus,
    progress: 0,
    total: 0,
    error: null,
    completed: false,
    startTime: Date.now(),
    fileMovedCount: 0,
    filename: filename, // Store filename for single file parsing tasks
  };
  return taskId;
}

// Helper function to update an existing task
function updateTask(taskId, updates) {
  if (tasks[taskId]) {
    Object.assign(tasks[taskId], updates);
  }
}

// Middleware to verify JWT for authenticated routes
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Malformed token" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Admin Login endpoint
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
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
app.post("/api/admin/move-to-unparsed/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
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
        message: `File ${filename} moved to unparsed.`
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
        message: `File ${filename} moved to pending.`
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
        message: `Pending file ${filename} deleted.`
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

// Parse all .txt files in the unparsed directory with accurate progress
app.post("/api/admin/parse-all-unparsed", verifyJwt, async (req, res) => {
  const taskId = createTask("Parse All Unparsed Files", "initializing");
  res.json({ taskId });

  (async () => {
    try {
      const files = await fs.readdir(UNPARSED_DIR);
      const txtFiles = files.filter(file => path.extname(file).toLowerCase() === '.txt');

      if (txtFiles.length === 0) {
        updateTask(taskId, {
          status: "completed",
          progress: 0,
          total: 0,
          completed: true,
          message: "No .txt files found in unparsed directory to parse."
        });
        return;
      }

      // === Step 1: Calculate grand total lines across all files ===
      let grandTotalLines = 0;
      updateTask(taskId, {
        status: "counting lines",
        message: `Counting lines in ${txtFiles.length} files...`
      });
      for (const filename of txtFiles) {
        const filePath = path.join(UNPARSED_DIR, filename);
        try {
          const linesInFile = await parser.countLines(filePath);
          grandTotalLines += linesInFile;
          // Update total in task as we count, providing early feedback
          updateTask(taskId, {
            total: grandTotalLines,
            message: `Counting lines: ${linesInFile} in ${filename}. Total: ${grandTotalLines} lines found.`
          });
        } catch (countError) {
          console.warn(`Task ${taskId}: Could not count lines for ${filename}:`, countError.message);
          // If a file causes an error during counting, you might want to skip it or mark the task as error
          updateTask(taskId, {
            status: "error",
            error: `Error counting lines in ${filename}: ${countError.message}`,
            completed: true, // Mark this specific file counting as an error
          });
          return; // Abort overall task if counting fails
        }
      }

      if (grandTotalLines === 0) {
        updateTask(taskId, {
          status: "completed",
          progress: 0,
          total: 0,
          completed: true,
          message: "No lines found in any .txt files to parse."
        });
        return;
      }

      // Set the final grand total lines for the entire parsing operation
      updateTask(taskId, {
        total: grandTotalLines,
        message: `Found ${grandTotalLines} lines across ${txtFiles.length} files. Starting parsing...`
      });

      let cumulativeProcessedLines = 0;
      let filesParsedCount = 0;

      // === Step 2: Start parsing each file ===
      for (const filename of txtFiles) {
        const filePath = path.join(UNPARSED_DIR, filename);
        const parsedFilePath = path.join(PARSED_DIR, filename);

        try {
          // This call needs to get the actual lines processed for *this* file
          // The parser.parseFile's progressCallback will update the cumulative progress
          await parser.parseFile(
            filePath,
            async (batch) => {
              const bulkBody = batch.flatMap((doc) => [
                { index: { _index: getSelectedIndex() } },
                { raw_line: doc },
              ]);

              if (bulkBody.length > 0) {
                const es = getCurrentES();
                if (es && es.bulk) {
                  await es.bulk({ refresh: false, body: bulkBody });
                } else {
                  console.warn("Elasticsearch client not available for bulk indexing.");
                }
              }
            },
            getConfig('batchSize'),
            (processedLinesInCurrentFile) => {
              // Update the overall task's progress with the cumulative lines processed so far
              const currentCumulativeProgress = cumulativeProcessedLines + processedLinesInCurrentFile;
              updateTask(taskId, {
                status: "processing files",
                progress: currentCumulativeProgress, // Update overall progress
                message: `Processing file ${filename}: ${processedLinesInCurrentFile} lines processed. Overall: ${currentCumulativeProgress}/${grandTotalLines} lines.`
              });
            }
          );

          // After a file is completely parsed, ensure its full line count is added to cumulative total
          // The `parseFile` promise resolves with the total processed lines for that file
          const totalLinesProcessedForFile = await parser.countLines(filePath); // Recount to be sure, or modify parseFile to return this
          cumulativeProcessedLines += totalLinesProcessedForFile;

          filesParsedCount++;
          await fs.rename(filePath, parsedFilePath); // Move file to parsed directory

        } catch (fileError) {
          console.error(`Task ${taskId}: Error processing file ${filename}:`, fileError);
          updateTask(taskId, {
            status: "error",
            error: `Error processing ${filename}: ${fileError.message}`,
            completed: true, // Mark task as completed with error
          });
          // Depending on requirements, you might want to stop the whole process or continue with other files
          break; // For simplicity, stopping on first file error
        }
      }

      updateTask(taskId, {
        status: "completed",
        progress: cumulativeProcessedLines, // Final progress should match grandTotalLines if successful
        completed: true,
        message: `Successfully parsed and moved ${filesParsedCount} out of ${txtFiles.length} files. Total lines processed: ${cumulativeProcessedLines}.`
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
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const taskId = createTask("Upload Files", "uploading", req.files.map(f => f.originalname).join(', '));
  res.json({ taskId });

  try {
    const uploadedFiles = req.files.map(file => file.originalname);
    updateTask(taskId, {
      status: "completed",
      progress: uploadedFiles.length,
      total: uploadedFiles.length,
      completed: true,
      message: `Files uploaded successfully: ${uploadedFiles.join(", ")}`
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

// PARSE endpoint (single file parsing with accurate progress)
app.post("/api/admin/parse/:filename", verifyJwt, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(UNPARSED_DIR, filename);
  const parsedFilePath = path.join(PARSED_DIR, filename);

  try {
    await fs.access(filePath);
  } catch (err) {
    return res.status(404).json({ error: "File not found in unparsed directory." });
  }

  const taskId = createTask("Parse File", "initializing", filename); // Pass filename to task
  res.json({ taskId });

  (async () => {
    try {
      console.log(`Task ${taskId}: Starting parsing for ${filename}`);

      // === Get total lines for this file once at the beginning ===
      const totalLinesInFile = await parser.countLines(filePath);
      updateTask(taskId, {
        total: totalLinesInFile, // Set the fixed total for this file
        message: `Found ${totalLinesInFile} lines in ${filename}. Starting parsing...`
      });

      await parser.parseFile(
        filePath,
        async (batch) => {
          const bulkBody = batch.flatMap((doc) => [
            { index: { _index: getSelectedIndex() } },
            { raw_line: doc }, // Assuming 'doc' is the raw line based on parser.js
          ]);

          if (bulkBody.length > 0) {
            const es = getCurrentES();
            if (es && es.bulk) {
              await es.bulk({ refresh: false, body: bulkBody });
            } else {
              console.warn("Elasticsearch client not available for bulk indexing.");
            }
          }
        },
        getConfig('batchSize'),
        (currentProcessedLines) => { // This callback gives real-time progress
          updateTask(taskId, {
            status: "parsing",
            progress: currentProcessedLines,
            // 'total' remains fixed from initial count
            message: `Parsing file: ${currentProcessedLines}/${totalLinesInFile} lines processed...`
          });
        }
      );

      console.log(`Task ${taskId}: Successfully parsed and indexed ${totalLinesInFile} lines.`);

      await fs.rename(filePath, parsedFilePath);
      console.log(`Task ${taskId}: Moved ${filename} to parsed directory.`);

      updateTask(taskId, {
        status: "completed",
        progress: totalLinesInFile, // Final progress should match totalLinesInFile if successful
        total: totalLinesInFile, // Confirm final total
        completed: true,
        message: `Parsed and indexed ${totalLinesInFile} lines from ${filename}`,
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
        message: `Unparsed file ${filename} deleted.`
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

  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.json({
        results: [],
        total: 0,
        message: "Elasticsearch not available"
      });
    }

    const es = getCurrentES();
    const response = await es.search({
      index: getSelectedIndex(),
      from: from,
      size: size,
      body: {
        query: { match_all: {} }
      },
    });

    const total = response.hits.total.value;
    const results = response.hits.hits.map((hit) => {
      // Parse the raw line for display in admin panel
      const parsedAccount = parseLineForDisplay(hit._source.raw_line);
      return { id: hit._id, raw_line: hit._source.raw_line, ...parsedAccount };
    });

    res.json({ results, total });
  } catch (error) {
    console.error("Error searching accounts:", error);
    res.status(500).json({ message: "Error searching accounts." });
  }
});

// DELETE single account
app.delete("/api/admin/accounts/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;
  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.status(503).json({
        error: "Elasticsearch not available - cannot delete account"
      });
    }

    const es = getCurrentES();
    await es.delete({
      index: getSelectedIndex(),
      id: id,
      refresh: true,
    });
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// PUT (update) single account
app.put("/api/admin/accounts/:id", verifyJwt, async (req, res) => {
  const { id } = req.params;
  const { raw_line } = req.body; // Expect raw_line in the body

  try {
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      return res.status(503).json({
        error: "Elasticsearch not available - cannot update account"
      });
    }

    const es = getCurrentES();
    await es.update({
      index: getSelectedIndex(),
      id: id,
      body: {
        doc: { raw_line }, // Update raw_line field
      },
      refresh: true,
    });
    res.json({ message: "Account updated successfully" });
  } catch (error) {
    console.error("Error updating account in Elasticsearch:", error);
    if (error.meta && error.meta.statusCode === 404) {
      return res.status(404).json({ message: "Account not found." });
    }
    res.status(500).json({ message: "Failed to update account due to a server error." });
  }
});

// BULK DELETE accounts by IDs
app.post("/api/admin/accounts/bulk-delete", verifyJwt, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Invalid or empty array of IDs provided." });
  }

  const taskId = createTask("Bulk Delete", "deleting");
  res.json({ taskId });

  (async () => {
    try {
      const chunkSize = 1000;
      let deletedCount = 0;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunkIds = ids.slice(i, i + chunkSize);

        let bulkResponse;
        try {
          const es = getCurrentES();
          bulkResponse = await es.bulk({
            refresh: true,
            body: chunkIds.flatMap((id) => [{ delete: { _index: getSelectedIndex(), _id: id } }]),
          });
        } catch (esError) {
          console.error(`Elasticsearch bulk request failed at chunk starting with ID ${chunkIds[0]}:`, esError);
          updateTask(taskId, {
            status: "error",
            error: esError.message,
            completed: true,
          });
          return;
        }

        const bulkItems = bulkResponse.items

        const currentDeleted = bulkItems.filter(
          (item) =>
            item.delete &&
            (item.delete.result === "deleted" || item.delete.result === "not_found")
        ).length;

        deletedCount += currentDeleted;


        updateTask(taskId, {
          status: "deleting",
          progress: deletedCount,
          total: ids.length,
          message: `Deleted ${deletedCount}/${ids.length} accounts (including missing).`
        });
      }


      updateTask(taskId, {
        status: "completed",
        progress: deletedCount,
        total: ids.length,
        completed: true,
        message: `Bulk delete completed: ${deletedCount} accounts processed.`
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
        message: "Initializing clean task: counting items..."
      });

      updateTask(taskId, {
        status: "deleting accounts",
        message: `Starting deletion of ${accountsToDelete} accounts...`
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

      accountsDeleted = (deleteResponse.body && deleteResponse.body.deleted !== undefined) ? deleteResponse.body.deleted : 0;
      console.log(`Task ${taskId}: Deleted ${accountsDeleted} accounts from Elasticsearch.`);

      updateTask(taskId, {
        status: "accounts deleted",
        progress: accountsDeleted,
        message: `Deleted ${accountsDeleted} accounts. Starting file movement...`
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
          message: `Moving files: ${filesMoved}/${filesToMove} files moved.`
        });
      }
      console.log(`Task ${taskId}: Moved ${filesMoved} files from parsed to unparsed.`);

      updateTask(taskId, {
        status: "completed",
        progress: accountsDeleted + filesMoved,
        completed: true,
        fileMovedCount: filesMoved,
        message: `Cleaned database: deleted ${accountsDeleted} accounts and moved ${filesMoved} files.`
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
  // Filter for tasks that are not completed and not in an error state.
  const activeTasks = Object.values(tasks).filter(
    (task) => !task.completed && task.status !== "error"
  );
  res.json(activeTasks);
});


// GET task status
app.get("/api/admin/tasks/:taskId", verifyJwt, (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];

  if (task) {
    res.json(task);
  } else {
    res.status(404).json({ error: "Task not found" });
  }
});

// POST task actions (like clear, retry, etc.)
app.post("/api/admin/tasks/:action", verifyJwt, (req, res) => {
  const { action } = req.params;
  const payload = req.body;

  try {
    switch (action) {
      case 'clear':
        // Clear completed and error tasks
        const tasksToDelete = [];
        Object.keys(tasks).forEach(taskId => {
          if (tasks[taskId].completed || tasks[taskId].status === 'error') {
            tasksToDelete.push(taskId);
          }
        });
        tasksToDelete.forEach(taskId => delete tasks[taskId]);
        res.json({ 
          message: `Cleared ${tasksToDelete.length} completed/error tasks`,
          remainingTasks: Object.keys(tasks).length
        });
        break;
      
      case 'clear-all':
        // Clear all tasks
        const totalCount = Object.keys(tasks).length;
        Object.keys(tasks).forEach(taskId => delete tasks[taskId]);
        res.json({ 
          message: `Cleared all ${totalCount} tasks`,
          remainingTasks: 0
        });
        break;
      
      default:
        res.status(400).json({ error: `Unknown task action: ${action}` });
    }
  } catch (error) {
    console.error('Error handling task action:', error);
    res.status(500).json({ error: 'Failed to handle task action' });
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
    if (searchIndices !== undefined) updates.searchIndices = searchIndices;
    if (minVisibleChars !== undefined) updates.minVisibleChars = minVisibleChars;
    if (maskingRatio !== undefined) updates.maskingRatio = maskingRatio;
    if (usernameMaskingRatio !== undefined) updates.usernameMaskingRatio = usernameMaskingRatio;
    if (batchSize !== undefined) updates.batchSize = batchSize;
    if (adminSettings !== undefined) updates.adminSettings = { ...getConfig('adminSettings'), ...adminSettings };

    await setConfig(updates);

    res.json({
      message: "Configuration updated successfully",
      config: getConfig()
    });
  } catch (error) {
    console.error("Error updating configuration:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
});

// POST update search indices
app.post("/api/admin/config/search-indices", verifyJwt, async (req, res) => {
  try {
    const { indices } = req.body;

    if (!Array.isArray(indices)) {
      return res.status(400).json({ error: "Indices must be an array" });
    }

    // Verify all indices exist
    const es = getCurrentES();
    for (const index of indices) {
      const exists = await es.indices.exists({ index });
      if (!exists) {
        return res.status(400).json({ error: `Index '${index}' does not exist` });
      }
    }

    await setConfig('searchIndices', indices);

    res.json({
      message: "Search indices updated successfully",
      searchIndices: getConfig('searchIndices')
    });
  } catch (error) {
    console.error("Error updating search indices:", error);
    res.status(500).json({ error: "Failed to update search indices" });
  }
});

// ==================== END CONFIGURATION MANAGEMENT ====================

// Storage for selected index (uses configuration)
function getSelectedIndex() {
  return getConfig('selectedIndex');
}

async function setSelectedIndex(indexName) {
  await setConfig('selectedIndex', indexName);
}

// Helper function to create proper index mapping
function createIndexMapping(shards = 1, replicas = 0) {
  return {
    settings: {
      number_of_shards: shards,
      number_of_replicas: replicas,
      analysis: {
        analyzer: {
          autocomplete_analyzer: {
            tokenizer: "autocomplete_tokenizer",
            filter: ["lowercase"]
          }
        },
        tokenizer: {
          autocomplete_tokenizer: {
            type: "edge_ngram",
            min_gram: 2,
            max_gram: 10,
          }
        }
      }
    },
    mappings: {
      properties: {
        raw_line: {
          type: "text",
          fields: {
            autocomplete: {
              type: "text",
              analyzer: "autocomplete_analyzer"
            }
          }
        },
      },
    },
  };
}

// Helper function to safely format index name
function formatIndexName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
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
        message: "Elasticsearch not available"
      });
    }

    const es = getCurrentES();
    // Use cat.indices to get a lightweight list of indices
    const indicesResponse = await es.cat.indices({
      format: "json",
      h: "health,status,index,uuid,pri,rep,docs.count,store.size",
      s: "index:asc" // Sort by index name
    });

    const indices = indicesResponse.map(index => ({
      name: index.index,
        health: index.health,
      status: index.status,
      uuid: index.uuid,
        docCount: parseInt(index['docs.count']) || 0,
        storeSize: index['store.size'] || '0b',
      isSelected: index.index === getSelectedIndex()
    }));

    res.json({
      indices: indices,
      selectedIndex: getSelectedIndex()
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
  if (indexName.startsWith('.') || indexName === getSelectedIndex()) {
    return res.status(400).json({
      error: indexName === getSelectedIndex() ?
        "Cannot delete the currently selected index" :
        "Cannot delete system indices"
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

      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: `Index '${indexName}' deleted successfully`
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
  console.log(`🔄 Received request to change index to: ${indexName}`);

  if (!indexName || typeof indexName !== 'string') {
    console.log(`❌ Invalid index name: ${indexName}`);
    return res.status(400).json({ error: "Index name is required" });
  }

  try {
    console.log(`🔍 Checking if index '${indexName}' exists...`);
    // Verify the index exists
    const es = getCurrentES();
    const exists = await es.indices.exists({ index: indexName });
    if (!exists) {
      console.log(`❌ Index '${indexName}' does not exist`);
      return res.status(404).json({ error: `Index '${indexName}' does not exist` });
    }

    console.log(`💾 Updating selected index to '${indexName}'...`);
    // Update the selected index with proper error handling
    await setSelectedIndex(indexName);

    console.log(`✅ Selected index successfully changed to: ${indexName}`);

    res.json({
      message: `Selected index set to '${indexName}'`,
      selectedIndex: getSelectedIndex()
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
        message: "Elasticsearch not available"
      });
    }

    const es = getCurrentES();
    const [health, info, stats] = await Promise.all([
      es.cluster.health(),
      es.info(),
      es.cluster.stats()
    ]);

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
        unassignedShards: health.unassigned_shards
      },
      version: {
        number: info.version.number,
        luceneVersion: info.version.lucene_version
      },
      storage: {
        totalSize: stats.indices.store.size_in_bytes,
        totalSizeReadable: formatBytes(stats.indices.store.size_in_bytes),
        documentCount: stats.indices.docs.count
      },
      selectedIndex: getSelectedIndex()
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
      client.indices.stats({ index: indexName })
    ]);

    // Safely access stats to prevent crashes on unhealthy indices
    const stats = statsResponse.indices[indexName];
    const docsCount = stats && stats.total && stats.total.docs ? stats.total.docs.count : 0;
    const storeSize = stats && stats.total && stats.total.store ? stats.total.store.size_in_bytes : 0;

    const details = {
      settings: settingsResponse[indexName].settings,
      mappings: mappingsResponse[indexName].mappings,
      stats: {
        docs: {
          count: docsCount
        },
        store: {
          size_in_bytes: storeSize
        }
      }
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
  // ... existing code ...
});