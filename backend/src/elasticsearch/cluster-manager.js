// Elasticsearch Cluster Management System
const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const { getConfig, setConfig } = require('../config');
const yaml = require('yaml');

class ElasticsearchClusterManager {
  constructor() {
    this.baseElasticsearchPath = 'C:\\elasticsearch'; // Default path
    this.javaPath = 'java'; // Assumes Java is in PATH
  }

  /**
   * Initialize cluster management system
   */
  async initialize() {
    try {
      // Check if Elasticsearch is installed
      const esExists = await this.checkElasticsearchInstallation();
      if (!esExists) {
        throw new Error('Elasticsearch installation not found. Please install Elasticsearch first.');
      }

      // Create base directories
      await this.createBaseDirectories();
      
      console.log('✅ Elasticsearch Cluster Manager initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize cluster manager:', error);
      throw error;
    }
  }

  /**
   * Check if Elasticsearch is installed
   */
  async checkElasticsearchInstallation() {
    try {
      const elasticsearchBin = path.join(this.baseElasticsearchPath, 'bin', 'elasticsearch.bat');
      await fs.access(elasticsearchBin);
      return true;
    } catch (error) {
      console.warn('Elasticsearch not found at default location');
      return false;
    }
  }

  /**
   * Create base directories for cluster
   */
  async createBaseDirectories() {
    const baseDirs = [
      path.join(this.baseElasticsearchPath, 'nodes'),     // New organized structure
      path.join(this.baseElasticsearchPath, 'data'),      // Legacy fallback
      path.join(this.baseElasticsearchPath, 'logs'),      // Legacy fallback  
      path.join(this.baseElasticsearchPath, 'config')     // Legacy fallback
    ];

    for (const dir of baseDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.error(`Failed to create directory ${dir}:`, error);
        }
      }
    }
  }

  /**
   * Generate Elasticsearch configuration for a node
   */
  generateNodeConfig(nodeConfig) {
    const config = `# Elasticsearch Configuration for ${nodeConfig.name}
# Generated automatically by TrustQuery

# Cluster settings
cluster.name: ${nodeConfig.clusterName || 'trustquery-cluster'}
node.name: ${nodeConfig.name}

# Network settings
network.host: ${nodeConfig.host || 'localhost'}
http.port: ${nodeConfig.port || 9200}
transport.port: ${nodeConfig.transportPort || 9300}

# Path settings
path.data: ${nodeConfig.dataPath}
path.logs: ${nodeConfig.logsPath}

# Node roles
node.roles: [${this.formatNodeRoles(nodeConfig.roles)}]

# Custom attribute for shard allocation
node.attr.custom_id: ${nodeConfig.name}

# Discovery settings
discovery.type: single-node

# Memory settings
bootstrap.memory_lock: false

# Security settings (basic)
xpack.security.enabled: false
xpack.security.transport.ssl.enabled: false
xpack.security.http.ssl.enabled: false

`;

    return config;
  }

  /**
   * Format node roles for configuration
   */
  formatNodeRoles(roles) {
    const roleList = [];
    if (roles.master) roleList.push('master');
    if (roles.data) roleList.push('data');
    if (roles.ingest) roleList.push('ingest');
    return roleList.join(', ');
  }

  /**
   * Create a new Elasticsearch node
   */
  async createNode(nodeConfig) {
    try {
      const {
        name,
        host = 'localhost',
        port = 9200,
        transportPort = 9300,
        dataPath,
        logsPath,
        roles = { master: true, data: true, ingest: true },
        clusterName = 'trustquery-cluster'
      } = nodeConfig;

      // Validate required fields - use provided paths or generate default ones
      if (!name) {
        throw new Error('Node name is required');
      }

      // Use provided paths or generate default ones under base path
      const nodeBaseDir = path.join(this.baseElasticsearchPath, 'nodes', name);
      const finalDataPath = dataPath || path.join(nodeBaseDir, 'data');
      const finalLogsPath = logsPath || path.join(nodeBaseDir, 'logs');

      // Create node-specific directories
      await fs.mkdir(finalDataPath, { recursive: true });
      await fs.mkdir(finalLogsPath, { recursive: true });

      // Create node configuration directory
      const nodeConfigDir = path.join(nodeBaseDir, 'config');
      await fs.mkdir(nodeConfigDir, { recursive: true });

      // Generate and save node configuration
      const configContent = this.generateNodeConfig({
        name,
        host,
        port,
        transportPort,
        dataPath: finalDataPath,
        logsPath: finalLogsPath,
        roles,
        clusterName
      });

      const configPath = path.join(nodeConfigDir, 'elasticsearch.yml');
      await fs.writeFile(configPath, configContent);

      // Create JVM options file
      const jvmOptions = this.generateJVMOptions();
      const jvmPath = path.join(nodeConfigDir, 'jvm.options');
      await fs.writeFile(jvmPath, jvmOptions);

      // Create log4j2.properties file (IMPORTANT - this was missing!)
      const log4j2Config = this.generateLog4j2Config(finalLogsPath);
      const log4j2Path = path.join(nodeConfigDir, 'log4j2.properties');
      await fs.writeFile(log4j2Path, log4j2Config);

      // Create Windows service script
      const serviceScript = this.generateServiceScript(name, nodeConfigDir, port);
      const servicePath = path.join(nodeConfigDir, 'start-node.bat');
      await fs.writeFile(servicePath, serviceScript);

      console.log(`✅ Created node configuration: ${name}`);

      const nodeUrl = `http://${host}:${port}`;
      const newNodeMetadata = {
        [nodeUrl]: {
          name,
          dataPath: finalDataPath,
          logsPath: finalLogsPath,
          clusterName,
          port
        }
      };

      // Save metadata to config
      const currentConfig = getConfig();
      const updatedMetadata = { ...currentConfig.nodeMetadata, ...newNodeMetadata };
      setConfig('nodeMetadata', updatedMetadata);
      
      return {
        name,
        configPath,
        servicePath,
        dataPath: finalDataPath,
        logsPath: finalLogsPath,
        port,
        transportPort,
        nodeUrl
      };
    } catch (error) {
      console.error(`❌ Failed to create node ${nodeConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Generate JVM options for node
   */
  generateJVMOptions() {
    return `# JVM Options for Elasticsearch Node

# Heap size (adjust based on your system)
-Xms1g
-Xmx1g

# GC Settings
-XX:+UseG1GC
-XX:G1HeapRegionSize=4m
-XX:+UnlockExperimentalVMOptions
-XX:+UseG1GC
-XX:+DisableExplicitGC

# Memory
-Djava.io.tmpdir=\${ES_TMPDIR}
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=data
-XX:ErrorFile=logs/hs_err_pid%p.log

# Disable JVM features
-XX:+UnlockDiagnosticVMOptions
-XX:+DebugNonSafepoints

# Locale
-Dfile.encoding=UTF-8
-Duser.timezone=UTC
-Djava.locale.providers=SPI,JRE
`;
  }

  /**
   * Generate log4j2.properties configuration
   */
  generateLog4j2Config(logsPath) {
    // Convert Windows path to forward slashes for log4j2
    const logPath = logsPath.replace(/\\/g, '/');
    
    return `# Log4j2 Configuration for Elasticsearch Node

status = error
name = ESJsonLayout

# Console appender
appender.console.type = Console
appender.console.name = console
appender.console.layout.type = PatternLayout
appender.console.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %m%n

# Rolling file appender for main log
appender.rolling.type = RollingFile
appender.rolling.name = rolling
appender.rolling.fileName = ${logPath}/elasticsearch.log
appender.rolling.filePattern = ${logPath}/elasticsearch-%i.log.gz
appender.rolling.layout.type = PatternLayout
appender.rolling.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %m%n
appender.rolling.policies.type = Policies
appender.rolling.policies.size.type = SizeBasedTriggeringPolicy
appender.rolling.policies.size.size = 128MB
appender.rolling.strategy.type = DefaultRolloverStrategy
appender.rolling.strategy.max = 32

# Root logger
rootLogger.level = info
rootLogger.appenderRef.console.ref = console
rootLogger.appenderRef.rolling.ref = rolling

# Elasticsearch loggers
logger.deprecation.name = org.elasticsearch.deprecation
logger.deprecation.level = warn

logger.index_search_slowlog_rolling.name = index.search.slowlog
logger.index_search_slowlog_rolling.level = trace
logger.index_search_slowlog_rolling.additivity = false

logger.index_indexing_slowlog.name = index.indexing.slowlog
logger.index_indexing_slowlog.level = trace
logger.index_indexing_slowlog.additivity = false

# Suppress noisy loggers
logger.apache_http_client.name = org.apache.http
logger.apache_http_client.level = warn

logger.netty.name = io.netty
logger.netty.level = warn
`;
  }

  /**
   * Generate Windows service script
   */
  generateServiceScript(nodeName, configDir, port) {
    return `@echo off
REM Start Elasticsearch Node: ${nodeName}
REM Port: ${port}

echo Starting Elasticsearch node: ${nodeName}
echo Config directory: ${configDir}
echo Port: ${port}

REM Set environment variables
set ES_HOME=${this.baseElasticsearchPath}
set ES_PATH_CONF=${configDir}
set ES_JAVA_OPTS=-Xms1g -Xmx1g

REM Start Elasticsearch
"%ES_HOME%\\bin\\elasticsearch.bat"
`;
  }

  /**
   * Start an Elasticsearch node
   */
  async startNode(nodeName) {
    try {
      // Get the correct service path from metadata
      const metadata = this.getNodeMetadata(nodeName);
      let servicePath;
      
      if (metadata && metadata.servicePath) {
        servicePath = metadata.servicePath;
        console.log(`🔍 Using service path from metadata: ${servicePath}`);
      } else {
        // Fallback to new organized path structure
        servicePath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'start-node.bat');
        console.log(`🔍 Using new organized service path: ${servicePath}`);
      }
      
      // Verify the service file exists
      try {
        await fs.access(servicePath);
        console.log(`✅ Service file found: ${servicePath}`);
      } catch (error) {
        throw new Error(`Service file not found: ${servicePath}. Error: ${error.message}`);
      }
      
      // Get node config early to have access to paths
      const nodeConfig = await this.getNodeConfig(nodeName);

      // Create a log file for startup output in the correct logs directory
      const logDir = (await this.getNodeMetadata(nodeName)).logsPath;
      await fs.mkdir(logDir, { recursive: true });
        const startupLogPath = path.join(logDir, 'startup.log');
        const output = await fs.open(startupLogPath, 'a');

        console.log(`🚀 Starting node ${nodeName} using: ${servicePath}`);
        console.log(`📁 Logs will be written to: ${startupLogPath}`);
        console.log(`🔧 Node will run on port: ${nodeConfig.http.port}`);

        // This simpler spawn is more reliable on Windows
        const child = spawn(servicePath, [], {
        detached: true,
            stdio: ['ignore', output, output], // Redirect stdout and stderr to the log file
            shell: true,
            windowsHide: true,
      });
      
      // Log child process information
      console.log(`🆔 Child process spawned with PID: ${child.pid}`);
      
      child.unref();
      
        console.log(`🚀 Start command issued for ${nodeName}. Tailing startup log at: ${startupLogPath}`);

        // Give Elasticsearch more time to initialize before we start checking
        console.log(`⏳ Waiting 10 seconds for Elasticsearch to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); 

        // Find the real PID by polling the port
        const port = nodeConfig.http.port;
        if (!port) {
            throw new Error(`Could not determine port for node ${nodeName}.`);
        }

        console.log(`🔍 Checking for process on port ${port}...`);
        const pid = await this.findPidByPort(port);
        if (pid) {
            // Get the config directory from the service path or metadata
            let nodeConfigDir;
            if (metadata && metadata.configPath) {
              nodeConfigDir = path.dirname(metadata.configPath);
            } else {
              // Use new organized path structure
              nodeConfigDir = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config');
            }
            
            const pidFilePath = path.join(nodeConfigDir, 'pid.json');
            await fs.writeFile(pidFilePath, JSON.stringify({ pid }), 'utf8');
            console.log(`✅ Started Elasticsearch node: ${nodeName} with PID: ${pid} on port ${port}`);
            
            // Re-initialize clients so the app can connect
            const { initializeElasticsearchClients } = require('./client');
            initializeElasticsearchClients();

            // Refresh indices cache after successful node start
            try {
              const { refreshCache, syncSearchIndices } = require('../cache/indices-cache');
              const { getConfig } = require('../config');
              const config = getConfig();
              await refreshCache(config);
              await syncSearchIndices(config);
              console.log(`🔄 Persistent indices cache and searchIndices synchronized after starting node ${nodeName}`);
            } catch (cacheError) {
              console.warn(`⚠️ Failed to refresh persistent indices cache after starting node ${nodeName}:`, cacheError.message);
              // Don't fail the node start if cache refresh fails
            }

            // Close the file handle
            await output.close();
            return { success: true, pid };
        } else {
            // Close the file handle before reading
            await output.close();
            // If the process isn't found, read the startup log to provide more context
            console.log(`📋 Reading startup log for debugging...`);
            const startupLog = await fs.readFile(startupLogPath, 'utf8').catch(() => "Could not read startup.log.");

            // Also, try to read the actual Elasticsearch log file for more detailed errors.
            const esLogPath = path.join(nodeConfig.path.logs, 'elasticsearch.log');
            console.log(`📋 Reading elasticsearch log for debugging...`);
            const esLog = await fs.readFile(esLogPath, 'utf8').catch(() => "Could not read elasticsearch.log.");

            console.log(`📋 Startup Log Content:\n${startupLog.slice(-1000)}`); // Last 1000 chars
            console.log(`📋 Elasticsearch Log Content:\n${esLog.slice(-1000)}`); // Last 1000 chars

            throw new Error(`Failed to confirm node start for ${nodeName}. Could not find process on port ${port}.\n\nLast 1000 chars of Startup Log:\n${startupLog.slice(-1000)}\n\nLast 1000 chars of Elasticsearch Log:\n${esLog.slice(-1000)}`);
        }

    } catch (error) {
      console.error(`❌ Failed to start node ${nodeName}:`, error);
      throw error;
    }
  }

  /**
   * Stop an Elasticsearch node
   */
  async stopNode(nodeName) {
    try {
      // Get the correct PID file path from metadata
      const metadata = this.getNodeMetadata(nodeName);
      let pidFilePath;
      
      if (metadata && metadata.configPath) {
        const configDir = path.dirname(metadata.configPath);
        pidFilePath = path.join(configDir, 'pid.json');
      } else {
        // Fallback to new organized path structure
        pidFilePath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'pid.json');
      }
      
      console.log(`🔍 Looking for PID file at: ${pidFilePath}`);
      
      try {
        const pidData = await fs.readFile(pidFilePath, 'utf8');
        const { pid } = JSON.parse(pidData);

        if (pid) {
          console.log(`🔌 Attempting to stop node ${nodeName} with PID: ${pid}`);
          
          // Check if process is actually running first
          try {
            execSync(`tasklist /FI "PID eq ${pid}" | find "${pid}"`, { stdio: 'ignore' });
            console.log(`✅ Process ${pid} is running, proceeding to stop it`);
          } catch (checkError) {
            console.log(`ℹ️ Process ${pid} is not running, no need to stop`);
            // Clean up PID file and return
            try {
              await fs.unlink(pidFilePath);
            } catch (unlinkError) {
              // Ignore if PID file doesn't exist
            }
            return { success: true };
          }
          
          // Forcefully kill the process on Windows and wait for completion
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', timeout: 10000 });
            console.log(`✅ Successfully terminated process ${pid}`);
            
            // Wait a moment for the process to fully terminate
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Verify the process is actually gone
            try {
              execSync(`tasklist /FI "PID eq ${pid}" | find "${pid}"`, { stdio: 'ignore' });
              console.warn(`⚠️ Process ${pid} still running after kill command`);
            } catch (verifyError) {
              console.log(`✅ Process ${pid} confirmed terminated`);
            }
            
          } catch (killError) {
            if (killError.status === 128) {
              // Process not found - already stopped
              console.log(`ℹ️ Process ${pid} not found during kill - already stopped`);
            } else {
              console.warn(`⚠️ Error killing process ${pid}:`, killError.message);
              throw killError;
            }
          }
        }
      
        // Clean up the PID file
        try {
          await fs.unlink(pidFilePath);
          console.log(`🗑️ Cleaned up PID file: ${pidFilePath}`);
        } catch (unlinkError) {
          console.warn(`⚠️ Could not remove PID file: ${unlinkError.message}`);
        }
        
        console.log(`🛑 Stopped Elasticsearch node: ${nodeName}`);
        return { success: true };

      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`PID file not found for node ${nodeName}. It might already be stopped.`);
          // If the PID file doesn't exist, we can assume the node is not running.
          return { success: true };
        }
        console.error(`❌ Error stopping node ${nodeName}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`❌ Failed to stop node ${nodeName}:`, error);
      throw error;
    }
  }

  /**
   * Get node configuration
   */
  async getNodeConfig(nodeName) {
    // First try to get the config path from metadata
    const metadata = this.getNodeMetadata(nodeName);
    let configPath;
    
    if (metadata && metadata.configPath) {
      configPath = metadata.configPath;
      console.log(`🔍 Using config path from metadata: ${configPath}`);
    } else {
      // Fallback to new organized path structure
      configPath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'elasticsearch.yml');
      console.log(`🔍 Using new organized config path: ${configPath}`);
    }
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const flatConfig = yaml.parse(configContent);

      // Transform flat config (e.g., 'node.name') into a nested object
      const nestedConfig = {
        cluster: {
          name: flatConfig['cluster.name'] || 'default-cluster'
        },
        node: {
          name: flatConfig['node.name'] || nodeName
        },
        network: {
          host: flatConfig['network.host'] || 'localhost'
        },
        http: {
          port: flatConfig['http.port'] || '9200'
        },
        transport: {
          port: flatConfig['transport.port'] || '9300'
        },
        path: {
          data: flatConfig['path.data'],
          logs: flatConfig['path.logs']
          }
      };
      return nestedConfig;

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Configuration file not found for ${nodeName}. Returning default.`);
        // Return a default nested structure
        return {
          cluster: { name: 'default-cluster' },
          node: { name: nodeName },
          network: { host: 'localhost' },
          http: { port: '9200' },
          transport: { port: '9300' },
          path: { data: '', logs: '' }
        };
      }
      throw error;
    }
  }

  /**
   * List all configured nodes
   */
  async listNodes() {
    const nodesDir = path.join(this.baseElasticsearchPath, 'nodes');
    const nodes = [];

    try {
        // Create nodes directory if it doesn't exist
        await fs.mkdir(nodesDir, { recursive: true });
        
        const nodeDirs = await fs.readdir(nodesDir, { withFileTypes: true });
        // Reduced logging - only log when in debug mode or if there are issues

        for (const dirent of nodeDirs) {
            if (dirent.isDirectory()) {
                const nodeDirName = dirent.name;
                // Reduced logging for normal operations
                
                try {
                    const config = await this.getNodeConfig(nodeDirName);

                    // The true name comes from the config file itself.
                    const definitiveNodeName = config.node.name;
                    // Only log significant events, not every node discovery
                    
                    const metadata = this.getNodeMetadata(definitiveNodeName);
            
                    nodes.push({
                        name: definitiveNodeName,
                        cluster: config.cluster.name,
                        host: config.network.host,
                        port: config.http.port,
                        transportPort: config.transport.port,
                        roles: config.node.roles || { master: true, data: true, ingest: true },
                        isRunning: await this.isNodeRunning(definitiveNodeName),
                        dataPath: metadata.dataPath,
                        logsPath: metadata.logsPath,
                    });
                } catch (configError) {
                    console.warn(`⚠️ Skipping node directory ${nodeDirName}: ${configError.message}`);
                }
            }
        }
        
        // Only log summary when nodes are found, reduce spam
        if (nodes.length > 0) {
            console.log(`✅ Listed ${nodes.length} nodes from directory structure`);
        }
        return nodes;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Nodes directory not found at ${nodesDir}, returning no nodes.`);
            return [];
        }
        console.error('❌ Failed to list nodes:', error);
        return [];
    }
  }

  /**
   * Helper to get metadata from config.json (which is now less important but useful for paths)
   */
  getNodeMetadata(nodeName) {
    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    // Find the metadata by iterating through the values
    const metadata = Object.values(nodeMetadata).find(m => m.name === nodeName);

    if (metadata) {
        return metadata;
    }
    
    // Return default paths using new organized structure if not in metadata
    const nodeBaseDir = path.join(this.baseElasticsearchPath, 'nodes', nodeName);
    return {
        dataPath: path.join(nodeBaseDir, 'data'),
        logsPath: path.join(nodeBaseDir, 'logs'),
        configPath: path.join(nodeBaseDir, 'config', 'elasticsearch.yml'),
        servicePath: path.join(nodeBaseDir, 'config', 'start-node.bat'),
    };
  }

  /**
   * Get the content of a node's configuration file.
   */
  async getNodeConfigContent(nodeName) {
    // Get the correct config path from metadata
    const metadata = this.getNodeMetadata(nodeName);
    let configPath;
    
    if (metadata && metadata.configPath) {
      configPath = metadata.configPath;
    } else {
      // Fallback to new organized path structure
      configPath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'elasticsearch.yml');
    }
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      return configContent;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found for node ${nodeName}.`);
      }
      throw error;
    }
  }

  /**
   * Remove a node configuration
   */
  async removeNode(nodeName) {
    let wasRunning = false;
    try {
      console.log(`🗑️ Starting removal process for node: ${nodeName}`);
      
      // Check if node is running and stop it first
      wasRunning = await this.isNodeRunning(nodeName);
      if (wasRunning) {
        console.log(`🛑 Node ${nodeName} is running, stopping it first...`);
        try {
          await this.stopNode(nodeName);
          
          // Wait a moment and verify it's actually stopped
          await new Promise(resolve => setTimeout(resolve, 3000));
          const stillRunning = await this.isNodeRunning(nodeName);
          if (stillRunning) {
            throw new Error(`Node ${nodeName} is still running after stop attempt`);
          }
          console.log(`✅ Node ${nodeName} successfully stopped`);
        } catch (stopError) {
          console.error(`❌ Failed to stop node ${nodeName}:`, stopError.message);
          throw new Error(`Cannot delete running node ${nodeName}. Stop failed: ${stopError.message}`);
        }
      } else {
        console.log(`✅ Node ${nodeName} is not running, proceeding with deletion`);
      }
      
      const { getConfig, setConfig } = require('../config');
      const config = getConfig();
      const nodeMetadata = config.nodeMetadata || {};
      
      // Find metadata by node name to get data/log paths
      const metadata = Object.values(nodeMetadata).find(m => m.name === nodeName);
      
      if (metadata) {
        console.log(`🔍 Found metadata for node ${nodeName}:`);
        console.log(`   - Data path: ${metadata.dataPath}`);
        console.log(`   - Logs path: ${metadata.logsPath}`);
        console.log(`   - Config path: ${metadata.configPath}`);
        console.log(`   - Service path: ${metadata.servicePath}`);
        console.log(`🗑️ Removing data and logs directories...`);
        
        // Remove data and logs directories specifically
        for (const dirPath of [metadata.dataPath, metadata.logsPath]) {
          if (dirPath) {
            try {
              await fs.rm(dirPath, { recursive: true, force: true });
              console.log(`🗑️ Removed directory: ${dirPath}`);
          } catch (dirError) {
              if (dirError.code !== 'ENOENT') {
                console.warn(`⚠️ Could not remove directory ${dirPath}: ${dirError.message}`);
              } else {
                console.log(`ℹ️ Directory already removed or doesn't exist: ${dirPath}`);
              }
            }
          }
        }
        
        // Remove config directory if it exists
        if (metadata.configPath) {
          const configDir = path.dirname(metadata.configPath);
          try {
            await fs.rm(configDir, { recursive: true, force: true });
            console.log(`🗑️ Removed config directory: ${configDir}`);
          } catch (dirError) {
            if (dirError.code !== 'ENOENT') {
              console.warn(`⚠️ Could not remove config directory ${configDir}: ${dirError.message}`);
            } else {
              console.log(`ℹ️ Config directory already removed or doesn't exist: ${configDir}`);
            }
          }
        }
        
        // Attempt to remove the parent directory, e.g., C:\elasticsearch\test, if it's now empty.
        const parentDir = path.dirname(metadata.dataPath);
        try {
            const files = await fs.readdir(parentDir);
            if (files.length === 0) {
                await fs.rmdir(parentDir);
                console.log(`🗑️ Removed empty parent directory: ${parentDir}`);
            } else {
                console.log(`ℹ️ Parent directory not empty, keeping: ${parentDir} (contains ${files.length} items)`);
            }
        } catch (e) {
            // Ignore if it fails (e.g., not empty, permissions, etc.)
            console.log(`ℹ️ Could not check/remove parent directory ${parentDir}: ${e.message}`);
        }

      } else {
        console.warn(`⚠️ No metadata found for node ${nodeName}. Will attempt to remove from new directory structure.`);
        
        // Use new organized structure as fallback
        const nodeBaseDir = path.join(this.baseElasticsearchPath, 'nodes', nodeName);
        try {
          await fs.rm(nodeBaseDir, { recursive: true, force: true });
          console.log(`🗑️ Removed node directory: ${nodeBaseDir}`);
        } catch (dirError) {
          if (dirError.code !== 'ENOENT') {
            console.warn(`⚠️ Could not remove node directory ${nodeBaseDir}: ${dirError.message}`);
          }
        }
      }
      
      // Also try to remove from new organized structure if metadata exists
      if (metadata) {
        const nodeBaseDir = path.join(this.baseElasticsearchPath, 'nodes', nodeName);
        try {
          await fs.rm(nodeBaseDir, { recursive: true, force: true });
          console.log(`🗑️ Removed organized node directory: ${nodeBaseDir}`);
        } catch (dirError) {
          if (dirError.code !== 'ENOENT') {
            console.warn(`⚠️ Could not remove organized node directory: ${dirError.message}`);
          }
        }
      }
      
      // Legacy cleanup - remove old config directory if it exists
      const oldNodeConfigDir = path.join(this.baseElasticsearchPath, 'config', nodeName);
      try {
        await fs.rm(oldNodeConfigDir, { recursive: true, force: true });
        console.log(`🗑️ Removed legacy node configuration directory: ${oldNodeConfigDir}`);
      } catch (dirError) {
        if (dirError.code !== 'ENOENT') {
          console.warn(`⚠️ Could not remove legacy node configuration directory:`, dirError.message);
        }
      }
      
      // Clean up the metadata from the config file
      const nodeUrlToDelete = Object.keys(nodeMetadata).find(url => nodeMetadata[url].name === nodeName);
      if (nodeUrlToDelete) {
        const newMeta = { ...config.nodeMetadata };
        delete newMeta[nodeUrlToDelete];
        await setConfig('nodeMetadata', newMeta);
        console.log(`✅ Removed metadata for ${nodeName} from configuration.`);
      }
      
      console.log(`✅ Node ${nodeName} removal completed successfully`);
      return { 
        success: true, 
        message: `Node "${nodeName}" stopped and removed successfully`,
        wasRunning: wasRunning,
        metadataRemoved: !!nodeUrlToDelete
      };
    } catch (error) {
      console.error(`❌ Failed to remove node ${nodeName}:`, error);
      throw error;
    }
  }

  /**
   * Get cluster status
   */
  async getClusterStatus() {
    try {
      const nodes = await this.listNodes();
      const runningNodes = [];
      
      for (const node of nodes) {
        const isRunning = await this.isNodeRunning(node.name);
        runningNodes.push({
          ...node,
          isRunning,
          status: isRunning ? 'running' : 'stopped'
        });
      }
      
      return {
        totalNodes: nodes.length,
        runningNodes: runningNodes.filter(n => n.isRunning).length,
        stoppedNodes: runningNodes.filter(n => !n.isRunning).length,
        nodes: runningNodes
      };
    } catch (error) {
      console.error('❌ Failed to get cluster status:', error);
      throw error;
    }
  }

  /**
   * Check if node is running
   */
  async isNodeRunning(nodeName) {
    // Get the correct PID file path from metadata
    const metadata = this.getNodeMetadata(nodeName);
    let pidFilePath;
    
    if (metadata && metadata.configPath) {
      const configDir = path.dirname(metadata.configPath);
      pidFilePath = path.join(configDir, 'pid.json');
    } else {
      // Fallback to new organized path structure
      pidFilePath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'pid.json');
    }
    
    try {
        const pidData = await fs.readFile(pidFilePath, 'utf8');
        const { pid } = JSON.parse(pidData);
      
        if (!pid) return false;
      
        // Check if process with PID is running (Windows specific)
        const command = `tasklist /FI "PID eq ${pid}"`;
        const result = execSync(command, { encoding: 'utf8' });

        // tasklist will include the PID in the output if it's found
        return result.includes(pid);
    } catch (error) {
        // If file doesn't exist or any other error, assume not running
        return false;
    }
  }

  async findPidByPort(port) {
    const command = `netstat -ano -p TCP`; // Be more specific to reduce output
    const pollInterval = 1000; // Check every 1 second
    const timeout = 60000; // 60 seconds - Elasticsearch can take a while to start
    const startTime = Date.now();

    console.log(`🔍 Polling for process on port ${port} for up to ${timeout/1000} seconds...`);

    while (Date.now() - startTime < timeout) {
        try {
            const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
            const lines = output.trim().split(/\r?\n/);

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 5) continue;

                // On Windows, the columns are Proto, Local Address, Foreign Address, State, PID
                const localAddress = parts[1];
                const state = parts[3];
                const pid = parts[4];

                if (state === 'LISTENING' && localAddress.endsWith(':' + port)) {
                    if (pid && pid !== '0') {
                        console.log(`✅ Found process with PID ${pid} listening on port ${port}`);
                        return pid; // Found it
                    }
                }
            }
        } catch (e) {
            console.log(`⚠️ Error running netstat: ${e.message}`);
            // execSync will throw if the command fails, which we can ignore while polling.
        }
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏱️ Still waiting for port ${port}... (${elapsed}s elapsed)`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.log(`❌ Timeout reached after ${timeout/1000} seconds. No process found on port ${port}`);
    return null; // Timeout reached
  }

  /**
   * Update an existing Elasticsearch node configuration
   */
  async updateNode(nodeName, updates, options = {}) {
    try {
      console.log(`🔧 Updating node ${nodeName} with:`, updates);
      console.log(`🔧 Update options:`, options);
      
      // Get current node config and metadata
      const currentConfig = await this.getNodeConfig(nodeName);
      const currentMetadata = this.getNodeMetadata(nodeName);
      
      // Track old paths for potential cleanup
      const oldPaths = {
        dataPath: currentConfig.path.data,
        logsPath: currentConfig.path.logs,
        configPath: currentMetadata.configPath
      };
      
      // Get the correct config path from metadata
      let configPath;
      
      if (currentMetadata && currentMetadata.configPath) {
        configPath = currentMetadata.configPath;
        console.log(`🔍 Using config path from metadata for update: ${configPath}`);
      } else {
        // Fallback to new organized path structure
        configPath = path.join(this.baseElasticsearchPath, 'nodes', nodeName, 'config', 'elasticsearch.yml');
        console.log(`🔍 Using new organized config path for update: ${configPath}`);
      }
      
      // Create updated configuration object
      const updatedConfig = {
        'cluster.name': updates.cluster || currentConfig.cluster.name,
        'node.name': updates.name || currentConfig.node.name,
        'network.host': updates.host || currentConfig.network.host,
        'http.port': updates.port || currentConfig.http.port,
        'transport.port': updates.transportPort || currentConfig.transport.port,
        'path.data': updates.dataPath || currentConfig.path.data,
        'path.logs': updates.logsPath || currentConfig.path.logs,
        'node.roles': updates.roles ? `[${this.formatNodeRoles(updates.roles)}]` : `[${this.formatNodeRoles(currentConfig.node.roles || { master: true, data: true, ingest: true })}]`,
        'node.attr.custom_id': updates.name || currentConfig.node.name,
        'discovery.type': 'single-node',
        'bootstrap.memory_lock': false,
        'xpack.security.enabled': false,
        'xpack.security.transport.ssl.enabled': false,
        'xpack.security.http.ssl.enabled': false
      };
      
      // Create new directories if paths have changed or don't exist
      const newDataPath = updates.dataPath || currentConfig.path.data;
      const newLogsPath = updates.logsPath || currentConfig.path.logs;
      
      if (newDataPath) {
        try {
          await fs.mkdir(newDataPath, { recursive: true });
          console.log(`📁 Ensured data directory exists: ${newDataPath}`);
        } catch (error) {
          console.warn(`⚠️ Could not create data directory ${newDataPath}:`, error.message);
        }
      }
      
      if (newLogsPath) {
        try {
          await fs.mkdir(newLogsPath, { recursive: true });
          console.log(`📁 Ensured logs directory exists: ${newLogsPath}`);
        } catch (error) {
          console.warn(`⚠️ Could not create logs directory ${newLogsPath}:`, error.message);
        }
      }
      
      // Generate new YAML configuration
      const configLines = [];
      configLines.push(`# Elasticsearch Configuration for ${updatedConfig['node.name']}`);
      configLines.push(`# Updated automatically by TrustQuery`);
      configLines.push('');
      configLines.push('# Cluster settings');
      configLines.push(`cluster.name: ${updatedConfig['cluster.name']}`);
      configLines.push(`node.name: ${updatedConfig['node.name']}`);
      configLines.push('');
      configLines.push('# Network settings');
      configLines.push(`network.host: ${updatedConfig['network.host']}`);
      configLines.push(`http.port: ${updatedConfig['http.port']}`);
      configLines.push(`transport.port: ${updatedConfig['transport.port']}`);
      configLines.push('');
      configLines.push('# Path settings');
      configLines.push(`path.data: ${updatedConfig['path.data']}`);
      configLines.push(`path.logs: ${updatedConfig['path.logs']}`);
      configLines.push('');
      configLines.push('# Node roles');
      configLines.push(`node.roles: ${updatedConfig['node.roles']}`);
      configLines.push('');
      configLines.push('# Custom attribute for shard allocation');
      configLines.push(`node.attr.custom_id: ${updatedConfig['node.attr.custom_id']}`);
      configLines.push('');
      configLines.push('# Discovery settings');
      configLines.push(`discovery.type: ${updatedConfig['discovery.type']}`);
      configLines.push('');
      configLines.push('# Memory settings');
      configLines.push(`bootstrap.memory_lock: ${updatedConfig['bootstrap.memory_lock']}`);
      configLines.push('');
      configLines.push('# Security settings (basic)');
      configLines.push(`xpack.security.enabled: ${updatedConfig['xpack.security.enabled']}`);
      configLines.push(`xpack.security.transport.ssl.enabled: ${updatedConfig['xpack.security.transport.ssl.enabled']}`);
      configLines.push(`xpack.security.http.ssl.enabled: ${updatedConfig['xpack.security.http.ssl.enabled']}`);
      configLines.push('');
      
      const newConfigContent = configLines.join('\n');
      
      // Write updated configuration to file
      await fs.writeFile(configPath, newConfigContent);
      console.log(`✅ Updated configuration file: ${configPath}`);
      
      // Update log4j2.properties if logs path changed
      if (updates.logsPath && updates.logsPath !== currentConfig.path.logs) {
        try {
          const log4j2Config = this.generateLog4j2Config(newLogsPath);
          
          // Use the same base directory as the config file
          const configDir = path.dirname(configPath);
          const log4j2Path = path.join(configDir, 'log4j2.properties');
          
          await fs.writeFile(log4j2Path, log4j2Config);
          console.log(`✅ Updated log4j2.properties with new logs path: ${log4j2Path}`);
        } catch (error) {
          console.warn(`⚠️ Could not update log4j2.properties:`, error.message);
        }
      }
      
      // Verify paths exist after creation
      const pathStatus = {
        dataPath: { path: newDataPath, exists: false },
        logsPath: { path: newLogsPath, exists: false }
      };
      
      try {
        if (newDataPath) {
          await fs.access(newDataPath);
          pathStatus.dataPath.exists = true;
        }
      } catch (error) {
        console.warn(`⚠️ Data path may not exist: ${newDataPath}`);
      }
      
      try {
        if (newLogsPath) {
          await fs.access(newLogsPath);
          pathStatus.logsPath.exists = true;
        }
      } catch (error) {
        console.warn(`⚠️ Logs path may not exist: ${newLogsPath}`);
      }
      
      return {
        success: true,
        configPath,
        dataPath: newDataPath,
        logsPath: newLogsPath,
        pathStatus,
        message: `Node ${nodeName} configuration updated successfully`
      };
      
    } catch (error) {
      console.error(`❌ Failed to update node ${nodeName}:`, error);
      throw error;
    }
  }

  /**
   * Move a node to a new location
   */
  async moveNode(nodeName, newBasePath, preserveData = true) {
    try {
      console.log(`🚚 Moving node "${nodeName}" to: ${newBasePath}`);
      
      // Get current node config and metadata
      const currentConfig = await this.getNodeConfig(nodeName);
      const currentMetadata = this.getNodeMetadata(nodeName);
      
      const fs = require('fs').promises;
      const path = require('path');
      
      // Define old and new paths
      const oldPaths = {
        configPath: currentMetadata.configPath,
        servicePath: currentMetadata.servicePath,
        dataPath: currentMetadata.dataPath,
        logsPath: currentMetadata.logsPath
      };
      
      const newPaths = {
        configPath: path.join(newBasePath, 'config', 'elasticsearch.yml'),
        servicePath: path.join(newBasePath, 'config', 'start-node.bat'),
        dataPath: path.join(newBasePath, 'data'),
        logsPath: path.join(newBasePath, 'logs')
      };
      
      // Create new directory structure
      await fs.mkdir(path.join(newBasePath, 'config'), { recursive: true });
      await fs.mkdir(newPaths.dataPath, { recursive: true });
      await fs.mkdir(newPaths.logsPath, { recursive: true });
      
      // Move/copy config files
      const configExists = await fs.access(oldPaths.configPath).then(() => true).catch(() => false);
      if (configExists) {
        await fs.copyFile(oldPaths.configPath, newPaths.configPath);
      }
      
      const serviceExists = await fs.access(oldPaths.servicePath).then(() => true).catch(() => false);
      if (serviceExists) {
        await fs.copyFile(oldPaths.servicePath, newPaths.servicePath);
      }
      
      // Copy jvm.options if it exists
      const oldJvmPath = path.join(path.dirname(oldPaths.configPath), 'jvm.options');
      const newJvmPath = path.join(path.dirname(newPaths.configPath), 'jvm.options');
      const jvmExists = await fs.access(oldJvmPath).then(() => true).catch(() => false);
      if (jvmExists) {
        await fs.copyFile(oldJvmPath, newJvmPath);
      }
      
      // Copy log4j2.properties if it exists
      const oldLog4j2Path = path.join(path.dirname(oldPaths.configPath), 'log4j2.properties');
      const newLog4j2Path = path.join(path.dirname(newPaths.configPath), 'log4j2.properties');
      const log4j2Exists = await fs.access(oldLog4j2Path).then(() => true).catch(() => false);
      if (log4j2Exists) {
        await fs.copyFile(oldLog4j2Path, newLog4j2Path);
      }
      
      // Move/copy data if requested
      if (preserveData) {
        const dataExists = await fs.access(oldPaths.dataPath).then(() => true).catch(() => false);
        if (dataExists) {
          const dataFiles = await fs.readdir(oldPaths.dataPath).catch(() => []);
          for (const file of dataFiles) {
            const srcPath = path.join(oldPaths.dataPath, file);
            const destPath = path.join(newPaths.dataPath, file);
            const stat = await fs.lstat(srcPath);
            if (stat.isDirectory()) {
              await this.copyDirectory(srcPath, destPath);
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        }
        
        const logsExists = await fs.access(oldPaths.logsPath).then(() => true).catch(() => false);
        if (logsExists) {
          const logFiles = await fs.readdir(oldPaths.logsPath).catch(() => []);
          for (const file of logFiles) {
            const srcPath = path.join(oldPaths.logsPath, file);
            const destPath = path.join(newPaths.logsPath, file);
            const stat = await fs.lstat(srcPath);
            if (stat.isDirectory()) {
              await this.copyDirectory(srcPath, destPath);
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        }
      }
      
      // Update config file with new paths
      const updatedConfig = {
        name: currentConfig.node?.name || nodeName,
        clusterName: currentConfig.cluster?.name || currentMetadata.cluster || 'trustquery-cluster',
        host: currentMetadata.host || 'localhost',
        port: currentMetadata.port || 9200,
        transportPort: currentMetadata.transportPort || 9300,
        dataPath: newPaths.dataPath,
        logsPath: newPaths.logsPath,
        roles: currentMetadata.roles || {
          master: true,
          data: true,
          ingest: true
        }
      };
      
      const configContent = this.generateNodeConfig(updatedConfig);
      await fs.writeFile(newPaths.configPath, configContent);
      
      // Generate and write JVM options file
      const jvmOptions = this.generateJVMOptions();
      const jvmPath = path.join(path.dirname(newPaths.configPath), 'jvm.options');
      await fs.writeFile(jvmPath, jvmOptions);
      
      // Generate and write log4j2.properties file
      const log4j2Config = this.generateLog4j2Config(newPaths.logsPath);
      const log4j2Path = path.join(path.dirname(newPaths.configPath), 'log4j2.properties');
      await fs.writeFile(log4j2Path, log4j2Config);
      
      // Update service file with new paths
      const serviceContent = this.generateServiceScript(updatedConfig.name, path.dirname(newPaths.configPath), updatedConfig.port);
      await fs.writeFile(newPaths.servicePath, serviceContent);
      
      // Remove old directories if move was successful
      try {
        if (preserveData) {
          // Remove old data and logs
          await fs.rm(oldPaths.dataPath, { recursive: true, force: true });
          await fs.rm(oldPaths.logsPath, { recursive: true, force: true });
        }
        // Remove old config directory
        const oldConfigDir = path.dirname(oldPaths.configPath);
        await fs.rm(oldConfigDir, { recursive: true, force: true });
        
        // Remove old base directory if empty
        const oldBaseDir = path.dirname(oldConfigDir);
        try {
          const remainingFiles = await fs.readdir(oldBaseDir);
          if (remainingFiles.length === 0) {
            await fs.rmdir(oldBaseDir);
          }
        } catch (e) {
          // Directory not empty or doesn't exist, that's fine
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Could not fully clean up old paths:`, cleanupError.message);
      }
      
      console.log(`✅ Node "${nodeName}" moved successfully to: ${newBasePath}`);
      
      return {
        newConfigPath: newPaths.configPath,
        newServicePath: newPaths.servicePath,
        newDataPath: newPaths.dataPath,
        newLogsPath: newPaths.logsPath
      };
      
    } catch (error) {
      console.error(`❌ Failed to move node ${nodeName}:`, error);
      throw error;
    }
  }

  /**
   * Copy a node to a new location with a new name
   */
  async copyNode(sourceNodeName, newNodeName, newBasePath, copyData = false) {
    try {
      console.log(`📋 Copying node "${sourceNodeName}" to "${newNodeName}" at: ${newBasePath}`);
      
      // Get source node config and metadata
      const sourceConfig = await this.getNodeConfig(sourceNodeName);
      const sourceMetadata = this.getNodeMetadata(sourceNodeName);
      
      const fs = require('fs').promises;
      const path = require('path');
      
      // Define new paths
      const newPaths = {
        configPath: path.join(newBasePath, 'config', 'elasticsearch.yml'),
        servicePath: path.join(newBasePath, 'config', 'start-node.bat'),
        dataPath: path.join(newBasePath, 'data'),
        logsPath: path.join(newBasePath, 'logs')
      };
      
      // Create new directory structure
      await fs.mkdir(path.join(newBasePath, 'config'), { recursive: true });
      await fs.mkdir(newPaths.dataPath, { recursive: true });
      await fs.mkdir(newPaths.logsPath, { recursive: true });
      
      // Copy existing config files from source (will be overwritten with updated content)
      if (sourceMetadata.configPath) {
        const sourceConfigExists = await fs.access(sourceMetadata.configPath).then(() => true).catch(() => false);
        if (sourceConfigExists) {
          await fs.copyFile(sourceMetadata.configPath, newPaths.configPath);
        }
      }
      
      if (sourceMetadata.servicePath) {
        const sourceServiceExists = await fs.access(sourceMetadata.servicePath).then(() => true).catch(() => false);
        if (sourceServiceExists) {
          await fs.copyFile(sourceMetadata.servicePath, newPaths.servicePath);
        }
      }
      
      // Copy jvm.options if it exists in source
      if (sourceMetadata.configPath) {
        const sourceJvmPath = path.join(path.dirname(sourceMetadata.configPath), 'jvm.options');
        const newJvmPath = path.join(path.dirname(newPaths.configPath), 'jvm.options');
        const sourceJvmExists = await fs.access(sourceJvmPath).then(() => true).catch(() => false);
        if (sourceJvmExists) {
          await fs.copyFile(sourceJvmPath, newJvmPath);
        }
      }
      
      // Copy log4j2.properties if it exists in source
      if (sourceMetadata.configPath) {
        const sourceLog4j2Path = path.join(path.dirname(sourceMetadata.configPath), 'log4j2.properties');
        const newLog4j2Path = path.join(path.dirname(newPaths.configPath), 'log4j2.properties');
        const sourceLog4j2Exists = await fs.access(sourceLog4j2Path).then(() => true).catch(() => false);
        if (sourceLog4j2Exists) {
          await fs.copyFile(sourceLog4j2Path, newLog4j2Path);
        }
      }
      
      // Generate new ports for the copied node
      const existingMetadata = require('../config').getConfig('nodeMetadata') || {};
      const usedPorts = new Set();
      Object.values(existingMetadata).forEach(meta => {
        if (meta.port) usedPorts.add(parseInt(meta.port));
        if (meta.transportPort) usedPorts.add(parseInt(meta.transportPort));
      });
      
      let newHttpPort = sourceConfig.http.port + 1;
      while (usedPorts.has(newHttpPort)) newHttpPort++;
      
      let newTransportPort = sourceConfig.transport.port + 1;
      while (usedPorts.has(newTransportPort)) newTransportPort++;
      
      // Create new config with updated settings
      const newConfig = {
        name: newNodeName,
        clusterName: sourceConfig.cluster?.name || sourceMetadata.cluster || 'trustquery-cluster',
        host: sourceMetadata.host || 'localhost',
        port: newHttpPort,
        transportPort: newTransportPort,
        dataPath: newPaths.dataPath,
        logsPath: newPaths.logsPath,
        roles: sourceMetadata.roles || {
          master: true,
          data: true,
          ingest: true
        }
      };
      
      // Write new config file
      const configContent = this.generateNodeConfig(newConfig);
      await fs.writeFile(newPaths.configPath, configContent);
      
      // Generate and write JVM options file
      const jvmOptions = this.generateJVMOptions();
      const jvmPath = path.join(path.dirname(newPaths.configPath), 'jvm.options');
      await fs.writeFile(jvmPath, jvmOptions);
      
      // Generate and write log4j2.properties file
      const log4j2Config = this.generateLog4j2Config(newPaths.logsPath);
      const log4j2Path = path.join(path.dirname(newPaths.configPath), 'log4j2.properties');
      await fs.writeFile(log4j2Path, log4j2Config);
      
      // Write new service file
      const serviceContent = this.generateServiceScript(newConfig.name, path.dirname(newPaths.configPath), newConfig.port);
      await fs.writeFile(newPaths.servicePath, serviceContent);
      
      // Copy data if requested
      if (copyData) {
        const sourceDataExists = await fs.access(sourceMetadata.dataPath).then(() => true).catch(() => false);
        if (sourceDataExists) {
          await this.copyDirectory(sourceMetadata.dataPath, newPaths.dataPath);
        }
        
        const sourceLogsExists = await fs.access(sourceMetadata.logsPath).then(() => true).catch(() => false);
        if (sourceLogsExists) {
          await this.copyDirectory(sourceMetadata.logsPath, newPaths.logsPath);
        }
      }
      
      console.log(`✅ Node "${sourceNodeName}" copied successfully to "${newNodeName}"`);
      
      return {
        name: newNodeName,
        nodeUrl: `http://${newConfig.host}:${newHttpPort}`,
        configPath: newPaths.configPath,
        servicePath: newPaths.servicePath,
        dataPath: newPaths.dataPath,
        logsPath: newPaths.logsPath,
        cluster: newConfig.clusterName,
        host: newConfig.host,
        port: newHttpPort,
        transportPort: newTransportPort,
        roles: newConfig.roles
      };
      
    } catch (error) {
      console.error(`❌ Failed to copy node ${sourceNodeName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to recursively copy directories
   */
  async copyDirectory(src, dest) {
    const fs = require('fs').promises;
    const path = require('path');
    
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Verify and clean up node metadata on server startup
   * Removes metadata for nodes whose directories no longer exist
   */
  async verifyNodeMetadata() {
    try {
      console.log('🔍 Verifying node metadata against filesystem...');
      
      const { getConfig, setConfig } = require('../config');
      const nodeMetadata = getConfig('nodeMetadata') || {};
      const elasticsearchNodes = getConfig('elasticsearchNodes') || [];
      
      let metadataChanged = false;
      let nodesChanged = false;
      const removedNodes = [];
      
      // Check each node in metadata
      for (const [nodeUrl, metadata] of Object.entries(nodeMetadata)) {
        if (!metadata || !metadata.name) continue;
        
        const nodeName = metadata.name;
        let nodeExists = false;
        
        // Check if the node directory structure exists
        if (metadata.configPath) {
          try {
            const fs = require('fs').promises;
            const path = require('path');
            
            // Check if the main node directory exists (parent of config path)
            const nodeDir = path.dirname(path.dirname(metadata.configPath)); // Go up from config/elasticsearch.yml to node root
            await fs.access(nodeDir);
            
            // Also check if config file exists
            await fs.access(metadata.configPath);
            nodeExists = true;
            
            console.log(`✅ Node "${nodeName}" directory verified: ${nodeDir}`);
          } catch (error) {
            console.log(`❌ Node "${nodeName}" directory not found or inaccessible`);
            nodeExists = false;
          }
        }
        
        if (!nodeExists) {
          console.log(`🧹 Removing metadata for missing node: ${nodeName}`);
          delete nodeMetadata[nodeUrl];
          metadataChanged = true;
          removedNodes.push(nodeName);
          
          // Also remove from elasticsearchNodes array
          const nodeIndex = elasticsearchNodes.indexOf(nodeUrl);
          if (nodeIndex > -1) {
            elasticsearchNodes.splice(nodeIndex, 1);
            nodesChanged = true;
            console.log(`🧹 Removed node URL from elasticsearchNodes: ${nodeUrl}`);
          }
        }
      }
      
      // Scan the base nodes directory for any existing nodes not in metadata
      const baseNodesPath = 'C:\\elasticsearch\\nodes';
      try {
        const fs = require('fs').promises;
        const path = require('path');
        
        const dirExists = await fs.access(baseNodesPath).then(() => true).catch(() => false);
        if (dirExists) {
          const entries = await fs.readdir(baseNodesPath, { withFileTypes: true });
          const nodeDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
          
          console.log(`🔍 Found ${nodeDirs.length} directories in ${baseNodesPath}:`, nodeDirs);
          
          // Check if any of these directories have valid node configurations
          for (const dirName of nodeDirs) {
            const nodeDir = path.join(baseNodesPath, dirName);
            const configPath = path.join(nodeDir, 'config', 'elasticsearch.yml');
            
            // Check if this node is already in metadata
            const existsInMetadata = Object.values(nodeMetadata).some(meta => 
              meta.name === dirName || meta.configPath === configPath
            );
            
            if (!existsInMetadata) {
              // Check if it has a valid config file
              const configExists = await fs.access(configPath).then(() => true).catch(() => false);
              if (configExists) {
                console.log(`⚠️  Found orphaned node directory with config: ${dirName}`);
                console.log(`   Config file: ${configPath}`);
                console.log(`   Auto-recreating metadata for orphaned node...`);
                
                try {
                  // Read the config file to extract node information
                  const configContent = await fs.readFile(configPath, 'utf8');
                  const config = yaml.parse(configContent);
                  
                  // Extract information from config
                  const nodeName = config['node.name'] || dirName;
                  const clusterName = config['cluster.name'] || 'trustquery-cluster';
                  const httpPort = config['http.port'] || 9200;
                  const transportPort = config['transport.port'] || 9300;
                  const host = config['network.host'] || 'localhost';
                  
                  // Create metadata entry
                  const nodeUrl = `http://${host}:${httpPort}`;
                  const newMetadata = {
                    name: nodeName,
                    configPath: configPath,
                    servicePath: path.join(nodeDir, 'config', 'start-node.bat'),
                    dataPath: path.join(nodeDir, 'data'),
                    logsPath: path.join(nodeDir, 'logs'),
                    cluster: clusterName,
                    host: host,
                    port: httpPort,
                    transportPort: transportPort,
                    roles: {
                      master: true,
                      data: true,
                      ingest: true
                    }
                  };
                  
                  // Add to metadata
                  nodeMetadata[nodeUrl] = newMetadata;
                  metadataChanged = true;
                  
                  // Also add to elasticsearchNodes if not present
                  if (!elasticsearchNodes.includes(nodeUrl)) {
                    elasticsearchNodes.push(nodeUrl);
                    nodesChanged = true;
                  }
                  
                  console.log(`✅ Recreated metadata for orphaned node: ${nodeName} at ${nodeUrl}`);
                } catch (configError) {
                  console.error(`❌ Failed to recreate metadata for ${dirName}:`, configError.message);
                  console.log(`   You may want to recreate this node through the UI or manually clean up the directory.`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`ℹ️  Could not scan base nodes directory (${baseNodesPath}):`, error.message);
      }
      
      // Save changes if any were made
      if (metadataChanged) {
        await setConfig('nodeMetadata', nodeMetadata);
        console.log(`✅ Updated node metadata (removed ${removedNodes.length} missing nodes)`);
      }
      
      if (nodesChanged) {
        await setConfig('elasticsearchNodes', elasticsearchNodes);
        console.log(`✅ Updated elasticsearchNodes array`);
      }
      
      if (removedNodes.length > 0) {
        console.log(`🧹 Cleanup summary: Removed metadata for nodes: ${removedNodes.join(', ')}`);
      } else {
        console.log(`✅ All node metadata verified - no cleanup needed`);
      }
      
    } catch (error) {
      console.error('❌ Error during node metadata verification:', error);
      // Don't throw - this shouldn't prevent server startup
    }
  }
}

module.exports = new ElasticsearchClusterManager();
