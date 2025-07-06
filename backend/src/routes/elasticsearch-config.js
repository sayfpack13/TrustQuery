const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getConfig, setConfig } = require('../config');
const { getES } = require('../elasticsearch/client');
const { createTask, updateTask } = require('../tasks');
const { verifyJwt } = require('../middleware/auth');

const execAsync = promisify(exec);

// Validate Elasticsearch configuration
router.get('/validate', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    const esConfig = config.elasticsearchConfig || {};
    
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      configFilePath: esConfig.configFilePath || null,
      dataPath: esConfig.dataPath || null,
      logsPath: esConfig.logsPath || null,
      jvmOptionsPath: esConfig.jvmOptionsPath || null,
      restartCommand: esConfig.restartCommand || null,
      // Frontend compatibility properties
      configExists: false,
      configWritable: false,
      dataPathExists: false,
      logsPathExists: false,
      parsedConfig: null,
      issues: []
    };

    // Check if config file exists and is writable
    if (esConfig.configFilePath) {
      validation.configExists = fs.existsSync(esConfig.configFilePath);
      if (validation.configExists) {
        try {
          // Test if file is writable by checking access
          fs.accessSync(esConfig.configFilePath, fs.constants.W_OK);
          validation.configWritable = true;
          
          // Try to parse the config file
          const content = fs.readFileSync(esConfig.configFilePath, 'utf8');
          validation.parsedConfig = yaml.load(content);
        } catch (error) {
          validation.configWritable = false;
          validation.warnings.push(`Configuration file is not writable: ${error.message}`);
        }
      } else {
        validation.valid = false;
        validation.errors.push(`Configuration file not found: ${esConfig.configFilePath}`);
      }
    }

    // Check if data directory exists
    if (esConfig.dataPath) {
      validation.dataPathExists = fs.existsSync(esConfig.dataPath);
      if (!validation.dataPathExists) {
        validation.warnings.push(`Data directory not found: ${esConfig.dataPath}`);
      }
    }

    // Check if logs directory exists
    if (esConfig.logsPath) {
      validation.logsPathExists = fs.existsSync(esConfig.logsPath);
      if (!validation.logsPathExists) {
        validation.warnings.push(`Logs directory not found: ${esConfig.logsPath}`);
      }
    }

    // Check if JVM options file exists
    if (esConfig.jvmOptionsPath && !fs.existsSync(esConfig.jvmOptionsPath)) {
      validation.warnings.push(`JVM options file not found: ${esConfig.jvmOptionsPath}`);
    }

    // Test Elasticsearch connection
    try {
      const es = getES();
      const health = await es.cluster.health();
      validation.connectionStatus = 'connected';
      validation.clusterHealth = health.status;
    } catch (error) {
      validation.connectionStatus = 'disconnected';
      validation.warnings.push(`Cannot connect to Elasticsearch: ${error.message}`);
    }

    // Combine errors and warnings into issues array for frontend compatibility
    validation.issues = [...validation.errors, ...validation.warnings];

    res.json(validation);
  } catch (error) {
    console.error('Error validating ES config:', error);
    res.status(500).json({
      error: 'Failed to validate Elasticsearch configuration',
      details: error.message
    });
  }
});

// Get Elasticsearch configuration paths
router.get('/paths', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    const esConfig = config.elasticsearchConfig || {};
    
    res.json({
      configFilePath: esConfig.configFilePath || '',
      dataPath: esConfig.dataPath || '',
      logsPath: esConfig.logsPath || '',
      jvmOptionsPath: esConfig.jvmOptionsPath || '',
      restartCommand: esConfig.restartCommand || '',
      autoBackup: esConfig.autoBackup || false
    });
  } catch (error) {
    console.error('Error getting ES config paths:', error);
    res.status(500).json({
      error: 'Failed to get configuration paths',
      details: error.message
    });
  }
});

// Update Elasticsearch configuration paths
router.post('/paths', verifyJwt, async (req, res) => {
  try {
    const { configFilePath, dataPath, logsPath, jvmOptionsPath, restartCommand, autoBackup } = req.body;
    
    const config = getConfig();
    const updatedConfig = {
      ...config,
      elasticsearchConfig: {
        ...config.elasticsearchConfig,
        configFilePath: configFilePath || '',
        dataPath: dataPath || '',
        logsPath: logsPath || '',
        jvmOptionsPath: jvmOptionsPath || '',
        restartCommand: restartCommand || '',
        autoBackup: autoBackup || false
      }
    };
    
    await setConfig(updatedConfig);
    
    res.json({
      message: 'Configuration paths updated successfully',
      elasticsearchConfig: updatedConfig.elasticsearchConfig
    });
  } catch (error) {
    console.error('Error updating ES config paths:', error);
    res.status(500).json({
      error: 'Failed to update configuration paths',
      details: error.message
    });
  }
});

// Get Elasticsearch configuration file content
router.get('/file', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    const esConfig = config.elasticsearchConfig || {};
    
    if (!esConfig.configFilePath) {
      return res.status(400).json({
        error: 'Elasticsearch configuration path not set'
      });
    }

    if (!fs.existsSync(esConfig.configFilePath)) {
      return res.status(404).json({
        error: 'Elasticsearch configuration file not found'
      });
    }

    const content = fs.readFileSync(esConfig.configFilePath, 'utf8');
    let parsedConfig = null;
    
    try {
      // Try to parse as YAML
      parsedConfig = yaml.load(content);
    } catch (parseError) {
      console.warn('Could not parse config as YAML:', parseError.message);
    }

    res.json({
      configPath: esConfig.configFilePath,
      rawContent: content,
      parsedConfig: parsedConfig,
      lastModified: fs.statSync(esConfig.configFilePath).mtime
    });
  } catch (error) {
    console.error('Error reading ES config file:', error);
    res.status(500).json({
      error: 'Failed to read configuration file',
      details: error.message
    });
  }
});

// Update Elasticsearch configuration settings
router.post('/settings', verifyJwt, async (req, res) => {
  try {
    const { settings, restart = false } = req.body;
    const config = getConfig();
    const esConfig = config.elasticsearchConfig || {};
    
    if (!esConfig.configFilePath) {
      return res.status(400).json({
        error: 'Elasticsearch configuration path not set'
      });
    }

    // Create backup of current config if auto backup is enabled
    let backupPath = null;
    if (esConfig.autoBackup && fs.existsSync(esConfig.configFilePath)) {
      backupPath = `${esConfig.configFilePath}.backup.${Date.now()}`;
      fs.copyFileSync(esConfig.configFilePath, backupPath);
    }

    try {
      // Write new configuration
      const yamlContent = yaml.dump(settings, { indent: 2 });
      fs.writeFileSync(esConfig.configFilePath, yamlContent, 'utf8');
      
      let taskId = null;
      if (restart) {
        // If restart is requested, create a task for it
        taskId = `restart-es-${Date.now()}`;
        // Execute restart command asynchronously
        const restartCommand = esConfig.restartCommand || 'net restart elasticsearch';
        execAsync(restartCommand)
          .then(() => {
            console.log('Elasticsearch service restarted successfully');
          })
          .catch((error) => {
            console.error(`Failed to restart Elasticsearch service: ${error.message}`);
          });
      }

      res.json({
        message: 'Configuration updated successfully',
        backupPath: backupPath,
        taskId: taskId
      });
    } catch (writeError) {
      // Restore backup if write failed and backup exists
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, esConfig.configFilePath);
      }
      throw writeError;
    }
  } catch (error) {
    console.error('Error updating ES config settings:', error);
    res.status(500).json({
      error: 'Failed to update configuration settings',
      details: error.message
    });
  }
});

// Restart Elasticsearch service
router.post('/restart', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    const esConfig = config.elasticsearchConfig || {};
    const restartCommand = esConfig.restartCommand || 'net restart elasticsearch';
    
    // Create a task ID for tracking
    const taskId = `restart-es-${Date.now()}`;
    
    // Execute restart command asynchronously
    execAsync(restartCommand)
      .then(() => {
        console.log('Elasticsearch service restarted successfully');
      })
      .catch((error) => {
        console.error(`Failed to restart Elasticsearch service: ${error.message}`);
      });

    res.json({
      message: 'Elasticsearch service restart initiated',
      taskId: taskId,
      command: restartCommand
    });
  } catch (error) {
    console.error('Error restarting ES service:', error);
    res.status(500).json({
      error: 'Failed to restart Elasticsearch service',
      details: error.message
    });
  }
});


// Get only the Elasticsearch base path
router.get('/base-path', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    // Try to get a single base path property, or infer from configFilePath/dataPath/logsPath
    let basePath = '';
    if (config.elasticsearchConfig && config.elasticsearchConfig.basePath) {
      basePath = config.elasticsearchConfig.basePath;
    } else {
      // Try to infer from configFilePath, dataPath, or logsPath
      const esConfig = config.elasticsearchConfig || {};
      const pathsToCheck = [esConfig.configFilePath, esConfig.dataPath, esConfig.logsPath];
      for (const p of pathsToCheck) {
        if (typeof p === 'string' && p) {
          // Remove known subfolders (bin, config, data, logs, nodes, etc.)
          const match = p.match(/^(.*?)(\\|\/)(bin|config|data|logs|nodes)(\\|\/|$)/i);
          if (match) {
            basePath = match[1];
            break;
          } else {
            // Fallback: use parent directory
            basePath = require('path').dirname(p);
            break;
          }
        }
      }
    }
    res.json({ basePath });
  } catch (error) {
    console.error('Error getting Elasticsearch base path:', error);
    res.status(500).json({
      error: 'Failed to get Elasticsearch base path',
      details: error.message
    });
  }
});

module.exports = router;
