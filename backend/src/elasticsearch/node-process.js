const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { getConfig, setConfig } = require("../config");
const { getEnvAndConfig } = require("./node-config");
const { isNodeRunning } = require("./node-utils");
const net = require("net");

/**
 * Find process ID by port
 */
async function findPidByPort(port) {
  try {
    const env = getEnvAndConfig();
    if (env.isWindows) {
      const { execSync } = require("child_process");
      const result = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: "utf8" }
      );
      const match = result.match(/\s+(\d+)\s*$/);
      return match ? parseInt(match[1]) : null;
    } else {
      const { execSync } = require("child_process");
      const result = execSync(`lsof -i:${port} -t`, { encoding: "utf8" });
      return parseInt(result.trim());
    }
  } catch (error) {
    return null;
  }
}

/**
 * Start a node
 */
async function startNode(nodeName, progressCallback = () => {}) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  const elasticsearchConfig = getConfig("elasticsearchConfig");
  
  if (!metadata) {
    throw new Error(`Node ${nodeName} not found in configuration`);
  }
  
  // Check if node is already running
  const status = (await isNodeRunning(nodeName)) ? "running" : "stopped";
  if (status === "running") {
    progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} is already running` });
    return { success: true, message: `Node ${nodeName} is already running` };
  }

  try {
    progressCallback({ progress: 10, status: "preparing", message: `Preparing to start node ${nodeName}...` });
    
    // Force close any process using the node's HTTP port before starting
    const portToFree = metadata.port;
    if (portToFree) {
      progressCallback({ progress: 20, status: "freeing_port", message: `Freeing port ${portToFree}...` });
      if (process.platform === 'win32') {
        // Find and kill process using the port on Windows
        const { execSync } = require('child_process');
        try {
          const output = execSync(`netstat -ano | findstr :${portToFree}`);
          const lines = output.toString().split('\n');
          for (const line of lines) {
            if (line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && pid !== '0') {
                try {
                  execSync(`taskkill /F /PID ${pid}`);
                } catch (killErr) {
                  console.warn(`[WARN] Failed to kill PID ${pid}:`, killErr.message);
                }
              }
            }
          }
        } catch (err) {
          // No process found, ignore
        }
      } else {
        // Find and kill process using the port on Linux/macOS
        const { execSync } = require('child_process');
        try {
          const output = execSync(`lsof -i :${portToFree} -t`);
          const pids = output.toString().split('\n').filter(Boolean);
          for (const pid of pids) {
            if (pid && pid !== '0') {
              try {
                execSync(`kill -9 ${pid}`);
              } catch (killErr) {
                console.warn(`[WARN] Failed to kill PID ${pid}:`, killErr.message);
              }
            }
          }
        } catch (err) {
          // No process found, ignore
        }
      }
    }

    // Construct nodeUrl if not available
    if (!metadata.nodeUrl && metadata.host && metadata.port) {
      metadata.nodeUrl = `http://${metadata.host}:${metadata.port}`;
      // Update the nodeMetadata in config
      await setConfig("nodeMetadata", nodeMetadata);
    }
    
    progressCallback({ progress: 30, status: "launching", message: `Launching Elasticsearch process for node ${nodeName}...` });
    
    // First try to use servicePath if available
    if (metadata.servicePath && fs.existsSync(metadata.servicePath)) {
      // Check if script is executable (non-Windows)
      if (process.platform !== 'win32') {
        try {
          fs.accessSync(metadata.servicePath, fs.constants.X_OK);
        } catch (e) {
          throw new Error(`Service script ${metadata.servicePath} is not executable. Please run 'chmod +x ${metadata.servicePath}'`);
        }
      }
      let spawnCmd, spawnArgs;
      if (process.platform === 'win32') {
        spawnCmd = metadata.servicePath;
        spawnArgs = [];
      } else {
        // Run as 'elasticsearch' user
        spawnCmd = 'sudo';
        spawnArgs = ['-u', 'elasticsearch', metadata.servicePath];
      }
      const nodeProcess = spawn(spawnCmd, spawnArgs, {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      nodeProcess.unref();
    } 
    // Fall back to using elasticsearchConfig.basePath + bin/elasticsearch(.bat)
    else if (elasticsearchConfig && elasticsearchConfig.basePath) {
      let nodeBin;
      if (process.platform === 'win32') {
        nodeBin = elasticsearchConfig.executable || path.join(elasticsearchConfig.basePath, "bin", "elasticsearch.bat");
      } else {
        nodeBin = elasticsearchConfig.executable || path.join(elasticsearchConfig.basePath, "bin", "elasticsearch");
      }
      // Pass node-specific configuration
      const args = [
        `-Ecluster.name=${metadata.cluster || "trustquery-cluster"}`,
        `-Enode.name=${metadata.name}`,
        `-Epath.data=${metadata.dataPath}`,
        `-Epath.logs=${metadata.logsPath}`,
        `-Ehttp.port=${metadata.port}`,
        `-Etransport.port=${metadata.transportPort}`
      ];
      let spawnCmd, spawnArgs;
      if (process.platform === 'win32') {
        spawnCmd = nodeBin;
        spawnArgs = args;
      } else {
        // Run as 'elasticsearch' user
        spawnCmd = 'sudo';
        spawnArgs = ['-u', 'elasticsearch', nodeBin, ...args];
      }
      const nodeProcess = spawn(spawnCmd, spawnArgs, {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      nodeProcess.unref();
    } else {
      throw new Error(`No valid start method found for node ${nodeName}. Please configure servicePath or elasticsearchConfig.basePath`);
    }

    progressCallback({ progress: 40, status: "waiting", message: `Waiting for node ${nodeName} to start...` });
    
    // Wait for node to start (up to 120 seconds)
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update progress every 3 seconds
      if (i % 3 === 0) {
        const progressValue = Math.min(40 + Math.floor(i / 2), 95);
        progressCallback({ 
          progress: progressValue, 
          status: "waiting", 
          message: `Waiting for node ${nodeName} to start... (${i} seconds elapsed)` 
        });
        console.log(`Still waiting for node ${nodeName} to start... (${i} seconds elapsed)`);
      }
      
      if (await isNodeRunning(nodeName)) {
        progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} started successfully!` });
        console.log(`Node ${nodeName} started successfully! Refreshing cache...`);
        return { success: true, message: `Node ${nodeName} started successfully` };
      }
    }

    throw new Error(`Node ${nodeName} failed to start within 120 seconds`);
  } catch (error) {
    progressCallback({ 
      progress: 0, 
      status: "error", 
      message: `Error starting node ${nodeName}: ${error.message}`,
      error: error.message
    });
    console.error(`Error starting node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Stop a node
 */
async function stopNode(nodeName, progressCallback = () => {}) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  
  if (!metadata) {
    throw new Error(`Node ${nodeName} not found in configuration`);
  }
  
  // Check if node is running
  const isRunning = await isNodeRunning(nodeName);
  if (!isRunning) {
    progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} is already stopped` });
    return { success: true, message: `Node ${nodeName} is already stopped` };
  }

  try {
    progressCallback({ progress: 10, status: "stopping", message: `Stopping node ${nodeName}...` });
    
    // Try to find and kill the process
    if (metadata.port) {
      progressCallback({ progress: 30, status: "finding_process", message: `Finding process for node ${nodeName}...` });
      
      // On Windows, use taskkill to kill process using the port
      if (process.platform === 'win32') {
        const findPid = spawn('netstat', ['-ano'], { shell: true });
        let pidData = '';
        
        findPid.stdout.on('data', (data) => {
          pidData += data.toString();
        });
        
        await new Promise((resolve) => {
          findPid.on('close', resolve);
        });
        
        // Find the PID using the port
        const portStr = `:${metadata.port} `;
        const lines = pidData.split('\n');
        let pid = null;
        
        for (const line of lines) {
          if (line.includes(portStr) && line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            pid = parts[parts.length - 1];
            break;
          }
        }
        
        if (pid) {
          progressCallback({ progress: 60, status: "killing_process", message: `Killing process ${pid} for node ${nodeName}...` });
          spawn('taskkill', ['/F', '/PID', pid], { shell: true });
          
          // Wait a moment to ensure the process is killed
          await new Promise(resolve => setTimeout(resolve, 2000));
          progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} stopped successfully` });
          return { success: true, message: `Node ${nodeName} stopped successfully` };
        }
      }
      // For non-Windows, try using the dataPath/pid file if available
      else if (metadata.dataPath) {
        const pidFile = path.join(metadata.dataPath, "pid");
        if (fs.existsSync(pidFile)) {
          const pid = parseInt(fs.readFileSync(pidFile, "utf8"));
          progressCallback({ progress: 60, status: "killing_process", message: `Killing process ${pid} from pid file for node ${nodeName}...` });
          try {
            if (process.platform === 'linux') {
              const { execSync } = require('child_process');
              try {
                execSync(`sudo kill -9 ${pid}`);
              } catch (killErr) {
                console.error(`Failed to kill process with PID from pid file using sudo: ${pid}`, killErr);
                throw killErr;
              }
            } else {
              process.kill(pid);
            }
            
            // Wait a moment to ensure the process is killed
            await new Promise(resolve => setTimeout(resolve, 2000));
            progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} stopped successfully` });
            return { success: true, message: `Node ${nodeName} stopped successfully` };
          } catch (err) {
            console.error(`Failed to kill process with PID from pid file: ${pid}`, err);
          }
        }
        
        // Fallback: Try to find PID by port if pid file is missing or failed
        progressCallback({ progress: 40, status: "finding_process_fallback", message: `Finding process by port for node ${nodeName}...` });
        try {
          const { execSync } = require("child_process");
          let pid = null;
          try {
            // Try lsof first
            const lsofResult = execSync(`lsof -i:${metadata.port} -t`, { encoding: "utf8" });
            pid = parseInt(lsofResult.trim());
          } catch (lsofErr) {
            // If lsof fails, try netstat/awk
            try {
              const netstatResult = execSync(`netstat -nlp | grep :${metadata.port} | awk '{print $7}' | cut -d'/' -f1`, { encoding: "utf8" });
              pid = parseInt(netstatResult.trim());
            } catch (netstatErr) {
              // Both methods failed
              console.error(`Could not find PID by port using lsof or netstat for node ${nodeName}`);
            }
          }
          if (pid && !isNaN(pid)) {
            progressCallback({ progress: 70, status: "killing_process_fallback", message: `Killing process ${pid} for node ${nodeName}...` });
            try {
              if (process.platform === 'linux') {
                const { execSync } = require('child_process');
                try {
                  execSync(`sudo kill -9 ${pid}`);
                } catch (killErr) {
                  console.error(`Failed to kill process found by port using sudo: ${pid}`, killErr);
                  throw killErr;
                }
              } else {
                process.kill(pid);
              }
              
              // Wait a moment to ensure the process is killed
              await new Promise(resolve => setTimeout(resolve, 2000));
              progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} stopped successfully (by port fallback)` });
              return { success: true, message: `Node ${nodeName} stopped successfully (by port fallback)` };
            } catch (killErr) {
              console.error(`Failed to kill process found by port: ${pid}`, killErr);
            }
          }
        } catch (fallbackErr) {
          console.error(`Error during fallback process lookup for node ${nodeName}:`, fallbackErr);
        }
      }
    }
    
    progressCallback({ 
      progress: 50, 
      status: "error", 
      message: `Could not find process for node ${nodeName}. Waiting for node to stop naturally...`,
    });
    
    // Final check - wait up to 30 seconds to see if the node stops naturally
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const stillRunning = await isNodeRunning(nodeName);
      if (!stillRunning) {
        progressCallback({ progress: 100, status: "completed", message: `Node ${nodeName} stopped successfully after waiting` });
        return { success: true, message: `Node ${nodeName} stopped successfully after waiting` };
      }
    }
    
    throw new Error(`Could not find process for node ${nodeName} and node did not stop naturally`);
  } catch (error) {
    progressCallback({ 
      progress: 0, 
      status: "error", 
      message: `Error stopping node ${nodeName}: ${error.message}`,
      error: error.message
    });
    console.error(`Error stopping node ${nodeName}:`, error);
    throw error;
  }
}

module.exports = {
  findPidByPort,
  startNode,
  stopNode,
  isNodeRunning,
}; 