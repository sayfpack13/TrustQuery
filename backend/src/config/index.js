// Configuration management
const fs = require("fs").promises;
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "../../config.json");

// Default configuration
const DEFAULT_CONFIG = {
  selectedIndex: "accounts",
  searchIndices: ["accounts"], // Default search indices
  elasticsearchNodes: ["http://localhost:9200"],
  writeNode: "http://localhost:9200", // Dedicated write node
  nodeAttributes: {
    defaultDiskType: "ssd",
    defaultZone: "zone1"
  },
  batchSize: 1000,
  minVisibleChars: 2,
  maskingRatio: 0.2,
  usernameMaskingRatio: 0.4,
  // Admin UI settings
  adminSettings: {
    showRawLineByDefault: false
  },
  // Elasticsearch configuration file paths and settings
  elasticsearchConfig: {
    configFilePath: "C:\\elasticsearch\\config\\elasticsearch.yml", // Default Windows path
    dataPath: "C:\\elasticsearch\\data",
    logsPath: "C:\\elasticsearch\\logs",
    jvmOptionsPath: "C:\\elasticsearch\\config\\jvm.options",
    autoBackup: true,
    restartCommand: "net restart elasticsearch", // Windows service restart command
    // Linux alternatives (commented):
    // configFilePath: "/etc/elasticsearch/elasticsearch.yml",
    // restartCommand: "sudo systemctl restart elasticsearch"
  },
  autoRefreshInterval: 30000,
  maxTaskHistory: 100
};

// Configuration state
let config = { ...DEFAULT_CONFIG };

// Load configuration from file
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    const loadedConfig = JSON.parse(configData);
    config = { ...DEFAULT_CONFIG, ...loadedConfig };
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
    throw error; // Re-throw to let caller handle the error
  }
}

// Get configuration value
function getConfig(key) {
  if (!key) return config;
  
  // Handle nested keys like 'elasticsearchConfig.configFilePath'
  if (key.includes('.')) {
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
      value = value[k];
      if (value === undefined) break;
    }
    return value;
  }
  
  return config[key];
}

// Set configuration value
async function setConfig(key, value) {
  try {
    if (typeof key === 'object') {
      // Update multiple values
      config = { ...config, ...key };
    } else {
      // Update single value
      config[key] = value;
    }
    await saveConfig();
  } catch (error) {
    console.error("❌ Error setting config:", error);
    throw error; // Re-throw to let caller handle the error
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  DEFAULT_CONFIG
};
