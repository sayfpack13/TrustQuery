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
      path.join(this.baseElasticsearchPath, 'data'),
      path.join(this.baseElasticsearchPath, 'logs'),
      path.join(this.baseElasticsearchPath, 'config')
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

# Discovery settings
discovery.seed_hosts: ${JSON.stringify(nodeConfig.seedHosts || ['localhost:9300'])}
cluster.initial_master_nodes: ${JSON.stringify(nodeConfig.initialMasterNodes || [nodeConfig.name])}
discovery.type: single-node

# Memory settings
bootstrap.memory_lock: false

# Security settings (basic)
xpack.security.enabled: false
xpack.security.transport.ssl.enabled: false
xpack.security.http.ssl.enabled: false

# Disable deprecated analytics to clean up logs
xpack.analytics.enabled: false

# Monitoring
xpack.monitoring.collection.enabled: true
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

      // Validate required fields
      if (!name || !dataPath || !logsPath) {
        throw new Error('Node name, data path, and logs path are required');
      }

      // Create node-specific directories
      await fs.mkdir(dataPath, { recursive: true });
      await fs.mkdir(logsPath, { recursive: true });

      // Create node configuration directory
      const nodeConfigDir = path.join(this.baseElasticsearchPath, 'config', name);
      await fs.mkdir(nodeConfigDir, { recursive: true });

      // Generate and save node configuration
      const configContent = this.generateNodeConfig({
        name,
        host,
        port,
        transportPort,
        dataPath,
        logsPath,
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
      const log4j2Config = this.generateLog4j2Config(logsPath);
      const log4j2Path = path.join(nodeConfigDir, 'log4j2.properties');
      await fs.writeFile(log4j2Path, log4j2Config);

      // Create Windows service script
      const serviceScript = this.generateServiceScript(name, nodeConfigDir, port);
      const servicePath = path.join(nodeConfigDir, 'start-node.bat');
      await fs.writeFile(servicePath, serviceScript);

      console.log(`✅ Created node configuration: ${name}`);
      
      return {
        name,
        configPath,
        servicePath,
        dataPath,
        logsPath,
        port,
        transportPort,
        nodeUrl: `http://${host}:${port}`
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
        const nodeConfigDir = path.join(this.baseElasticsearchPath, 'config', nodeName);
        const servicePath = path.join(nodeConfigDir, 'start-node.bat');
        await fs.access(servicePath);

        // Create a log file for startup output
        const logDir = path.join(this.baseElasticsearchPath, 'data', nodeName, 'logs');
        await fs.mkdir(logDir, { recursive: true });
        const startupLogPath = path.join(logDir, 'startup.log');
        const output = await fs.open(startupLogPath, 'a');

        // This simpler spawn is more reliable on Windows
        const child = spawn(servicePath, [], {
            detached: true,
            stdio: ['ignore', output, output], // Redirect stdout and stderr to the log file
            shell: true,
            windowsHide: true,
        });
        child.unref();

        console.log(`🚀 Start command issued for ${nodeName}. Tailing startup log at: ${startupLogPath}`);

        // Small delay to allow the process to initialize
        await new Promise(resolve => setTimeout(resolve, 5000)); 

        // Find the real PID by polling the port
        const nodeConfig = await this.getNodeConfig(nodeName);
        const port = nodeConfig.http.port;
        if (!port) {
            throw new Error(`Could not determine port for node ${nodeName}.`);
        }

        const pid = await this.findPidByPort(port);
        if (pid) {
            const pidFilePath = path.join(nodeConfigDir, 'pid.json');
            await fs.writeFile(pidFilePath, JSON.stringify({ pid }), 'utf8');
            console.log(`✅ Started Elasticsearch node: ${nodeName} with PID: ${pid} on port ${port}`);
            // Close the file handle
            await output.close();
            return { success: true, pid };
        } else {
            // Close the file handle before reading
            await output.close();
            // If the process isn't found, read the startup log to provide more context
            const startupLog = await fs.readFile(startupLogPath, 'utf8').catch(() => "Could not read startup.log.");

            // Also, try to read the actual Elasticsearch log file for more detailed errors.
            const esLogPath = path.join(this.baseElasticsearchPath, 'data', nodeName, 'logs', 'elasticsearch.log');
            const esLog = await fs.readFile(esLogPath, 'utf8').catch(() => "Could not read elasticsearch.log.");

            throw new Error(`Failed to confirm node start for ${nodeName}. Could not find process on port ${port}.\n\nStartup Log:\n${startupLog}\n\nElasticsearch Log:\n${esLog}`);
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
      const pidFilePath = path.join(this.baseElasticsearchPath, 'config', nodeName, 'pid.json');
      try {
        const pidData = await fs.readFile(pidFilePath, 'utf8');
        const { pid } = JSON.parse(pidData);

        if (pid) {
          console.log(`🔌 Attempting to stop node ${nodeName} with PID: ${pid}`);
          // Forcefully kill the process on Windows
          spawn('taskkill', ['/F', '/PID', pid], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        }
        
        // Clean up the PID file
        await fs.unlink(pidFilePath);
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
    const configPath = path.join(this.baseElasticsearchPath, 'config', nodeName, 'elasticsearch.yml');
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
          transport: { port: '9300' }
        };
      }
      throw error;
    }
  }

  /**
   * List all configured nodes
   */
  async listNodes() {
    const configDir = path.join(this.baseElasticsearchPath, 'config');
    const nodes = [];

    try {
        const nodeDirs = await fs.readdir(configDir, { withFileTypes: true });

        for (const dirent of nodeDirs) {
            if (dirent.isDirectory()) {
                const nodeDirName = dirent.name;
                const config = await this.getNodeConfig(nodeDirName);

                // The true name comes from the config file itself.
                const definitiveNodeName = config.node.name;
                
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
            }
        }
        return nodes;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Config directory not found at ${configDir}, returning no nodes.`);
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
    for (const [, metadata] of Object.entries(nodeMetadata)) {
        if (metadata.name === nodeName) {
            return metadata;
        }
    }
    // Return default paths if not in metadata
    return {
        dataPath: path.join(this.baseElasticsearchPath, nodeName, 'data'),
        logsPath: path.join(this.baseElasticsearchPath, nodeName, 'logs'),
    };
  }

  /**
   * Remove a node configuration
   */
  async removeNode(nodeName) {
    try {
      // Stop the node first (if it's running)
      try {
        await this.stopNode(nodeName);
      } catch (stopError) {
        console.warn(`⚠️ Could not stop node ${nodeName} (it may not be running):`, stopError.message);
      }
      
      // Get node metadata to see if this node was created through cluster manager
      const { getConfig } = require('../config');
      const nodeMetadata = getConfig('nodeMetadata') || {};
      let hasMetadata = false;
      let nodeUrl = null;
      
      // Find node metadata by name
      for (const [url, metadata] of Object.entries(nodeMetadata)) {
        if (metadata.name === nodeName) {
          hasMetadata = true;
          nodeUrl = url;
          break;
        }
      }
      
      if (hasMetadata && nodeUrl && nodeMetadata[nodeUrl]) {
        const metadata = nodeMetadata[nodeUrl];
        console.log(`🔍 Found metadata for node ${nodeName}, attempting to clean up associated directories...`);
        
        // Try to remove data directory if specified
        if (metadata.dataPath) {
          try {
            await fs.access(metadata.dataPath);
            await fs.rmdir(metadata.dataPath, { recursive: true });
            console.log(`🗑️ Removed node data directory: ${metadata.dataPath}`);
          } catch (dirError) {
            if (dirError.code === 'ENOENT') {
              console.warn(`⚠️ Node data directory not found: ${metadata.dataPath} (already deleted)`);
            } else {
              console.warn(`⚠️ Could not remove node data directory: ${dirError.message}`);
            }
          }
        }
        
        // Try to remove logs directory if specified
        if (metadata.logsPath) {
          try {
            await fs.access(metadata.logsPath);
            await fs.rmdir(metadata.logsPath, { recursive: true });
            console.log(`🗑️ Removed node logs directory: ${metadata.logsPath}`);
          } catch (dirError) {
            if (dirError.code === 'ENOENT') {
              console.warn(`⚠️ Node logs directory not found: ${metadata.logsPath} (already deleted)`);
            } else {
              console.warn(`⚠️ Could not remove node logs directory: ${dirError.message}`);
            }
          }
        }
      } else {
        console.warn(`⚠️ No metadata found for node ${nodeName}. This node may not have been created through cluster manager.`);
      }
      
      // Remove node configuration directory (if it exists)
      const nodeConfigDir = path.join(this.baseElasticsearchPath, 'config', nodeName);
      try {
        await fs.access(nodeConfigDir);
        await fs.rmdir(nodeConfigDir, { recursive: true });
        console.log(`🗑️ Removed node configuration directory: ${nodeConfigDir}`);
      } catch (dirError) {
        if (dirError.code === 'ENOENT') {
          console.warn(`⚠️ Node configuration directory not found: ${nodeConfigDir} (this is OK for nodes not created through cluster manager)`);
        } else {
          console.warn(`⚠️ Could not remove node configuration directory:`, dirError.message);
        }
      }
      
      console.log(`✅ Node ${nodeName} removal completed`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to remove node ${nodeName}:`, error);
      // Don't throw the error - we want config cleanup to continue even if physical deletion fails
      console.warn(`⚠️ Continuing with config cleanup despite filesystem errors...`);
      return { success: true, warnings: [error.message] };
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
    const pidFilePath = path.join(this.baseElasticsearchPath, 'config', nodeName, 'pid.json');
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
    const pollInterval = 500;
    const timeout = 20000; // 20 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
            const lines = output.trim().split(/\\r?\\n/);

            for (const line of lines) {
                const parts = line.trim().split(/\\s+/);
                if (parts.length < 5) continue;

                // On Windows, the columns are Proto, Local Address, Foreign Address, State, PID
                const localAddress = parts[1];
                const state = parts[3];
                const pid = parts[4];

                if (state === 'LISTENING' && localAddress.endsWith(':' + port)) {
                    if (pid && pid !== '0') {
                        return pid; // Found it
                    }
                }
            }
        } catch (e) {
            // execSync will throw if the command fails, which we can ignore while polling.
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null; // Timeout reached
  }
}

module.exports = new ElasticsearchClusterManager();
