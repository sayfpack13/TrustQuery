// Configuration management
const fs = require("fs").promises;
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "../../config.json");

// Default configuration
const DEFAULT_CONFIG = {
  // Multi-index search configuration - this is what matters for search functionality
  searchIndices: [], // Indices selected for search across all nodes
  
  // Node management
  elasticsearchNodes: ["http://localhost:9200"],
  nodeMetadata: {}, // Store detailed node configuration
  
  // Search and parsing settings
  batchSize: 1000,
  minVisibleChars: 2,
  maskingRatio: 0.2,
  usernameMaskingRatio: 0.4,
  
  // Admin UI settings
  adminSettings: {
  },
  
  // Task management
  autoRefreshInterval: 30000,
  maxTaskHistory: 100
};

// Configuration state
let config = { ...DEFAULT_CONFIG };

// Load configuration from file
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
    console.log("✅ Configuration loaded from file");
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log("📝 No config file found, creating default configuration");
      await saveConfig();
    } else {
      console.error("❌ Error loading config:", error);
      config = { ...DEFAULT_CONFIG };
    }
  }
}

// Save configuration to file
async function saveConfig() {
  try {
    console.log(`💾 Saving configuration to ${CONFIG_FILE}...`);
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("✅ Configuration saved to file");
  } catch (error) {
    console.error("❌ Error saving config:", error);
    throw error;
  }
}

// Get configuration value
function getConfig(key) {
  if (key) {
    // Support dot notation for nested keys
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    return value;
  }
  return { ...config };
}

// Set configuration value
async function setConfig(key, value) {
  if (typeof key === 'object' && key !== null) {
    // Multiple updates
    const updates = key;
    for (const [k, v] of Object.entries(updates)) {
      if (k.includes('.')) {
        // Support dot notation for nested keys
        const keys = k.split('.');
        let current = config;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = v;
      } else {
        config[k] = v;
      }
    }
  } else {
    // Single update
    if (key.includes('.')) {
      // Support dot notation for nested keys
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    } else {
      config[key] = value;
    }
  }
  await saveConfig();
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  DEFAULT_CONFIG
};
