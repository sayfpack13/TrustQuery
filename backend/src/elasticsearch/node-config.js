const fs = require("fs").promises;
const path = require("path");
const yaml = require("yaml");
const { getConfig } = require("../config");

/**
 * Helper to get environment and config info
 */
function getEnvAndConfig() {
  const config = getConfig();
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const isMac = process.platform === "darwin";
  const baseElasticsearchPath =
    (config.setupWizard && config.setupWizard.basePath) ||
    (config.elasticsearchConfig && config.elasticsearchConfig.basePath);
  const javaPath = "java";
  return { config, isWindows, isLinux, isMac, baseElasticsearchPath, javaPath };
}

/**
 * Format node roles for configuration
 */
function formatNodeRoles(roles) {
  const roleList = [];
  if (roles.master) roleList.push("master");
  if (roles.data) roleList.push("data");
  if (roles.ingest) roleList.push("ingest");
  return roleList.join(", ");
}

/**
 * Generate Elasticsearch configuration for a node
 */
function generateNodeConfig(nodeConfig) {
  const config = `# Elasticsearch Configuration for ${nodeConfig.name}
# Generated automatically by TrustQuery

# Cluster settings
cluster.name: ${nodeConfig.clusterName || "trustquery-cluster"}
node.name: ${nodeConfig.name}

# Network settings
network.host: ${nodeConfig.host || "localhost"}
http.port: ${nodeConfig.port || 9200}
transport.port: ${nodeConfig.transportPort || 9300}

# Path settings
path.data: ${nodeConfig.dataPath}
path.logs: ${nodeConfig.logsPath}

# Node roles
node.roles: [${formatNodeRoles(nodeConfig.roles)}]

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
 * Generate JVM options configuration
 */
function generateJVMOptions(heapSize = "1g") {
  return `## JVM configuration
# Generated automatically by TrustQuery

################################################################
## IMPORTANT: JVM heap size
################################################################
-Xms${heapSize}
-Xmx${heapSize}

################################################################
## Expert settings
################################################################
8-13:-XX:+UseConcMarkSweepGC
8-13:-XX:CMSInitiatingOccupancyFraction=75
8-13:-XX:+UseCMSInitiatingOccupancyOnly

## G1GC Configuration
14-:-XX:+UseG1GC
14-:-XX:G1ReservePercent=25
14-:-XX:InitiatingHeapOccupancyPercent=75

## JVM temporary directory
-Djava.io.tmpdir=${path.join(process.env.TEMP || "/tmp")}

## heap dumps

# generate a heap dump when an allocation from the Java heap fails
-XX:+HeapDumpOnOutOfMemoryError

# specify an alternative path for heap dumps
# ensure the directory exists and has sufficient space
-XX:HeapDumpPath=data

## GC logging
8:-XX:+PrintGCDetails
8:-XX:+PrintGCDateStamps
8:-XX:+PrintTenuringDistribution
8:-XX:+PrintGCApplicationStoppedTime
8:-Xloggc:logs/gc.log
8:-XX:+UseGCLogFileRotation
8:-XX:NumberOfGCLogFiles=32
8:-XX:GCLogFileSize=64m

# JDK 9+ GC logging
9-:-Xlog:gc*,gc+age=trace,safepoint:file=logs/gc.log:utctime,pid,tags:filecount=32,filesize=64m`;
}

/**
 * Generate Log4j2 configuration
 */
function generateLog4j2Config(logsPath) {
  return `status = error

# log action execution errors for easier debugging
logger.action.name = org.elasticsearch.action
logger.action.level = debug

appender.console.type = Console
appender.console.name = console
appender.console.layout.type = PatternLayout
appender.console.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %m%n

appender.rolling.type = RollingFile
appender.rolling.name = rolling
appender.rolling.fileName = ${logsPath}/elasticsearch.log
appender.rolling.layout.type = PatternLayout
appender.rolling.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %.-10000m%n
appender.rolling.filePattern = ${logsPath}/elasticsearch-%d{yyyy-MM-dd}-%i.log.gz
appender.rolling.policies.type = Policies
appender.rolling.policies.time.type = TimeBasedTriggeringPolicy
appender.rolling.policies.time.interval = 1
appender.rolling.policies.time.modulate = true
appender.rolling.policies.size.type = SizeBasedTriggeringPolicy
appender.rolling.policies.size.size = 128MB
appender.rolling.strategy.type = DefaultRolloverStrategy
appender.rolling.strategy.fileIndex = nomax
appender.rolling.strategy.action.type = Delete
appender.rolling.strategy.action.basepath = ${logsPath}
appender.rolling.strategy.action.condition.type = IfFileName
appender.rolling.strategy.action.condition.glob = elasticsearch-*
appender.rolling.strategy.action.condition.nested_condition.type = IfAccumulatedFileSize
appender.rolling.strategy.action.condition.nested_condition.exceeds = 2GB

rootLogger.level = info
rootLogger.appenderRef.console.ref = console
rootLogger.appenderRef.rolling.ref = rolling

appender.deprecation_rolling.type = RollingFile
appender.deprecation_rolling.name = deprecation_rolling
appender.deprecation_rolling.fileName = ${logsPath}/elasticsearch_deprecation.log
appender.deprecation_rolling.layout.type = PatternLayout
appender.deprecation_rolling.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %.-10000m%n
appender.deprecation_rolling.filePattern = ${logsPath}/elasticsearch_deprecation-%i.log.gz
appender.deprecation_rolling.policies.type = Policies
appender.deprecation_rolling.policies.size.type = SizeBasedTriggeringPolicy
appender.deprecation_rolling.policies.size.size = 1GB
appender.deprecation_rolling.strategy.type = DefaultRolloverStrategy
appender.deprecation_rolling.strategy.max = 4

logger.deprecation.name = org.elasticsearch.deprecation
logger.deprecation.level = warn
logger.deprecation.appenderRef.deprecation_rolling.ref = deprecation_rolling
logger.deprecation.additivity = false

appender.index_search_slowlog_rolling.type = RollingFile
appender.index_search_slowlog_rolling.name = index_search_slowlog_rolling
appender.index_search_slowlog_rolling.fileName = ${logsPath}/elasticsearch_index_search_slowlog.log
appender.index_search_slowlog_rolling.layout.type = PatternLayout
appender.index_search_slowlog_rolling.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %.-10000m%n
appender.index_search_slowlog_rolling.filePattern = ${logsPath}/elasticsearch_index_search_slowlog-%d{yyyy-MM-dd}-%i.log.gz
appender.index_search_slowlog_rolling.policies.type = Policies
appender.index_search_slowlog_rolling.policies.time.type = TimeBasedTriggeringPolicy
appender.index_search_slowlog_rolling.policies.time.interval = 1
appender.index_search_slowlog_rolling.policies.time.modulate = true
appender.index_search_slowlog_rolling.policies.size.type = SizeBasedTriggeringPolicy
appender.index_search_slowlog_rolling.policies.size.size = 128MB
appender.index_search_slowlog_rolling.strategy.type = DefaultRolloverStrategy
appender.index_search_slowlog_rolling.strategy.fileIndex = nomax
appender.index_search_slowlog_rolling.strategy.action.type = Delete
appender.index_search_slowlog_rolling.strategy.action.basepath = ${logsPath}
appender.index_search_slowlog_rolling.strategy.action.condition.type = IfFileName
appender.index_search_slowlog_rolling.strategy.action.condition.glob = elasticsearch_index_search_slowlog-*
appender.index_search_slowlog_rolling.strategy.action.condition.nested_condition.type = IfAccumulatedFileSize
appender.index_search_slowlog_rolling.strategy.action.condition.nested_condition.exceeds = 2GB

logger.index_search_slowlog_rolling.name = index.search.slowlog
logger.index_search_slowlog_rolling.level = trace
logger.index_search_slowlog_rolling.appenderRef.index_search_slowlog_rolling.ref = index_search_slowlog_rolling
logger.index_search_slowlog_rolling.additivity = false`;
}

/**
 * Generate service script for node
 */
function generateServiceScript(nodeName, configDir, port, env) {
  if (env.isWindows) {
    return `@echo off
set ES_PATH_CONF=${configDir}
set ES_JAVA_OPTS=-Xms1g -Xmx1g
"${path.join(env.baseElasticsearchPath, "bin", "elasticsearch.bat")}"`;
  } else {
    return `#!/bin/bash
export ES_PATH_CONF="${configDir}"
export ES_JAVA_OPTS="-Xms1g -Xmx1g"
"${path.join(env.baseElasticsearchPath, "bin", "elasticsearch")}"`;
  }
}

/**
 * Get node configuration
 */
async function getNodeConfig(nodeName) {
  try {
    const env = getEnvAndConfig();
    const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
    const configPath = path.join(nodeBaseDir, "config", "elasticsearch.yml");
    
    try {
      const configContent = await fs.readFile(configPath, "utf8");
      const config = yaml.parse(configContent);
      return {
        node: {
          name: config["node.name"] || nodeName,
          roles: config["node.roles"] ? parseRoles(config["node.roles"]) : { master: true, data: true, ingest: true }
        },
        cluster: {
          name: config["cluster.name"] || "trustquery-cluster"
        },
        network: {
          host: config["network.host"] || "localhost"
        },
        http: {
          port: config["http.port"] || 9200
        },
        transport: {
          port: config["transport.port"] || 9300
        },
        path: {
          data: config["path.data"] || path.join(nodeBaseDir, "data"),
          logs: config["path.logs"] || path.join(nodeBaseDir, "logs")
        }
      };
    } catch (readError) {
      if (readError.code === "ENOENT") {
        // Return default configuration if file doesn't exist
        return {
          node: {
            name: nodeName,
            roles: { master: true, data: true, ingest: true }
          },
          cluster: {
            name: "trustquery-cluster"
          },
          network: {
            host: "localhost"
          },
          http: {
            port: 9200
          },
          transport: {
            port: 9300
          },
          path: {
            data: path.join(nodeBaseDir, "data"),
            logs: path.join(nodeBaseDir, "logs")
          }
        };
      }
      throw readError;
    }
  } catch (error) {
    console.error(`Error reading config for node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Parse node roles from config string or array
 */
function parseRoles(rolesConfig) {
  const roles = {
    master: false,
    data: false,
    ingest: false
  };

  if (Array.isArray(rolesConfig)) {
    rolesConfig.forEach(role => {
      if (role in roles) {
        roles[role] = true;
      }
    });
  } else if (typeof rolesConfig === "string") {
    rolesConfig.split(",").map(r => r.trim()).forEach(role => {
      if (role in roles) {
        roles[role] = true;
      }
    });
  }

  // If no roles were set, default to all roles
  if (!roles.master && !roles.data && !roles.ingest) {
    roles.master = true;
    roles.data = true;
    roles.ingest = true;
  }

  return roles;
}

/**
 * Get node configuration content as string
 */
async function getNodeConfigContent(nodeName) {
  try {
    const env = getEnvAndConfig();
    const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
    const configPath = path.join(nodeBaseDir, "config", "elasticsearch.yml");
    
    try {
      return await fs.readFile(configPath, "utf8");
    } catch (readError) {
      if (readError.code === "ENOENT") {
        // Return default configuration content if file doesn't exist
        const defaultConfig = generateNodeConfig({
          name: nodeName,
          dataPath: path.join(nodeBaseDir, "data"),
          logsPath: path.join(nodeBaseDir, "logs"),
          roles: { master: true, data: true, ingest: true }
        });
        return defaultConfig;
      }
      throw readError;
    }
  } catch (error) {
    console.error(`Error reading config content for node ${nodeName}:`, error);
    throw error;
  }
}

module.exports = {
  getEnvAndConfig,
  generateNodeConfig,
  generateJVMOptions,
  generateLog4j2Config,
  generateServiceScript,
  getNodeConfig,
  getNodeConfigContent,
  formatNodeRoles,
}; 