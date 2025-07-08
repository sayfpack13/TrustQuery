// Elasticsearch Cluster Management System
const fs = require("fs").promises;
const path = require("path");
const { execSync, spawn } = require("child_process");
const { getConfig, setConfig } = require("../config");
const yaml = require("yaml");


/**
 * Build canonical node metadata object from any node config or detection source.
 * Ensures all required fields are present and consistent.
 * @param {object} nodeConfig - Raw node config or detection result
 * @returns {object} Canonical node metadata
 */
function buildNodeMetadata(nodeConfig) {
  if (!nodeConfig) return {};
  const {
    name,
    configPath,
    servicePath,
    dataPath,
    logsPath,
    cluster,
    host,
    port,
    transportPort,
    roles,
    heapSize,
    nodeUrl,
  } = nodeConfig;
  const url = nodeUrl || (host && port ? `http://${host}:${port}` : undefined);
  return {
    nodeUrl: url,
    name: name || '',
    configPath: configPath || '',
    servicePath: servicePath || '',
    dataPath: dataPath || '',
    logsPath: logsPath || '',
    cluster: cluster || 'trustquery-cluster',
    host: host || 'localhost',
    port: port !== undefined ? port : 9200,
    transportPort: transportPort !== undefined ? transportPort : 9300,
    roles: roles || { master: true, data: true, ingest: true },
    heapSize: heapSize || '1g',
  };
}


// Helper to get environment and config info
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

// Initialize cluster management system
async function initialize() {
  try {
    const env = getEnvAndConfig();
    const esExists = await checkElasticsearchInstallation(env);
    if (!esExists) {
      throw new Error(
        "Elasticsearch installation not found. Please install Elasticsearch first."
      );
    }
    await createBaseDirectories(env);
    console.log("✅ Elasticsearch Cluster Manager initialized");
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize cluster manager:", error);
    throw error;
  }
}

// Check if Elasticsearch is installed
async function checkElasticsearchInstallation(env) {
  try {
    const binName = env.isWindows ? "elasticsearch.bat" : "elasticsearch";
    const elasticsearchBin = path.join(
      env.baseElasticsearchPath,
      "bin",
      binName
    );
    await fs.access(elasticsearchBin);
    return true;
  } catch (error) {
    console.warn("Elasticsearch not found at default location");
    return false;
  }
}

// Create base directories for cluster
async function createBaseDirectories(env) {
  const baseDirs = [
    path.join(env.baseElasticsearchPath, "nodes"),
    path.join(env.baseElasticsearchPath, "data"),
    path.join(env.baseElasticsearchPath, "logs"),
    path.join(env.baseElasticsearchPath, "config"),
  ];

  // First check if we can create the base directory
  try {
    await fs.mkdir(env.baseElasticsearchPath, { recursive: true });
  } catch (error) {
    if (error.code === "EPERM") {
      throw new Error(
        `Permission denied: Cannot create directory at ${env.baseElasticsearchPath}. Please choose a different location or run with appropriate permissions.`
      );
    }
    throw error;
  }

  for (const dir of baseDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    } catch (error) {
      if (error.code === "EPERM") {
        throw new Error(
          `Permission denied: Cannot create directory at ${dir}. Please choose a different location or run with appropriate permissions.`
        );
      } else if (error.code !== "EEXIST") {
        console.error(`Failed to create directory ${dir}:`, error);
        throw error;
      }
    }
  }
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
 * Create a new Elasticsearch node
 */
async function createNode(nodeConfig) {
  try {
    const {
      name,
      host = "localhost",
      port = 9200,
      transportPort = 9300,
      dataPath,
      logsPath,
      roles = { master: true, data: true, ingest: true },
      heapSize = "1g",
    } = nodeConfig;

    // Accept cluster name from either 'cluster' or 'clusterName' (frontend sends 'cluster')
    const clusterName =
      nodeConfig.cluster || nodeConfig.clusterName || "trustquery-cluster";

    if (!name) {
      throw new Error("Node name is required");
    }

    const env = getEnvAndConfig();
    const baseElasticsearchPath = env.baseElasticsearchPath;
    const isLinux = env.isLinux;
    const isWindows = env.isWindows;

    if (!baseElasticsearchPath) {
      throw new Error("Base Elasticsearch path is not set in configuration.");
    }

    const nodeBaseDir = path.join(baseElasticsearchPath, "nodes", name);
    const finalDataPath = dataPath || path.join(nodeBaseDir, "data");
    const finalLogsPath = logsPath || path.join(nodeBaseDir, "logs");

    await fs.mkdir(finalDataPath, { recursive: true });
    await fs.mkdir(finalLogsPath, { recursive: true });

    const nodeConfigDir = path.join(nodeBaseDir, "config");
    await fs.mkdir(nodeConfigDir, { recursive: true });

    // --- Linux: Ensure correct permissions and ownership for all node dirs and custom data/logs paths ---
    if (isLinux) {
      const { execSync } = require("child_process");
      try {
        execSync(`chown -R elasticsearch:elasticsearch "${nodeConfigDir}"`);
        execSync(`chmod -R 770 "${nodeConfigDir}"`);
        execSync(`chown -R elasticsearch:elasticsearch "${finalDataPath}"`);
        execSync(`chmod -R 770 "${finalDataPath}"`);
        execSync(`chown -R elasticsearch:elasticsearch "${finalLogsPath}"`);
        execSync(`chmod -R 770 "${finalLogsPath}"`);
      } catch (err) {
        console.warn(
          "Could not set ownership/permissions for node directories:",
          err.message
        );
      }
    }

    const configContent = generateNodeConfig({
      name,
      host,
      port,
      transportPort,
      dataPath: finalDataPath,
      logsPath: finalLogsPath,
      roles,
      clusterName,
    });

    const configPath = path.join(nodeConfigDir, "elasticsearch.yml");
    await fs.writeFile(configPath, configContent);

    const jvmOptions = generateJVMOptions(heapSize);
    const jvmPath = path.join(nodeConfigDir, "jvm.options");
    await fs.writeFile(jvmPath, jvmOptions);

    const log4j2Config = generateLog4j2Config(finalLogsPath);
    const log4j2Path = path.join(nodeConfigDir, "log4j2.properties");
    await fs.writeFile(log4j2Path, log4j2Config);

    // Create service script for the correct platform
    const serviceScript = generateServiceScript(name, nodeConfigDir, port, env);
    const serviceFileName = isWindows ? "start-node.bat" : "start-node.sh";
    const servicePath = path.join(nodeConfigDir, serviceFileName);
    await fs.writeFile(servicePath, serviceScript);
    if (!isWindows) {
      // Set executable permissions for .sh
      await fs.chmod(servicePath, 0o755);
    }

    console.log(`✅ Created node configuration: ${name}`);

    // Build canonical metadata
    const metadata = buildNodeMetadata({
      nodeUrl: `http://${host}:${port}`,
      name,
      dataPath: finalDataPath,
      logsPath: finalLogsPath,
      cluster: clusterName,
      port,
      transportPort,
      configPath,
      servicePath,
      heapSize,
      host,
      roles,
    });
    // Save metadata to config (keyed by node name)
    const currentConfig = getConfig();
    const updatedMetadata = {
      ...currentConfig.nodeMetadata,
      [name]: metadata,
    };
    setConfig("nodeMetadata", updatedMetadata);
    return metadata;
  } catch (error) {
    console.error(`❌ Failed to create node ${nodeConfig.name}:`, error);
    throw error;
  }
}

/**
 * Generate JVM options for node
 */
function generateJVMOptions(heapSize = "1g") {
  return `# JVM Options for Elasticsearch Node

# Heap size (adjust based on your system)
-Xms${heapSize}
-Xmx${heapSize}

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
function generateLog4j2Config(logsPath) {
  // Convert Windows path to forward slashes for log4j2
  const logPath = logsPath.replace(/\\/g, "/");

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
 * Generate cross-platform service script for node startup
 */
function generateServiceScript(nodeName, configDir, port, env) {
  if (env.isWindows) {
    return `@echo off
REM Start Elasticsearch Node: ${nodeName}
REM Port: ${port}

echo Starting Elasticsearch node: ${nodeName}
echo Config directory: ${configDir}
echo Port: ${port}

REM Set environment variables
set ES_HOME=${env.baseElasticsearchPath}
set ES_PATH_CONF=${configDir}
set ES_JAVA_OPTS=-Xms1g -Xmx1g

REM Start Elasticsearch
"%ES_HOME%\\bin\\elasticsearch.bat"
`;
  } else {
    // Linux/Mac shell script with root check
    return `#!/bin/bash
# Start Elasticsearch Node: ${nodeName}
# Port: ${port}

if [ "$(id -u)" = "0" ]; then
  echo "[ERROR] Refusing to start Elasticsearch as root. Please run as the 'elasticsearch' user or a non-root user." >&2
  exit 1
fi

echo "Starting Elasticsearch node: ${nodeName}"
echo "Config directory: ${configDir}"
echo "Port: ${port}"

export ES_HOME="${env.baseElasticsearchPath}"
export ES_PATH_CONF="${configDir}"
export ES_JAVA_OPTS="-Xms1g -Xmx1g"

"$ES_HOME/bin/elasticsearch" &
`;
  }
}

/**
 * Start an Elasticsearch node
 */
async function startNode(nodeName) {
  const env = getEnvAndConfig();
  const metadata = getNodeMetadata(nodeName);
  let servicePath;
  if (metadata && metadata.servicePath) {
    servicePath = metadata.servicePath;
  } else {
    const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
    servicePath = path.join(
      env.baseElasticsearchPath,
      "nodes",
      nodeName,
      "config",
      serviceFileName
    );
  }
  // Ensure service file exists
  try {
    await fs.access(servicePath);
  } catch (error) {
    throw new Error(`Service file not found: ${servicePath}`);
  }
  // Get node config for port and log path
  const nodeConfig = await getNodeConfig(nodeName);
  const logDir = (await getNodeMetadata(nodeName)).logsPath;
  await fs.mkdir(logDir, { recursive: true });
  const startupLogPath = path.join(logDir, "startup.log");
  const output = await fs.open(startupLogPath, "a");
  // Spawn process
  let child;
  if (env.isWindows) {
    child = spawn(servicePath, [], {
      detached: true,
      stdio: ["ignore", output, output],
      shell: true,
      windowsHide: true,
    });
  } else if (env.isLinux) {
    // Ensure the service script is executable
    try {
      await fs.chmod(servicePath, 0o755);
    } catch (chmodErr) {
      console.warn(
        `Could not chmod service script: ${servicePath} - ${chmodErr.message}`
      );
    }

    // Check if running as root
    let isRoot = false;
    try {
      isRoot = process.getuid && process.getuid() === 0;
    } catch {}

    // Check if 'elasticsearch' user exists
    let esUserExists = false;
    try {
      execSync("id -u elasticsearch", { stdio: "ignore" });
      esUserExists = true;
    } catch (e) {
      esUserExists = false;
    }

    // Check if 'sudo' is available
    let sudoAvailable = false;
    try {
      execSync("which sudo", { stdio: "ignore" });
      sudoAvailable = true;
    } catch (e) {
      sudoAvailable = false;
    }

    if (isRoot) {
      // If root, must use sudo -u elasticsearch bash servicePath
      if (!sudoAvailable) {
        throw new Error(
          "Cannot start Elasticsearch node as root and 'sudo' is not available. Please install sudo and ensure the 'elasticsearch' user exists, or run as a non-root user."
        );
      }
      if (!esUserExists) {
        // Try to create the user
        try {
          execSync("sudo useradd -r -s /usr/sbin/nologin elasticsearch", {
            stdio: "ignore",
          });
          esUserExists = true;
          console.log("Created elasticsearch user.");
        } catch (err) {
          throw new Error(
            "Cannot create 'elasticsearch' user automatically. Please create it manually and re-run."
          );
        }
      }
      // Start as elasticsearch user
      console.log(
        `🚀 Starting node ${nodeName} as 'elasticsearch' user using: sudo -u elasticsearch bash ${servicePath}`
      );
      child = spawn("sudo", ["-u", "elasticsearch", "bash", servicePath], {
        detached: true,
        stdio: ["ignore", output, output],
        shell: false,
        env: {
          ...process.env,
          ES_HOME: env.baseElasticsearchPath,
          ES_PATH_CONF: path.dirname(servicePath),
          ES_JAVA_OPTS: "-Xms1g -Xmx1g",
        },
      });
      child.unref();
    } else {
      // Always use bash to run the script for non-root
      let user = "";
      try {
        user = execSync("whoami").toString().trim();
      } catch {}
      if (user !== "elasticsearch") {
        console.warn(
          `⚠️  Not running as 'elasticsearch' user. Current user: ${user}. Elasticsearch may refuse to start if not run as 'elasticsearch'.`
        );
      }
      child = spawn("bash", [servicePath], {
        detached: true,
        stdio: ["ignore", output, output],
        shell: false,
        env: {
          ...process.env,
          ES_HOME: env.baseElasticsearchPath,
          ES_PATH_CONF: path.dirname(servicePath),
          ES_JAVA_OPTS: "-Xms1g -Xmx1g",
        },
      });
      child.unref();
    }
    // No fixed delay; port polling below will handle readiness
  } else {
    // Mac or other Unix
    try {
      await fs.chmod(servicePath, 0o755);
    } catch (chmodErr) {
      console.warn(
        `Could not chmod service script: ${servicePath} - ${chmodErr.message}`
      );
    }
    child = spawn(servicePath, [], {
      detached: true,
      stdio: ["ignore", output, output],
      shell: false,
      env: {
        ...process.env,
        ES_HOME: env.baseElasticsearchPath,
        ES_PATH_CONF: path.dirname(servicePath),
        ES_JAVA_OPTS: "-Xms1g -Xmx1g",
      },
    });
    child.unref();
    // No fixed delay; port polling below will handle readiness
  }
  // Write PID file immediately
  let nodeConfigDir;
  if (metadata && metadata.configPath) {
    nodeConfigDir = path.dirname(metadata.configPath);
  } else {
    nodeConfigDir = path.join(
      env.baseElasticsearchPath,
      "nodes",
      nodeName,
      "config"
    );
  }
  const pidFilePath = path.join(nodeConfigDir, "pid.json");
  await fs.writeFile(pidFilePath, JSON.stringify({ pid: child.pid }), "utf8");
  // Poll for port readiness (background, not blocking PID file)
  const port = nodeConfig.http.port;
  let foundPid = null;
  for (let i = 0; i < 60; i++) {
    // up to 60s
    foundPid = await findPidByPort(port);
    if (foundPid) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await output.close();
  if (foundPid) {
    // Optionally update PID file if different
    if (foundPid !== child.pid) {
      await fs.writeFile(
        pidFilePath,
        JSON.stringify({ pid: foundPid }),
        "utf8"
      );
    }
    // Re-initialize clients
    try {
      const { initializeElasticsearchClients } = require("./client");
      initializeElasticsearchClients();
    } catch {}
    // Refresh cache
    try {

      await refreshCache();
      await syncSearchIndices();
    } catch {}
    return { success: true, pid: foundPid };
  } else {
    // Read logs for debugging
    let startupLog = "";
    let esLog = "";
    try {
      startupLog = await fs.readFile(startupLogPath, "utf8");
    } catch {}
    try {
      esLog = await fs.readFile(
        path.join(nodeConfig.path.logs, "elasticsearch.log"),
        "utf8"
      );
    } catch {}
    throw new Error(
      `Failed to confirm node start for ${nodeName}.\nStartup log:\n${startupLog.slice(
        -1000
      )}\nES log:\n${esLog.slice(-1000)}`
    );
  }
}

// --- CLEAN, ROBUST CROSS-PLATFORM PORT-TO-PID DETECTION ---
async function findPidByPort(port) {
  const { isWindows } = getEnvAndConfig();
  try {
    if (isWindows) {
      let output = "";
      try {
        output = execSync(`netstat -ano | findstr :${port}`, {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e) {
        output = "";
      }
      const lines = output.trim().split(/\r?\n/);
      for (const line of lines) {
        // Accept any line with :PORT and LISTENING (IPv4 or IPv6)
        if (line.includes(`:${port}`) && /LISTENING/i.test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) {
            console.log(`[findPidByPort] Windows: Matched line: ${line}`);
            return pid;
          }
        }
      }
    } else {
      // Try netstat -tulnp (tcp and tcp6)
      let output = "";
      try {
        output = execSync("netstat -tulnp", {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e) {
        try {
          output = execSync("ss -tulnp", { encoding: "utf8", stdio: "pipe" });
        } catch (e2) {
          try {
            output = execSync(`lsof -i :${port} -n -P`, {
              encoding: "utf8",
              stdio: "pipe",
            });
          } catch (e3) {
            output = "";
          }
        }
      }
      const lines = output.trim().split(/\r?\n/);
      for (const line of lines) {
        // Accept both tcp and tcp6, and all interfaces
        if (line.match(new RegExp(`(tcp|tcp6).*[:.]${port}\\b`, "i"))) {
          // netstat: last column is PID/Program
          const pidMatch = line.match(
            /\s(\d+)\/(java|elasticsearch|node|python|[a-zA-Z]+)/
          );
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            if (pid > 0) {
              console.log(`[findPidByPort] Linux: Matched line: ${line}`);
              return pid;
            }
          }
          // ss: users:(('java',pid=1359846,fd=123))
          const ssPidMatch = line.match(/pid=(\d+)/);
          if (ssPidMatch) {
            const pid = parseInt(ssPidMatch[1], 10);
            if (pid > 0) {
              console.log(`[findPidByPort] Linux(ss): Matched line: ${line}`);
              return pid;
            }
          }
          // lsof: second column is PID
          const lsofPidMatch = line.match(/^\S+\s+(\d+)\s/);
          if (lsofPidMatch) {
            const pid = parseInt(lsofPidMatch[1], 10);
            if (pid > 0) {
              console.log(`[findPidByPort] Linux(lsof): Matched line: ${line}`);
              return pid;
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(`[findPidByPort] Error: ${e.message}`);
  }
  return null;
}

/**
 * Stop an Elasticsearch node
 */
async function stopNode(nodeName) {
  try {
    const env = getEnvAndConfig();
    // Get the correct PID file path from metadata
    const metadata = getNodeMetadata(nodeName);
    let pidFilePath;

    if (metadata && metadata.configPath) {
      const configDir = path.dirname(metadata.configPath);
      pidFilePath = path.join(configDir, "pid.json");
    } else {
      // Fallback to new organized path structure
      pidFilePath = path.join(
        env.baseElasticsearchPath,
        "nodes",
        nodeName,
        "config",
        "pid.json"
      );
    }

    console.log(`🔍 Looking for PID file at: ${pidFilePath}`);

    try {
      const pidData = await fs.readFile(pidFilePath, "utf8");
      const { pid } = JSON.parse(pidData);

      if (pid) {
        console.log(`🔌 Attempting to stop node ${nodeName} with PID: ${pid}`);
        const isWindows = process.platform === "win32";
        const isLinux = process.platform === "linux";

        // Check if process is actually running first
        let processRunning = false;
        try {
          if (isWindows) {
            execSync(`tasklist /FI "PID eq ${pid}" | find "${pid}"`, {
              stdio: "ignore",
            });
          } else if (isLinux) {
            execSync(`ps -p ${pid}`, { stdio: "ignore" });
          }
          processRunning = true;
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

        // Kill the process
        try {
          if (isWindows) {
            execSync(`taskkill /F /PID ${pid}`, {
              stdio: "pipe",
              timeout: 10000,
            });
            console.log(`✅ Successfully terminated process ${pid}`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              execSync(`tasklist /FI "PID eq ${pid}" | find "${pid}"`, {
                stdio: "ignore",
              });
              console.warn(
                `⚠️ Process ${pid} still running after kill command`
              );
            } catch (verifyError) {
              console.log(`✅ Process ${pid} confirmed terminated`);
            }
          } else if (isLinux) {
            // Try to kill as current user, then escalate if needed
            let killed = false;
            try {
              execSync(`kill -9 ${pid}`);
              killed = true;
              console.log(`✅ kill -9 ${pid} succeeded`);
            } catch (killError) {
              console.warn(`⚠️ kill -9 ${pid} failed: ${killError.message}`);
            }
            if (!killed) {
              // Try with sudo
              try {
                execSync(`sudo kill -9 ${pid}`);
                killed = true;
                console.log(`✅ sudo kill -9 ${pid} succeeded`);
              } catch (sudoError) {
                console.warn(
                  `⚠️ sudo kill -9 ${pid} failed: ${sudoError.message}`
                );
              }
            }
            if (!killed) {
              // Fallback: try pkill by user and node name
              try {
                execSync(`sudo pkill -u elasticsearch -f ${nodeName}`);
                killed = true;
                console.log(
                  `✅ sudo pkill -u elasticsearch -f ${nodeName} succeeded`
                );
              } catch (pkillError) {
                console.warn(
                  `⚠️ sudo pkill -u elasticsearch -f ${nodeName} failed: ${pkillError.message}`
                );
              }
            }
            // Wait a moment for the process to fully terminate
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // Verify the process is actually gone
            let stillRunning = false;
            try {
              execSync(`ps -p ${pid}`, { stdio: "ignore" });
              stillRunning = true;
            } catch (verifyError) {
              stillRunning = false;
            }
            if (stillRunning) {
              console.warn(
                `⚠️ Process ${pid} still running after kill attempts`
              );
            } else {
              console.log(`✅ Process ${pid} confirmed terminated`);
            }
          }
        } catch (killError) {
          if (isWindows && killError.status === 128) {
            // Process not found - already stopped
            console.log(
              `ℹ️ Process ${pid} not found during kill - already stopped`
            );
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
      if (error.code === "ENOENT") {
        console.warn(
          `PID file not found for node ${nodeName}. It might already be stopped.`
        );
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
async function getNodeConfig(nodeName) {
  const env = getEnvAndConfig();
  // First try to get the config path from metadata
  const metadata = getNodeMetadata(nodeName);
  let configPath;

  if (metadata && metadata.configPath) {
    configPath = metadata.configPath;
    console.log(`🔍 Using config path from metadata: ${configPath}`);
  } else {
    // Fallback to new organized path structure
    configPath = path.join(
      env.baseElasticsearchPath,
      "nodes",
      nodeName,
      "config",
      "elasticsearch.yml"
    );
    console.log(`🔍 Using new organized config path: ${configPath}`);
  }

  try {
    const configContent = await fs.readFile(configPath, "utf8");
    const flatConfig = yaml.parse(configContent);

    // Transform flat config (e.g., 'node.name') into a nested object
    const nestedConfig = {
      cluster: {
        name: flatConfig["cluster.name"] || "default-cluster",
      },
      node: {
        name: flatConfig["node.name"] || nodeName,
      },
      network: {
        host: flatConfig["network.host"] || "localhost",
      },
      http: {
        port: flatConfig["http.port"] || "9200",
      },
      transport: {
        port: flatConfig["transport.port"] || "9300",
      },
      path: {
        data: flatConfig["path.data"],
        logs: flatConfig["path.logs"],
      },
    };
    return nestedConfig;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(
        `Configuration file not found for ${nodeName}. Returning default.`
      );
      // Return a default nested structure
      return {
        cluster: { name: "default-cluster" },
        node: { name: nodeName },
        network: { host: "localhost" },
        http: { port: "9200" },
        transport: { port: "9300" },
        path: { data: "", logs: "" },
      };
    }
    throw error;
  }
}

/**
 * List all configured nodes
 */
async function listNodes() {
  const env = getEnvAndConfig();
  const nodesDir = path.join(env.baseElasticsearchPath, "nodes");
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
          const config = await getNodeConfig(nodeDirName);

          // The true name comes from the config file itself.
          const definitiveNodeName = config.node.name;
          // Only log significant events, not every node discovery

          const metadata = getNodeMetadata(definitiveNodeName);

          nodes.push({
            name: definitiveNodeName,
            cluster: config.cluster.name,
            host: config.network.host,
            port: config.http.port,
            transportPort: config.transport.port,
            roles: config.node.roles || {
              master: true,
              data: true,
              ingest: true,
            },
            isRunning: await isNodeRunning(definitiveNodeName),
            dataPath: metadata.dataPath,
            logsPath: metadata.logsPath,
            heapSize: metadata.heapSize, // <-- Add heapSize from metadata if present
          });
        } catch (configError) {
          console.warn(
            `⚠️ Skipping node directory ${nodeDirName}: ${configError.message}`
          );
        }
      }
    }

    // Only log summary when nodes are found, reduce spam
    if (nodes.length > 0) {
      console.log(`✅ Listed ${nodes.length} nodes from directory structure`);
    }
    return nodes;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(
        `Nodes directory not found at ${nodesDir}, returning no nodes.`
      );
      return [];
    }
    console.error("❌ Failed to list nodes:", error);
    return [];
  }
}

/**
 * Helper to get metadata from config.json (which is now less important but useful for paths)
 */
function getNodeMetadata(nodeName) {
  const env = getEnvAndConfig();
  const config = getConfig();
  const nodeMetadata = config.nodeMetadata || {};
  // Use node name as key
  if (nodeMetadata[nodeName]) {
    return buildNodeMetadata(nodeMetadata[nodeName]);
  }
  // Return canonical default structure if not in metadata
  const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
  const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
  return buildNodeMetadata({
    name: nodeName,
    configPath: path.join(nodeBaseDir, "config", "elasticsearch.yml"),
    servicePath: path.join(nodeBaseDir, "config", serviceFileName),
    dataPath: path.join(nodeBaseDir, "data"),
    logsPath: path.join(nodeBaseDir, "logs"),
    cluster: env.config.elasticsearchConfig?.cluster || 'trustquery-cluster',
    host: 'localhost',
    port: 9200,
    transportPort: 9300,
    roles: { master: true, data: true, ingest: true },
    heapSize: '1g',
  });
}

/**
 * Get the content of a node's configuration file.
 */
async function getNodeConfigContent(nodeName) {
  const env = getEnvAndConfig();
  // Get the correct config path from metadata
  const metadata = getNodeMetadata(nodeName);
  let configPath;

  if (metadata && metadata.configPath) {
    configPath = metadata.configPath;
  } else {
    // Fallback to new organized path structure
    configPath = path.join(
      env.baseElasticsearchPath,
      "nodes",
      nodeName,
      "config",
      "elasticsearch.yml"
    );
  }

  try {
    const configContent = await fs.readFile(configPath, "utf8");
    return configContent;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Configuration file not found for node ${nodeName}.`);
    }
    throw error;
  }
}

/**
 * Remove a node configuration
 */
async function removeNode(nodeName) {
  let wasRunning = false;
  try {
    console.log(`🗑️ Starting removal process for node: ${nodeName}`);

    // Check if node is running and stop it first
    wasRunning = await isNodeRunning(nodeName);
    if (wasRunning) {
      console.log(`🛑 Node ${nodeName} is running, stopping it first...`);
      try {
        await stopNode(nodeName);

        // Wait a moment and verify it's actually stopped
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const stillRunning = await isNodeRunning(nodeName);
        if (stillRunning) {
          throw new Error(
            `Node ${nodeName} is still running after stop attempt`
          );
        }
        console.log(`✅ Node ${nodeName} successfully stopped`);
      } catch (stopError) {
        console.error(`❌ Failed to stop node ${nodeName}:`, stopError.message);
        throw new Error(
          `Cannot delete running node ${nodeName}. Stop failed: ${stopError.message}`
        );
      }
    } else {
      console.log(
        `✅ Node ${nodeName} is not running, proceeding with deletion`
      );
    }

    const config = getConfig();
    const nodeMetadata = config.nodeMetadata || {};
    // Use node name as key
    const metadata = nodeMetadata[nodeName];

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
            if (dirError.code !== "ENOENT") {
              console.warn(
                `⚠️ Could not remove directory ${dirPath}: ${dirError.message}`
              );
            } else {
              console.log(
                `ℹ️ Directory already removed or doesn't exist: ${dirPath}`
              );
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
          if (dirError.code !== "ENOENT") {
            console.warn(
              `⚠️ Could not remove config directory ${configDir}: ${dirError.message}`
            );
          } else {
            console.log(
              `ℹ️ Config directory already removed or doesn't exist: ${configDir}`
            );
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
        }
      } catch (e) {
        // Ignore if it fails (e.g., not empty, permissions, etc.)
        console.log(
          `ℹ️ Could not check/remove parent directory ${parentDir}: ${e.message}`
        );
      }
    } else {
      console.warn(
        `⚠️ No metadata found for node ${nodeName}. Will attempt to remove from new directory structure.`
      );

      // Use new organized structure as fallback
      const env = getEnvAndConfig();
      const nodeBaseDir = path.join(
        env.baseElasticsearchPath,
        "nodes",
        nodeName
      );
      try {
        await fs.rm(nodeBaseDir, { recursive: true, force: true });
        console.log(`🗑️ Removed node directory: ${nodeBaseDir}`);
      } catch (dirError) {
        if (dirError.code !== "ENOENT") {
          console.warn(
            `⚠️ Could not remove node directory ${nodeBaseDir}: ${dirError.message}`
          );
        }
      }
    }

    // Also try to remove from new organized structure if metadata exists
    if (metadata) {
      const env = getEnvAndConfig();
      const nodeBaseDir = path.join(
        env.baseElasticsearchPath,
        "nodes",
        nodeName
      );
      try {
        await fs.rm(nodeBaseDir, { recursive: true, force: true });
        console.log(`🗑️ Removed organized node directory: ${nodeBaseDir}`);
      } catch (dirError) {
        if (dirError.code !== "ENOENT") {
          console.warn(
            `⚠️ Could not remove organized node directory: ${dirError.message}`
          );
        }
      }
    }

    // Legacy cleanup - remove old config directory if it exists
    const env = getEnvAndConfig();
    const oldNodeConfigDir = path.join(
      env.baseElasticsearchPath,
      "config",
      nodeName
    );
    try {
      await fs.rm(oldNodeConfigDir, { recursive: true, force: true });
      console.log(
        `🗑️ Removed legacy node configuration directory: ${oldNodeConfigDir}`
      );
    } catch (dirError) {
      if (dirError.code !== "ENOENT") {
        console.warn(
          `⚠️ Could not remove legacy node configuration directory:`,
          dirError.message
        );
      }
    }

    // Clean up the metadata from the config file
    if (nodeMetadata[nodeName]) {
      const newMeta = { ...config.nodeMetadata };
      delete newMeta[nodeName];
      await setConfig("nodeMetadata", newMeta);
      console.log(`✅ Removed metadata for ${nodeName} from configuration.`);
    }

    console.log(`✅ Node ${nodeName} removal completed successfully`);
    return {
      success: true,
      message: `Node "${nodeName}" stopped and removed successfully`,
      wasRunning: wasRunning,
      metadataRemoved: !!metadata,
    };
  } catch (error) {
    console.error(`❌ Failed to remove node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Get cluster status
 */
async function getClusterStatus() {
  try {
    const nodes = await listNodes();
    const runningNodes = [];

    for (const node of nodes) {
      const isRunning = await isNodeRunning(node.name);
      runningNodes.push({
        ...node,
        isRunning,
        status: isRunning ? "running" : "stopped",
      });
    }

    return {
      totalNodes: nodes.length,
      runningNodes: runningNodes.filter((n) => n.isRunning).length,
      stoppedNodes: runningNodes.filter((n) => !n.isRunning).length,
      nodes: runningNodes,
    };
  } catch (error) {
    console.error("❌ Failed to get cluster status:", error);
    throw error;
  }
}

/**
 * Check if node is running
 */
async function isNodeRunning(nodeName) {
  const env = getEnvAndConfig();
  // Get the correct PID file path from metadata
  const metadata = getNodeMetadata(nodeName);
  let pidFilePath;

  if (metadata && metadata.configPath) {
    const configDir = path.dirname(metadata.configPath);
    pidFilePath = path.join(configDir, "pid.json");
  } else {
    // Fallback to new organized path structure
    pidFilePath = path.join(
      env.baseElasticsearchPath,
      "nodes",
      nodeName,
      "config",
      "pid.json"
    );
  }

  try {
    const pidData = await fs.readFile(pidFilePath, "utf8");
    const { pid } = JSON.parse(pidData);

    if (!pid) return false;

    if (env.isWindows) {
      // Windows: use tasklist
      const command = `tasklist /FI "PID eq ${pid}"`;
      const result = execSync(command, { encoding: "utf8" });
      return result.includes(pid);
    } else {
      // Linux/Mac: use ps
      const command = `ps -p ${pid}`;
      const result = execSync(command, { encoding: "utf8" });
      // The output will include the PID if the process is running
      return result
        .split("\n")
        .some((line) => line.trim().startsWith(pid.toString()));
    }
  } catch (error) {
    // If file doesn't exist or any other error, assume not running
    return false;
  }
}

/**
 * Update an existing Elasticsearch node configuration
 */
async function updateNode(nodeName, updates, options = {}) {
  try {
    console.log(`🔧 Updating node ${nodeName} with:`, updates);
    console.log(`🔧 Update options:`, options);

    // Get current node config and metadata
    const currentConfig = await getNodeConfig(nodeName);
    const currentMetadata = getNodeMetadata(nodeName);

    // Get the correct config path from metadata
    let configPath;

    if (currentMetadata && currentMetadata.configPath) {
      configPath = currentMetadata.configPath;
      console.log(
        `🔍 Using config path from metadata for update: ${configPath}`
      );
    } else {
      // Fallback to new organized path structure
      const env = getEnvAndConfig();
      configPath = path.join(
        env.baseElasticsearchPath,
        "nodes",
        nodeName,
        "config",
        "elasticsearch.yml"
      );
      console.log(
        `🔍 Using new organized config path for update: ${configPath}`
      );
    }

    // Create updated configuration object
    const updatedConfig = {
      "cluster.name": updates.cluster || currentConfig.cluster.name,
      "node.name": updates.name || currentConfig.node.name,
      "network.host": updates.host || currentConfig.network.host,
      "http.port": updates.port || currentConfig.http.port,
      "transport.port": updates.transportPort || currentConfig.transport.port,
      "path.data": updates.dataPath || currentConfig.path.data,
      "path.logs": updates.logsPath || currentConfig.path.logs,
      "node.roles": updates.roles
        ? `[${formatNodeRoles(updates.roles)}]`
        : `[${formatNodeRoles(
            currentConfig.node.roles || {
              master: true,
              data: true,
              ingest: true,
            }
          )}]`,
      "node.attr.custom_id": updates.name || currentConfig.node.name,
      "discovery.type": "single-node",
      "bootstrap.memory_lock": false,
      "xpack.security.enabled": false,
      "xpack.security.transport.ssl.enabled": false,
      "xpack.security.http.ssl.enabled": false,
    };

    // Update JVM options if heap size is provided
    if (updates.heapSize) {
      const configDir = path.dirname(configPath);
      const jvmPath = path.join(configDir, "jvm.options");
      const jvmOptions = generateJVMOptions(updates.heapSize);
      await fs.writeFile(jvmPath, jvmOptions);
      console.log(`✅ Updated JVM options with heap size: ${updates.heapSize}`);

      // Also update heapSize in nodeMetadata in config.json
      const config = getConfig();
      const nodeMetadata = config.nodeMetadata || {};
      // Find the metadata entry by node name
      const metaKey = Object.keys(nodeMetadata).find(
        (key) => nodeMetadata[key].name === nodeName
      );
      if (metaKey) {
        nodeMetadata[metaKey].heapSize = updates.heapSize;
        setConfig("nodeMetadata", nodeMetadata);
        console.log(
          `✅ Updated heapSize in nodeMetadata for node: ${nodeName}`
        );
      }
    }

    // Create new directories if paths have changed or don't exist
    const newDataPath = updates.dataPath || currentConfig.path.data;
    const newLogsPath = updates.logsPath || currentConfig.path.logs;

    if (newDataPath) {
      try {
        await fs.mkdir(newDataPath, { recursive: true });
        console.log(`📁 Ensured data directory exists: ${newDataPath}`);
      } catch (error) {
        console.warn(
          `⚠️ Could not create data directory ${newDataPath}:`,
          error.message
        );
      }
    }

    if (newLogsPath) {
      try {
        await fs.mkdir(newLogsPath, { recursive: true });
        console.log(`📁 Ensured logs directory exists: ${newLogsPath}`);
      } catch (error) {
        console.warn(
          `⚠️ Could not create logs directory ${newLogsPath}:`,
          error.message
        );
      }
    }

    // Generate new YAML configuration
    const configLines = [];
    configLines.push(
      `# Elasticsearch Configuration for ${updatedConfig["node.name"]}`
    );
    configLines.push(`# Updated automatically by TrustQuery`);
    configLines.push("");
    configLines.push("# Cluster settings");
    configLines.push(`cluster.name: ${updatedConfig["cluster.name"]}`);
    configLines.push(`node.name: ${updatedConfig["node.name"]}`);
    configLines.push("");
    configLines.push("# Network settings");
    configLines.push(`network.host: ${updatedConfig["network.host"]}`);
    configLines.push(`http.port: ${updatedConfig["http.port"]}`);
    configLines.push(`transport.port: ${updatedConfig["transport.port"]}`);
    configLines.push("");
    configLines.push("# Path settings");
    configLines.push(`path.data: ${updatedConfig["path.data"]}`);
    configLines.push(`path.logs: ${updatedConfig["path.logs"]}`);
    configLines.push("");
    configLines.push("# Node roles");
    configLines.push(`node.roles: ${updatedConfig["node.roles"]}`);
    configLines.push("");
    configLines.push("# Custom attribute for shard allocation");
    configLines.push(
      `node.attr.custom_id: ${updatedConfig["node.attr.custom_id"]}`
    );
    configLines.push("");
    configLines.push("# Discovery settings");
    configLines.push(`discovery.type: ${updatedConfig["discovery.type"]}`);
    configLines.push("");
    configLines.push("# Memory settings");
    configLines.push(
      `bootstrap.memory_lock: ${updatedConfig["bootstrap.memory_lock"]}`
    );
    configLines.push("");
    configLines.push("# Security settings (basic)");
    configLines.push(
      `xpack.security.enabled: ${updatedConfig["xpack.security.enabled"]}`
    );
    configLines.push(
      `xpack.security.transport.ssl.enabled: ${updatedConfig["xpack.security.transport.ssl.enabled"]}`
    );
    configLines.push(
      `xpack.security.http.ssl.enabled: ${updatedConfig["xpack.security.http.ssl.enabled"]}`
    );
    configLines.push("");

    const newConfigContent = configLines.join("\n");

    // Write updated configuration to file
    await fs.writeFile(configPath, newConfigContent);
    console.log(`✅ Updated configuration file: ${configPath}`);

    // Update log4j2.properties if logs path changed
    if (updates.logsPath && updates.logsPath !== currentConfig.path.logs) {
      try {
        const log4j2Config = generateLog4j2Config(newLogsPath);

        // Use the same base directory as the config file
        const configDir = path.dirname(configPath);
        const log4j2Path = path.join(configDir, "log4j2.properties");

        await fs.writeFile(log4j2Path, log4j2Config);
        console.log(
          `✅ Updated log4j2.properties with new logs path: ${log4j2Path}`
        );
      } catch (error) {
        console.warn(`⚠️ Could not update log4j2.properties:`, error.message);
      }
    }

    // Verify paths exist after creation
    const pathStatus = {
      dataPath: { path: newDataPath, exists: false },
      logsPath: { path: newLogsPath, exists: false },
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
      message: `Node ${nodeName} configuration updated successfully`,
    };
  } catch (error) {
    console.error(`❌ Failed to update node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Move a node to a new location
 */
async function moveNode(nodeName, newBasePath, preserveData = true) {
  try {
    console.log(`🚚 Moving node "${nodeName}" to: ${newBasePath}`);

    // Get current node config and metadata
    const currentConfig = await getNodeConfig(nodeName);
    const currentMetadata = getNodeMetadata(nodeName);

    const fs = require("fs").promises;
    const path = require("path");

    // Define old and new paths
    const oldPaths = {
      configPath: currentMetadata.configPath,
      servicePath: currentMetadata.servicePath,
      dataPath: currentMetadata.dataPath,
      logsPath: currentMetadata.logsPath,
    };

    const newPaths = {
      configPath: path.join(newBasePath, "config", "elasticsearch.yml"),
      servicePath: path.join(newBasePath, "config", "start-node.bat"),
      dataPath: path.join(newBasePath, "data"),
      logsPath: path.join(newBasePath, "logs"),
    };

    // Create new directory structure
    await fs.mkdir(path.join(newBasePath, "config"), { recursive: true });
    await fs.mkdir(newPaths.dataPath, { recursive: true });
    await fs.mkdir(newPaths.logsPath, { recursive: true });

    // Move/copy config files
    const configExists = await fs
      .access(oldPaths.configPath)
      .then(() => true)
      .catch(() => false);
    if (configExists) {
      await fs.copyFile(oldPaths.configPath, newPaths.configPath);
    }

    const serviceExists = await fs
      .access(oldPaths.servicePath)
      .then(() => true)
      .catch(() => false);
    if (serviceExists) {
      await fs.copyFile(oldPaths.servicePath, newPaths.servicePath);
    }

    // Copy jvm.options if it exists
    const oldJvmPath = path.join(
      path.dirname(oldPaths.configPath),
      "jvm.options"
    );
    const newJvmPath = path.join(
      path.dirname(newPaths.configPath),
      "jvm.options"
    );
    const jvmExists = await fs
      .access(oldJvmPath)
      .then(() => true)
      .catch(() => false);
    if (jvmExists) {
      await fs.copyFile(oldJvmPath, newJvmPath);
    }

    // Copy log4j2.properties if it exists
    const oldLog4j2Path = path.join(
      path.dirname(oldPaths.configPath),
      "log4j2.properties"
    );
    const newLog4j2Path = path.join(
      path.dirname(newPaths.configPath),
      "log4j2.properties"
    );
    const log4j2Exists = await fs
      .access(oldLog4j2Path)
      .then(() => true)
      .catch(() => false);
    if (log4j2Exists) {
      await fs.copyFile(oldLog4j2Path, newLog4j2Path);
    }

    // Copy data if requested
    if (preserveData) {
      const dataExists = await fs
        .access(oldPaths.dataPath)
        .then(() => true)
        .catch(() => false);
      if (dataExists) {
        const dataFiles = await fs.readdir(oldPaths.dataPath).catch(() => []);
        for (const file of dataFiles) {
          const srcPath = path.join(oldPaths.dataPath, file);
          const destPath = path.join(newPaths.dataPath, file);
          const stat = await fs.lstat(srcPath);
          if (stat.isDirectory()) {
            await copyDirectory(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      }

      const logsExists = await fs
        .access(oldPaths.logsPath)
        .then(() => true)
        .catch(() => false);
      if (logsExists) {
        const logFiles = await fs.readdir(oldPaths.logsPath).catch(() => []);
        for (const file of logFiles) {
          const srcPath = path.join(oldPaths.logsPath, file);
          const destPath = path.join(newPaths.logsPath, file);
          const stat = await fs.lstat(srcPath);
          if (stat.isDirectory()) {
            await copyDirectory(srcPath, destPath);
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      }
    }

    // Update config file with new paths
    const updatedConfig = {
      name: currentConfig.node?.name || nodeName,
      clusterName:
        currentConfig.cluster?.name ||
        currentMetadata.cluster ||
        "trustquery-cluster",
      host: currentMetadata.host || "localhost",
      port: currentMetadata.port || 9200,
      transportPort: currentMetadata.transportPort || 9300,
      dataPath: newPaths.dataPath,
      logsPath: newPaths.logsPath,
      roles: currentMetadata.roles || {
        master: true,
        data: true,
        ingest: true,
      },
    };

    const configContent = generateNodeConfig(updatedConfig);
    await fs.writeFile(newPaths.configPath, configContent);

    // Generate and write JVM options file
    const jvmOptions = generateJVMOptions();
    const jvmPath = path.join(path.dirname(newPaths.configPath), "jvm.options");
    await fs.writeFile(jvmPath, jvmOptions);

    // Generate and write log4j2.properties file
    const log4j2Config = generateLog4j2Config(newPaths.logsPath);
    const log4j2Path = path.join(
      path.dirname(newPaths.configPath),
      "log4j2.properties"
    );
    await fs.writeFile(log4j2Path, log4j2Config);

    // Update service file with new paths
    const env = getEnvAndConfig();
    const serviceContent = generateServiceScript(
      updatedConfig.name,
      path.dirname(newPaths.configPath),
      updatedConfig.port,
      env
    );
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
      console.warn(
        `⚠️ Could not fully clean up old paths:`,
        cleanupError.message
      );
    }

    console.log(`✅ Node "${nodeName}" moved successfully to: ${newBasePath}`);

    return {
      newConfigPath: newPaths.configPath,
      newServicePath: newPaths.servicePath,
      newDataPath: newPaths.dataPath,
      newLogsPath: newPaths.logsPath,
    };
  } catch (error) {
    console.error(`❌ Failed to move node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Copy a node to a new location with a new name
 */
async function copyNode(
  sourceNodeName,
  newNodeName,
  newBasePath,
  copyData = false
) {
  try {
    console.log(
      `📋 Copying node "${sourceNodeName}" to "${newNodeName}" at: ${newBasePath}`
    );

    // Get source node config and metadata
    const sourceConfig = await getNodeConfig(sourceNodeName);
    const sourceMetadata = getNodeMetadata(sourceNodeName);

    const fs = require("fs").promises;
    const path = require("path");

    // Define new paths
    const newPaths = {
      configPath: path.join(newBasePath, "config", "elasticsearch.yml"),
      servicePath: path.join(newBasePath, "config", "start-node.bat"),
      dataPath: path.join(newBasePath, "data"),
      logsPath: path.join(newBasePath, "logs"),
    };

    // Create new directory structure
    await fs.mkdir(path.join(newBasePath, "config"), { recursive: true });
    await fs.mkdir(newPaths.dataPath, { recursive: true });
    await fs.mkdir(newPaths.logsPath, { recursive: true });

    // Copy existing config files from source (will be overwritten with updated content)
    if (sourceMetadata.configPath) {
      const sourceConfigExists = await fs
        .access(sourceMetadata.configPath)
        .then(() => true)
        .catch(() => false);
      if (sourceConfigExists) {
        await fs.copyFile(sourceMetadata.configPath, newPaths.configPath);
      }
    }

    if (sourceMetadata.servicePath) {
      const sourceServiceExists = await fs
        .access(sourceMetadata.servicePath)
        .then(() => true)
        .catch(() => false);
      if (sourceServiceExists) {
        await fs.copyFile(sourceMetadata.servicePath, newPaths.servicePath);
      }
    }

    // Copy jvm.options if it exists in source
    if (sourceMetadata.configPath) {
      const sourceJvmPath = path.join(
        path.dirname(sourceMetadata.configPath),
        "jvm.options"
      );
      const newJvmPath = path.join(
        path.dirname(newPaths.configPath),
        "jvm.options"
      );
      const sourceJvmExists = await fs
        .access(sourceJvmPath)
        .then(() => true)
        .catch(() => false);
      if (sourceJvmExists) {
        await fs.copyFile(sourceJvmPath, newJvmPath);
      }
    }

    // Copy log4j2.properties if it exists in source
    if (sourceMetadata.configPath) {
      const sourceLog4j2Path = path.join(
        path.dirname(sourceMetadata.configPath),
        "log4j2.properties"
      );
      const newLog4j2Path = path.join(
        path.dirname(newPaths.configPath),
        "log4j2.properties"
      );
      const sourceLog4j2Exists = await fs
        .access(sourceLog4j2Path)
        .then(() => true)
        .catch(() => false);
      if (sourceLog4j2Exists) {
        await fs.copyFile(sourceLog4j2Path, newLog4j2Path);
      }
    }

    // Generate new ports for the copied node
    const existingMetadata = getConfig("nodeMetadata") || {};
    const usedPorts = new Set();
    Object.values(existingMetadata).forEach((meta) => {
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
      clusterName:
        sourceConfig.cluster?.name ||
        sourceMetadata.cluster ||
        "trustquery-cluster",
      host: sourceMetadata.host || "localhost",
      port: newHttpPort,
      transportPort: newTransportPort,
      dataPath: newPaths.dataPath,
      logsPath: newPaths.logsPath,
      roles: sourceMetadata.roles || {
        master: true,
        data: true,
        ingest: true,
      },
    };

    // Write new config file
    const configContent = generateNodeConfig(newConfig);
    await fs.writeFile(newPaths.configPath, configContent);

    // Generate and write JVM options file
    const jvmOptions = generateJVMOptions();
    const jvmPath = path.join(path.dirname(newPaths.configPath), "jvm.options");
    await fs.writeFile(jvmPath, jvmOptions);

    // Generate and write log4j2.properties file
    const log4j2Config = generateLog4j2Config(newPaths.logsPath);
    const log4j2Path = path.join(
      path.dirname(newPaths.configPath),
      "log4j2.properties"
    );
    await fs.writeFile(log4j2Path, log4j2Config);

    // Write new service file
    const env = getEnvAndConfig();
    const serviceContent = generateServiceScript(
      newConfig.name,
      path.dirname(newPaths.configPath),
      newConfig.port,
      env
    );
    await fs.writeFile(newPaths.servicePath, serviceContent);

    // Copy data if requested
    if (copyData) {
      const sourceDataExists = await fs
        .access(sourceMetadata.dataPath)
        .then(() => true)
        .catch(() => false);
      if (sourceDataExists) {
        await copyDirectory(sourceMetadata.dataPath, newPaths.dataPath);
      }

      const sourceLogsExists = await fs
        .access(sourceMetadata.logsPath)
        .then(() => true)
        .catch(() => false);
      if (sourceLogsExists) {
        await copyDirectory(sourceMetadata.logsPath, newPaths.logsPath);
      }
    }

    // FIX: Correct unterminated string and missing closing brace
    console.log(
      `✅ Node "${sourceNodeName}" copied successfully to "${newNodeName}"`
    );

    return {
      name: newNodeName,
      nodeUrl: `http://${newConfig.host}:${newHttpPort}`,
      configPath: newPaths.configPath,
      servicePath: newPaths.servicePath,
      dataPath: newPaths.dataPath,
      logsPath: newPaths.logsPath,
      cluster: newConfig.clusterName,
      port: newHttpPort,
      transportPort: newTransportPort,
      roles: newConfig.roles,
    };
  } catch (error) {
    console.error(`❌ Failed to copy node ${sourceNodeName}:`, error);
    throw error;
  }
}

/**
 * Helper method to recursively copy directories
 */
async function copyDirectory(src, dest) {
  const fs = require("fs").promises;
  const path = require("path");

  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Verify and clean up node metadata on server startup
 * Removes metadata for nodes whose directories no longer exist
 */
async function verifyNodeMetadata() {
  try {
    console.log("🔍 Verifying node metadata against filesystem...");

    const nodeMetadata = getConfig("nodeMetadata") || {};
    const elasticsearchNodes = getConfig("elasticsearchNodes") || [];

    let metadataChanged = false;
    let nodesChanged = false;
    const removedNodes = [];
    const nodesNeedingUserPaths = [];

    // Check each node in metadata: remove metadata for missing node dirs
    for (const [nodeUrl, metadata] of Object.entries(nodeMetadata)) {
      if (!metadata || !metadata.name) continue;
      const nodeName = metadata.name;
      let nodeExists = false;
      const env = getEnvAndConfig();
      const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
      try {
        await require("fs").promises.access(nodeBaseDir);
        nodeExists = true;
      } catch (e) {
        nodeExists = false;
      }
      if (!nodeExists) {
        removedNodes.push(nodeName);
        delete nodeMetadata[nodeUrl];
        metadataChanged = true;
      }
    }

    // Scan the base nodes directory for any existing nodes not in metadata or with incomplete metadata/paths
    const env = getEnvAndConfig();
    if (!env.baseElasticsearchPath || typeof env.baseElasticsearchPath !== "string") {
      throw new Error("Invalid baseElasticsearchPath: not set or not a string. Please check your configuration.");
    }
    const baseNodesPath = path.join(env.baseElasticsearchPath, "nodes");
    try {
      const nodeDirs = await require("fs").promises.readdir(baseNodesPath, { withFileTypes: true });
      for (const dirent of nodeDirs) {
        if (dirent.isDirectory()) {
          const nodeName = dirent.name;
          // Find metadata by node name
          const metaKey = Object.keys(nodeMetadata).find(
            (key) => nodeMetadata[key] && nodeMetadata[key].name === nodeName
          );
          let meta = metaKey ? nodeMetadata[metaKey] : null;
          let needsUser = false;
          let dataPath, logsPath;
          // If missing metadata, try to read config from node's config folder
          if (!meta) {
            const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);
            const configPath = path.join(nodeBaseDir, "config", "elasticsearch.yml");
            const serviceFileName = env.isWindows ? "start-node.bat" : "start-node.sh";
            const servicePath = path.join(nodeBaseDir, "config", serviceFileName);
            let configData = {};
            let flatConfig = {};
            let clusterName = "trustquery-cluster";
            let host = "localhost";
            let port = 9200;
            let transportPort = 9300;
            let roles = { master: true, data: true, ingest: true };
            let heapSize = "1g";
            try {
              const configContent = await require("fs").promises.readFile(configPath, "utf8");
              const yaml = require("yaml");
              flatConfig = yaml.parse(configContent) || {};
              clusterName = flatConfig["cluster.name"] || clusterName;
              host = flatConfig["network.host"] || host;
              port = parseInt(flatConfig["http.port"] || port);
              transportPort = parseInt(flatConfig["transport.port"] || transportPort);
              // Parse roles if present
              if (flatConfig["node.roles"]) {
                // Accept both array and string
                let r = flatConfig["node.roles"];
                if (typeof r === "string") {
                  r = r.replace(/\[|\]|\s/g, "").split(",");
                }
                if (Array.isArray(r)) {
                  roles = {
                    master: r.includes("master"),
                    data: r.includes("data"),
                    ingest: r.includes("ingest"),
                  };
                }
              }
            } catch (e) {
              flatConfig = {};
            }
            // JVM heap size
            let jvmPath = path.join(nodeBaseDir, "config", "jvm.options");
            try {
              const jvmContent = await require("fs").promises.readFile(jvmPath, "utf8");
              const heapMatch = jvmContent.match(/-Xms([0-9]+[kmgt])/i);
              heapSize = heapMatch ? heapMatch[1] : "1g";
            } catch (e) {}
            dataPath = flatConfig["path.data"] || path.join(nodeBaseDir, "data");
            logsPath = flatConfig["path.logs"] || path.join(nodeBaseDir, "logs");
            // Add to nodeMetadata with all relevant fields
            const newMeta = buildNodeMetadata({
              nodeUrl: `http://${host}:${port}`,
              name: nodeName,
              configPath,
              servicePath,
              dataPath,
              logsPath,
              cluster: clusterName,
              host,
              port,
              transportPort,
              roles,
              heapSize,
            });
            nodeMetadata[nodeName] = newMeta;
            meta = newMeta;
            metadataChanged = true;
          } else {
            dataPath = meta.dataPath;
            logsPath = meta.logsPath;
            if (!dataPath || !logsPath) {
              needsUser = true;
            }
          }
          // Check if dataPath/logsPath exist
          const fsPromises = require("fs").promises;
          let dataExists = false, logsExists = false;
          try {
            if (dataPath) await fsPromises.access(dataPath); dataExists = true;
          } catch { dataExists = false; }
          try {
            if (logsPath) await fsPromises.access(logsPath); logsExists = true;
          } catch { logsExists = false; }
          if (!dataExists || !logsExists) {
            needsUser = true;
          }
          if (needsUser) {
            nodesNeedingUserPaths.push({
              nodeName,
              dataPath,
              logsPath,
              dataExists,
              logsExists,
              hasMetadata: !!meta,
            });
          }
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("❌ Error reading nodes directory:", error);
      }
    }
    if (metadataChanged) {
      await setConfig("nodeMetadata", nodeMetadata);
    }
    return { removedNodes, nodesNeedingUserPaths };
  } catch (error) {
    console.error("❌ Error verifying node metadata:", error);
    throw error;
  }
}

/**
 * Get the current heap size from a node's JVM options
 */
async function getNodeHeapSize(nodeName) {
  try {
    const metadata = getNodeMetadata(nodeName);
    let jvmPath;

    if (metadata && metadata.configPath) {
      jvmPath = path.join(path.dirname(metadata.configPath), "jvm.options");
    } else {
      const env = getEnvAndConfig();
      jvmPath = path.join(
        env.baseElasticsearchPath,
        "nodes",
        nodeName,
        "config",
        "jvm.options"
      );
    }

    try {
      const jvmContent = await fs.readFile(jvmPath, "utf8");
      const heapMatch = jvmContent.match(/-Xms([0-9]+[kmgt])/i);
      return heapMatch ? heapMatch[1] : "1g";
    } catch (error) {
      if (error.code === "ENOENT") {
        return "1g"; // Default if file doesn't exist
      }
      throw error;
    }
  } catch (error) {
    console.error(`❌ Failed to get heap size for node ${nodeName}:`, error);
    return "1g"; // Default on error
  }
}

// --- EXPORT AS FUNCTIONAL MODULE ---
module.exports = {
  getEnvAndConfig,
  initialize,
  checkElasticsearchInstallation,
  createBaseDirectories,
  formatNodeRoles,
  generateNodeConfig,
  createNode,
  generateJVMOptions,
  generateLog4j2Config,
  generateServiceScript,
  startNode,
  stopNode,
  getNodeConfig,
  listNodes,
  getNodeMetadata,
  getNodeConfigContent,
  removeNode,
  getClusterStatus,
  isNodeRunning,
  findPidByPort,
  updateNode,
  moveNode,
  copyNode,
  copyDirectory,
  verifyNodeMetadata,
  getNodeHeapSize,
  buildNodeMetadata
};
