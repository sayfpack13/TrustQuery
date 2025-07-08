// Configuration management
const fs = require("fs").promises;
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "../../config.json");

// Default configuration
const DEFAULT_CONFIG = {
  // Multi-index search configuration - this is what matters for search functionality
  searchIndices: [], // Indices selected for search across all nodes

  // Node management
  elasticsearchNodes: [],
  nodeMetadata: {}, // Store detailed node configuration

  // Search and parsing settings
  batchSize: 1000,
  minVisibleChars: 2,
  maskingRatio: 0.2,
  usernameMaskingRatio: 0.4,

  // Admin UI settings
  adminSettings: {
  },

  // Add safe defaults for Elasticsearch base path for first-time users
  elasticsearchConfig: {
    basePath: path.resolve(__dirname, '../../elasticsearch-nodes')
  },
  setupWizard: {
    basePath: path.resolve(__dirname, '../../elasticsearch-nodes')
  }
};

// Configuration state
let config = { ...DEFAULT_CONFIG };

// Load configuration from file
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(configData) };

    // MIGRATION: Ensure critical fields exist for old configs
    let migrated = false;
    // Ensure elasticsearchConfig.basePath exists and is a string
    if (!config.elasticsearchConfig || typeof config.elasticsearchConfig !== 'object') {
      config.elasticsearchConfig = { basePath: path.resolve(__dirname, '../../elasticsearch-nodes') };
      migrated = true;
    } else if (!config.elasticsearchConfig.basePath || typeof config.elasticsearchConfig.basePath !== 'string') {
      config.elasticsearchConfig.basePath = path.resolve(__dirname, '../../elasticsearch-nodes');
      migrated = true;
    }
    // Ensure setupWizard.basePath exists and is a string
    if (!config.setupWizard || typeof config.setupWizard !== 'object') {
      config.setupWizard = { basePath: path.resolve(__dirname, '../../elasticsearch-nodes') };
      migrated = true;
    } else if (!config.setupWizard.basePath || typeof config.setupWizard.basePath !== 'string') {
      config.setupWizard.basePath = path.resolve(__dirname, '../../elasticsearch-nodes');
      migrated = true;
    }
    if (migrated) {
      console.log('🔄 Migrated old config.json to add missing elasticsearchConfig/setupWizard basePath.');
      await saveConfig();
    }
    // Check for important fields
    console.log("✅ Configuration loaded from file and contains all critical fields.");
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log("📝 No config file found, creating default configuration");
      await saveConfig();
    } else {
      console.error("❌ Error loading config:", error);
      config = { ...DEFAULT_CONFIG };
      console.warn("⚠️ Falling back to default config. This will not work for node management until you restore config.json!");
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
// Overwrite the entire config file with a new config object
async function setFullConfig(newConfig) {
  try {
    config = { ...newConfig };
    await saveConfig();
    console.log('✅ Full config overwritten.');
  } catch (error) {
    console.error('❌ Error overwriting full config:', error);
    throw error;
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  setFullConfig,
  DEFAULT_CONFIG
};
