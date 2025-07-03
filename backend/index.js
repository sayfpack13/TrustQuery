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

const app = express();
const PORT = process.env.PORT || 5000;


const SECRET_KEY = process.env.SECRET_KEY;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MIN_VISIBLE_CHARS = parseInt(process.env.MIN_VISIBLE_CHARS) || 2;
const MASKING_RATIO = parseFloat(process.env.MASKING_RATIO) || 0.2;
const USERNAME_MASKING_RATIO = parseFloat(process.env.USERNAME_MASKING_RATIO) || 0.4;
const BATCH_SIZE = process.env.BATCH_SIZE;

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
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

const esNodes = (process.env.ELASTICSEARCH_NODES || "http://localhost:9200").split(',');
const es = new Client({ nodes: esNodes });

// Helper to get the default index name, ensuring it's safe.
const defaultIndex = "accounts";
const getSafeIndexName = (indexName) => {
  if (indexName && /^[a-z0-9._-]+$/.test(indexName)) {
    return indexName;
  }
  return defaultIndex; // Fallback to the default index
};


// Function to create an index with the correct mappings and settings
const createIndex = async (indexName) => {
  const safeIndexName = getSafeIndexName(indexName);
  return await es.indices.create({
    index: safeIndexName,
    body: {
      settings: {
        analysis: {
          analyzer: {
            autocomplete_analyzer: {
              tokenizer: "autocomplete_tokenizer",
              filter: ["lowercase"],
            },
          },
          tokenizer: {
            autocomplete_tokenizer: {
              type: "edge_ngram",
              min_gram: 2,
              max_gram: 10,
            },
          },
        },
      },
      mappings: {
        properties: {
          raw_line: {
            type: "text",
            fields: {
              autocomplete: {
                type: "text",
                analyzer: "autocomplete_analyzer",
              },
            },
          },
          sourceFile: {
            type: "keyword",
          },
        },
      },
    },
  });
};

(async () => {
  try {
    const indexExists = await es.indices.exists({ index: defaultIndex });
    if (indexExists) {
      console.log(`Default index '${defaultIndex}' already exists. Skipping creation.`);
    } else {
      console.log(`Default index '${defaultIndex}' not found. Creating it...`);
      await createIndex(defaultIndex);
      console.log(`✅ Created default index '${defaultIndex}' in Elasticsearch.`);
    }
  } catch (error) {
    console.error("❌ Failed to initialize default index:", error);
  }
})();

// === Elasticsearch Index Management Endpoints ===

// GET all indices with stats
app.get("/api/admin/es/indices", verifyJwt, async (req, res) => {
  try {
    const indices = await es.cat.indices({ format: "json", h: "index,docs.count,store.size", bytes: 'b' });
    res.json(indices || []);
  } catch (error) {
    console.error("Error fetching indices:", error);
    res.status(500).json({ error: "Failed to fetch Elasticsearch indices." });
  }
});

// POST to create a new index
app.post("/api/admin/es/indices", verifyJwt, async (req, res) => {
  const { indexName } = req.body;
  if (!indexName) {
    return res.status(400).json({ error: "indexName is required." });
  }
  const safeIndexName = getSafeIndexName(indexName);

  try {
    await createIndex(safeIndexName);
    res.status(201).json({ message: `Index '${safeIndexName}' created successfully.` });
  } catch (error) {
    console.error(`Error creating index '${safeIndexName}':`, error);
    res.status(500).json({ error: `Failed to create index. ${error.message}` });
  }
});

// DELETE an index
app.delete("/api/admin/es/indices/:indexName", verifyJwt, async (req, res) => {
  const { indexName } = req.params;
  const safeIndexName = getSafeIndexName(indexName);

  if (safeIndexName === defaultIndex) {
    return res.status(400).json({ error: "Cannot delete the default 'accounts' index." });
  }

  try {
    await es.indices.delete({ index: safeIndexName });
    res.json({ message: `Index '${safeIndexName}' deleted successfully.` });
  } catch (error) {
    console.error(`Error deleting index '${safeIndexName}':`, error);
    res.status(500).json({ error: `Failed to delete index. ${error.message}` });
  }
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
                { index: { _index: "accounts" } },
                { raw_line: doc },
              ]);

              if (bulkBody.length > 0) {
                if (es && es.bulk) {
                  await es.bulk({ refresh: false, body: bulkBody });
                } else {
                  console.warn("Elasticsearch client not available for bulk indexing.");
                }
              }
            },
            BATCH_SIZE,
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
            { index: { _index: "accounts" } },
            { raw_line: doc }, // Assuming 'doc' is the raw line based on parser.js
          ]);

          if (bulkBody.length > 0) {
            if (es && es.bulk) {
              await es.bulk({ refresh: false, body: bulkBody });
            } else {
              console.warn("Elasticsearch client not available for bulk indexing.");
            }
          }
        },
        BATCH_SIZE,
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
    const response = await es.search({
      index: "accounts",
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
    await es.delete({
      index: "accounts",
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
    await es.update({
      index: "accounts",
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
          bulkResponse = await es.bulk({
            refresh: true,
            body: chunkIds.flatMap((id) => [{ delete: { _index: "accounts", _id: id } }]),
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
        const response = await es.count({ index: "accounts" });
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
      const deleteResponse = await es.deleteByQuery({
        index: "accounts",
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

// backend/index.js
app.get("/api/total-accounts", async (req, res) => {
  try {
    const response = await es.count({ index: "accounts" });
    res.json({ totalAccounts: response.count });
  } catch (error) {
    res.status(500).json({ message: "Error fetching total accounts." });
  }
});

/**
 * Helper function to parse a raw line into URL, Username, and Password components.
 * This logic is adapted from the original parser.js.
 * @param {string} line - The raw line string from the database.
 * @returns {{url: string, username: string, password: string}} Parsed components.
 */
function parseLineForDisplay(line) {
  let url = "", username = "", password = "";

  let clean = line.trim();
  while (clean.endsWith(":")) clean = clean.slice(0, -1);

  if (!clean) return { url: "", username: "", password: "" };
  if (clean.includes(" - ") || clean.includes(" ")) {
    return { url: clean, username: "", password: "" };
  }

  // PASSWORD-FIRST STRATEGY
  let parts;

  if (clean.includes("::")) {
    parts = clean.split("::");

    const passwordSide = parts.pop(); // Get right side after `::`
    const leftSide = parts.join("::"); // Remaining part before `::`

    const rightParts = passwordSide.split(":");
    password = rightParts.pop(); // Final value = password

    if (rightParts.length > 0) {
      username = rightParts.join(":");
    }

    const leftParts = leftSide.split(":");
    url = leftParts.join(":"); // Whatever remains is considered URL

  } else {
    parts = clean.split(":");

    password = parts.pop(); // Last part = password
    if (parts.length > 0) {
      username = parts.pop(); // Second-last = username (if exists)
      if (parts.length > 0) {
        url = parts.join(":"); // Rest = URL
      }
    }
  }

  // Prevent malformed usernames
  if (username.includes("//") || username.startsWith("http")) {
    return { url: clean, username: "", password: "" };
  }

  return { url, username, password };
}



// Public /search endpoint
app.get("/api/search", async (req, res) => {
  const q = req.query.q;
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 20;
  const from = (page - 1) * size;

  if (!q) return res.json({ results: [], total: 0 });

  let isAdmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded && decoded.username === ADMIN_USER) {
          isAdmin = true;
        }
      } catch (err) {
        isAdmin = false;
      }
    }
  }

  try {
    const response = await es.search({
      index: "accounts",
      from: from,
      size: size,
      query: {
        bool: {
          should: [
            {
              // Search using the autocomplete field for raw_line
              match: {
                "raw_line.autocomplete": {
                  query: q.toLowerCase(),
                  operator: "and"
                }
              }
            },
            {
              // Broader search on the raw_line text field
              match_phrase_prefix: {
                raw_line: q.toLowerCase()
              }
            }
          ],
          minimum_should_match: 1
        }
      }
    });

    const hits = response.hits.hits;
    const total = response.hits.total.value;

    const results = hits.map((hit) => {
      const parsedAccount = parseLineForDisplay(hit._source.raw_line); // Parse the raw line
      let account = {
        id: hit._id,
        url: parsedAccount.url,
        username: parsedAccount.username,
        password: parsedAccount.password
      };

      // Conditionally add raw_line only if admin
      if (isAdmin) {
        account.raw_line = hit._source.raw_line;
      }

      if (!isAdmin) {
        // If not an admin, mask the password
        if (account.password) {
          const passwordLength = account.password.length;
          if (passwordLength <= 4) { // For short passwords, mask completely
            account.password = "*".repeat(passwordLength);
          } else {
            // Show 20% of characters at the start and end, with a minimum of 2
            const visibleChars = Math.max(MIN_VISIBLE_CHARS, Math.floor(passwordLength * MASKING_RATIO));
            const maskedMiddle = "*".repeat(passwordLength - 2 * visibleChars);
            account.password =
              account.password.substring(0, visibleChars) +
              maskedMiddle +
              account.password.substring(passwordLength - visibleChars);
          }
        } else {
          account.password = ""; // Handle empty passwords
        }

        if (account.username) {
          const usernameLength = account.username.length;
          if (usernameLength <= 4) {
            account.username = "*".repeat(usernameLength); // Mask completely with asterisks
          } else {
            // Show 20% of characters at the start and end, with a minimum of 2
            const visibleChars = Math.max(MIN_VISIBLE_CHARS, Math.floor(usernameLength * USERNAME_MASKING_RATIO));
            const maskedMiddle = "*".repeat(usernameLength - 2 * visibleChars);
            account.username =
              account.username.substring(0, visibleChars) +
              maskedMiddle +
              account.username.substring(usernameLength - visibleChars);
          }
        } else {
          account.username = "";
        }
      }
      return account;
    });

    res.json({ results, total });
  } catch (error) {
    res.status(500).json({ message: "Error searching records." });
  }
});
