// Elasticsearch configuration management routes
const express = require("express");
const { verifyJwt } = require("../../middleware/auth");
const { getConfig, setConfig } = require("../../config");
const { createTask, updateTask } = require("../../tasks");
const { 
  validateElasticsearchConfig,
  readElasticsearchConfig,
  parseElasticsearchYml,
  updateElasticsearchConfig,
  restartElasticsearchService
} = require("../../elasticsearch/config");

const router = express.Router();

// GET validate Elasticsearch configuration
router.get("/validate", verifyJwt, async (req, res) => {
  try {
    const validation = await validateElasticsearchConfig();
    res.json(validation);
  } catch (error) {
    console.error("Error validating Elasticsearch config:", error);
    res.status(500).json({ error: "Failed to validate configuration: " + error.message });
  }
});

// GET current Elasticsearch configuration paths
router.get("/paths", verifyJwt, (req, res) => {
  try {
    const paths = getConfig('elasticsearchConfig');
    res.json(paths);
  } catch (error) {
    console.error("Error fetching Elasticsearch config paths:", error);
    res.status(500).json({ error: "Failed to fetch configuration paths" });
  }
});

// POST update Elasticsearch configuration paths
router.post("/paths", verifyJwt, async (req, res) => {
  try {
    const { configFilePath, dataPath, logsPath, jvmOptionsPath, autoBackup, restartCommand } = req.body;

    const updates = {};
    if (configFilePath !== undefined) updates['elasticsearchConfig.configFilePath'] = configFilePath;
    if (dataPath !== undefined) updates['elasticsearchConfig.dataPath'] = dataPath;
    if (logsPath !== undefined) updates['elasticsearchConfig.logsPath'] = logsPath;
    if (jvmOptionsPath !== undefined) updates['elasticsearchConfig.jvmOptionsPath'] = jvmOptionsPath;
    if (autoBackup !== undefined) updates['elasticsearchConfig.autoBackup'] = autoBackup;
    if (restartCommand !== undefined) updates['elasticsearchConfig.restartCommand'] = restartCommand;

    // Update nested config
    const currentConfig = getConfig('elasticsearchConfig');
    const newConfig = { ...currentConfig };
    
    Object.keys(updates).forEach(key => {
      if (key.startsWith('elasticsearchConfig.')) {
        const subKey = key.replace('elasticsearchConfig.', '');
        newConfig[subKey] = updates[key];
      }
    });

    await setConfig('elasticsearchConfig', newConfig);

    res.json({
      message: "Elasticsearch configuration paths updated successfully",
      config: getConfig('elasticsearchConfig')
    });
  } catch (error) {
    console.error("Error updating Elasticsearch config paths:", error);
    res.status(500).json({ error: "Failed to update configuration paths" });
  }
});

// GET current Elasticsearch configuration file content
router.get("/file", verifyJwt, async (req, res) => {
  try {
    const content = await readElasticsearchConfig();
    const parsed = parseElasticsearchYml(content);
    
    res.json({
      rawContent: content,
      parsedConfig: parsed,
      configPath: getConfig('elasticsearchConfig.configFilePath')
    });
  } catch (error) {
    console.error("Error reading Elasticsearch config file:", error);
    res.status(500).json({ error: "Failed to read configuration file: " + error.message });
  }
});

// GET current Elasticsearch configuration settings
router.get("/settings", verifyJwt, async (req, res) => {
  try {
    const content = await readElasticsearchConfig();
    const parsed = parseElasticsearchYml(content);
    
    res.json({
      settings: parsed,
      configPath: getConfig('elasticsearchConfig.configFilePath'),
      lastModified: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error reading Elasticsearch config settings:", error);
    res.status(500).json({ error: "Failed to read configuration settings: " + error.message });
  }
});

// POST update specific Elasticsearch configuration settings
router.post("/settings", verifyJwt, async (req, res) => {
  const { settings, restart } = req.body;
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: "Settings object is required" });
  }
  
  const taskId = createTask("Update Elasticsearch Settings", "initializing");
  res.json({ taskId });

  (async () => {
    try {
      updateTask(taskId, {
        status: "updating config",
        message: "Updating Elasticsearch configuration file..."
      });

      // Update the configuration file
      const updatedConfig = await updateElasticsearchConfig(settings);

      updateTask(taskId, {
        status: "config updated",
        progress: 50,
        total: 100,
        message: "Configuration file updated. Restarting service..."
      });

      // Restart Elasticsearch service if requested
      if (restart) {
        await restartElasticsearchService();
        
        updateTask(taskId, {
          status: "completed",
          progress: 100,
          total: 100,
          completed: true,
          message: "Elasticsearch settings updated and service restarted successfully"
        });
      } else {
        updateTask(taskId, {
          status: "completed",
          progress: 100,
          total: 100,
          completed: true,
          message: "Elasticsearch settings updated (restart required for changes to take effect)"
        });
      }

      console.log(`Task ${taskId} completed: Elasticsearch settings updated`);
    } catch (error) {
      console.error(`Update Elasticsearch settings task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

// POST restart Elasticsearch service
router.post("/restart", verifyJwt, async (req, res) => {
  const taskId = createTask("Restart Elasticsearch", "initializing");
  res.json({ taskId });

  (async () => {
    try {
      updateTask(taskId, {
        status: "restarting",
        message: "Restarting Elasticsearch service..."
      });

      const result = await restartElasticsearchService();

      updateTask(taskId, {
        status: "completed",
        progress: 1,
        total: 1,
        completed: true,
        message: "Elasticsearch service restarted successfully"
      });
      console.log(`Task ${taskId} completed: Elasticsearch service restarted`);
    } catch (error) {
      console.error(`Restart Elasticsearch task ${taskId} failed:`, error);
      updateTask(taskId, {
        status: "error",
        error: error.message,
        completed: true,
      });
    }
  })();
});

module.exports = router;
