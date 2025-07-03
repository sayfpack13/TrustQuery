// Elasticsearch configuration file management
const fs = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
const { getConfig } = require("../config");

// Parse Elasticsearch YAML configuration file
function parseElasticsearchYml(content) {
  const config = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        config[key] = value;
      }
    }
  }
  
  return config;
}

// Read Elasticsearch configuration file
async function readElasticsearchConfig() {
  try {
    const configPath = getConfig('elasticsearchConfig.configFilePath');
    if (!configPath) {
      throw new Error('Elasticsearch config file path not configured');
    }
    
    const configContent = await fs.readFile(configPath, 'utf8');
    return configContent;
  } catch (error) {
    console.error('Error reading Elasticsearch config:', error);
    throw error;
  }
}

// Helper function to backup Elasticsearch configuration
async function backupElasticsearchConfig() {
  try {
    const configPath = getConfig('elasticsearchConfig.configFilePath');
    if (!configPath) {
      throw new Error('Elasticsearch config file path not configured');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.backup.${timestamp}`;
    
    await fs.copyFile(configPath, backupPath);
    console.log(`✅ Elasticsearch config backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Error backing up Elasticsearch config:', error);
    throw error;
  }
}

// Update Elasticsearch configuration file
async function updateElasticsearchConfig(settings) {
  try {
    const configPath = getConfig('elasticsearchConfig.configFilePath');
    if (!configPath) {
      throw new Error('Elasticsearch config file path not configured');
    }
    
    // Create backup if auto-backup is enabled
    if (getConfig('elasticsearchConfig.autoBackup')) {
      await backupElasticsearchConfig();
    }
    
    // Read current config
    const currentContent = await readElasticsearchConfig();
    const currentConfig = parseElasticsearchYml(currentContent);
    
    // Merge with new settings
    const updatedConfig = { ...currentConfig, ...settings };
    
    // Generate new YAML content
    let newContent = '';
    const lines = currentContent.split('\n');
    const processedKeys = new Set();
    
    // Process existing lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          if (updatedConfig.hasOwnProperty(key)) {
            newContent += `${key}: ${updatedConfig[key]}\n`;
            processedKeys.add(key);
          } else {
            newContent += line + '\n';
          }
        } else {
          newContent += line + '\n';
        }
      } else {
        newContent += line + '\n';
      }
    }
    
    // Add new settings that weren't in the original file
    for (const [key, value] of Object.entries(updatedConfig)) {
      if (!processedKeys.has(key)) {
        newContent += `${key}: ${value}\n`;
      }
    }
    
    // Write updated config
    await fs.writeFile(configPath, newContent, 'utf8');
    console.log('✅ Elasticsearch config updated successfully');
    
    return updatedConfig;
  } catch (error) {
    console.error('Error updating Elasticsearch config:', error);
    throw error;
  }
}

// Restart Elasticsearch service
async function restartElasticsearchService() {
  return new Promise((resolve, reject) => {
    const restartCommand = getConfig('elasticsearchConfig.restartCommand');
    if (!restartCommand) {
      reject(new Error('Elasticsearch restart command not configured'));
      return;
    }
    
    console.log(`🔄 Restarting Elasticsearch service with command: ${restartCommand}`);
    
    const [command, ...args] = restartCommand.split(' ');
    const child = spawn(command, args, { shell: true });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Elasticsearch service restarted successfully');
        resolve({ success: true, stdout, stderr });
      } else {
        console.error(`❌ Elasticsearch restart failed with code ${code}`);
        reject(new Error(`Restart failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      console.error('❌ Error starting restart command:', error);
      reject(error);
    });
  });
}

// Validate Elasticsearch configuration
async function validateElasticsearchConfig() {
  try {
    const configPath = getConfig('elasticsearchConfig.configFilePath');
    const dataPath = getConfig('elasticsearchConfig.dataPath');
    const logsPath = getConfig('elasticsearchConfig.logsPath');
    
    const validation = {
      configExists: false,
      dataPathExists: false,
      logsPathExists: false,
      configReadable: false,
      configWritable: false,
      parsedConfig: null,
      issues: []
    };
    
    // Check config file
    if (configPath) {
      try {
        await fs.access(configPath, fs.constants.F_OK);
        validation.configExists = true;
        
        await fs.access(configPath, fs.constants.R_OK);
        validation.configReadable = true;
        
        await fs.access(configPath, fs.constants.W_OK);
        validation.configWritable = true;
        
        // Try to parse config
        const content = await readElasticsearchConfig();
        validation.parsedConfig = parseElasticsearchYml(content);
      } catch (error) {
        validation.issues.push(`Config file issue: ${error.message}`);
      }
    } else {
      validation.issues.push(`Config file path not configured: ${configPath}`);
    }
    
    // Check data path
    if (dataPath) {
      try {
        await fs.access(dataPath, fs.constants.F_OK);
        validation.dataPathExists = true;
      } catch {
        validation.issues.push(`Data path not accessible: ${dataPath}`);
      }
    } else {
      validation.issues.push(`Data path not configured: ${dataPath}`);
    }
    
    // Check logs path
    if (logsPath) {
      try {
        await fs.access(logsPath, fs.constants.F_OK);
        validation.logsPathExists = true;
      } catch {
        validation.issues.push(`Logs path not accessible: ${logsPath}`);
      }
    } else {
      validation.issues.push(`Logs path not configured: ${logsPath}`);
    }
    
    return validation;
  } catch (error) {
    console.error('Error validating Elasticsearch config:', error);
    throw error;
  }
}

module.exports = {
  parseElasticsearchYml,
  readElasticsearchConfig,
  backupElasticsearchConfig,
  updateElasticsearchConfig,
  restartElasticsearchService,
  validateElasticsearchConfig
};
