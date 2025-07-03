// Main application server
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

// Import modules
const { loadConfig, getConfig, setConfig } = require("./src/config");
const { initializeElasticsearchClients, getES, isElasticsearchAvailable } = require("./src/elasticsearch/client");
const { ensureDirectories, PENDING_DIR } = require("./src/utils/filesystem");
const { cleanupOldTasks } = require("./src/tasks");

// Import routes
const authRoutes = require("./src/routes/auth");
const taskRoutes = require("./src/routes/tasks");
const configRoutes = require("./src/routes/config");
const esConfigRoutes = require("./src/routes/elasticsearch/config");

const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for file uploads
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

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/admin", authRoutes);
app.use("/api/admin/tasks", taskRoutes);
app.use("/api/admin/config", configRoutes);
app.use("/api/admin/es/config", esConfigRoutes);

// Helper function to validate and clean configuration on startup
async function validateAndCleanConfiguration() {
  try {
    console.log('🔍 Validating configuration against existing indices...');
    
    const currentConfig = getConfig();
    let configUpdated = false;
    const updates = {};

    // Check if Elasticsearch is available
    const esAvailable = await isElasticsearchAvailable();
    if (!esAvailable) {
      console.log('⚠️ Elasticsearch not available, skipping configuration validation');
      return;
    }

    const es = getES();

    // Get all existing indices
    const existingIndices = await es.cat.indices({ format: "json", h: "index" });
    const availableIndexNames = existingIndices
      .map(idx => idx.index)
      .filter(idx => !idx.startsWith('.') && !idx.startsWith('kibana'));

    // Validate searchIndices
    if (currentConfig.searchIndices && Array.isArray(currentConfig.searchIndices)) {
      const validSearchIndices = currentConfig.searchIndices.filter(idx => 
        availableIndexNames.includes(idx)
      );
      
      if (validSearchIndices.length !== currentConfig.searchIndices.length) {
        const removedIndices = currentConfig.searchIndices.filter(idx => 
          !availableIndexNames.includes(idx)
        );
        updates.searchIndices = validSearchIndices;
        configUpdated = true;
        console.log(`🧹 Removed non-existent indices from searchIndices: ${removedIndices.join(', ')}`);
      }
    }

    // Validate selectedIndex
    if (currentConfig.selectedIndex && !availableIndexNames.includes(currentConfig.selectedIndex)) {
      let newSelectedIndex;
      
      if (updates.searchIndices && updates.searchIndices.length > 0) {
        newSelectedIndex = updates.searchIndices[0];
      } else if (currentConfig.searchIndices && currentConfig.searchIndices.length > 0) {
        const validFromCurrent = currentConfig.searchIndices.filter(idx => 
          availableIndexNames.includes(idx)
        );
        newSelectedIndex = validFromCurrent.length > 0 ? validFromCurrent[0] : 
          (availableIndexNames.length > 0 ? availableIndexNames[0] : "accounts");
      } else {
        newSelectedIndex = availableIndexNames.length > 0 ? availableIndexNames[0] : "accounts";
      }
      
      updates.selectedIndex = newSelectedIndex;
      configUpdated = true;
      console.log(`🧹 Updated selectedIndex from '${currentConfig.selectedIndex}' to '${newSelectedIndex}'`);
    }

    // Apply updates if needed
    if (configUpdated) {
      await setConfig(updates);
      console.log('✅ Configuration validated and cleaned up');
    } else {
      console.log('✅ Configuration is valid');
    }
  } catch (error) {
    console.warn('⚠️ Error validating configuration:', error);
    // Don't throw - this is just maintenance, server should still start
  }
}

// Initialize server and Elasticsearch
async function initializeServer() {
  await loadConfig();
  await ensureDirectories();
  initializeElasticsearchClients();

  // Start the server first
  app.listen(PORT, () => {
    console.log(`✅ Server running on: http://localhost:${PORT}`);
  });
  
  try {
    console.log('🔍 Connecting to Elasticsearch...');
    const es = getES();
    await es.ping();
    console.log('✅ Elasticsearch connected');

    // Validate and clean configuration after successful connection
    await validateAndCleanConfiguration();

    // Initialize default index if connected
    const indexExists = await es.indices.exists({ index: "accounts" });
    if (!indexExists) {
      const { getESWrite, createIndexMapping } = require("./src/elasticsearch/client");
      const esWrite = getESWrite();
      
      await esWrite.indices.create({
        index: "accounts",
        body: createIndexMapping()
      });
      console.log("✅ Default 'accounts' index created");
    }

    // Set up periodic cleanup of old tasks
    setInterval(() => {
      cleanupOldTasks();
    }, 60 * 60 * 1000); // Clean up every hour

  } catch (error) {
    console.warn('⚠️  Elasticsearch not available - some features will be limited');
  }
}

// Storage for selected index (uses configuration)
function getSelectedIndex() {
  return getConfig('selectedIndex');
}

async function setSelectedIndex(indexName) {
  await setConfig('selectedIndex', indexName);
}

// TODO: Import and add other route modules here:
// - File management routes (upload, parse, move, delete)
// - Account management routes (search, CRUD operations)
// - Elasticsearch management routes (indices, cluster, nodes)
// - Search routes (public search endpoint)

// Initialize the server
initializeServer();

module.exports = { app, getSelectedIndex, setSelectedIndex };
