const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { getConfig, setConfig } = require("../config");
const { getEnvAndConfig } = require("./node-config");
const { refreshAfterOperation } = require("../cache/cache-manager");

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
 * Check if a node is running and ready
 */
async function isNodeRunning(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  if (!metadata) return false;

  // Construct nodeUrl if not available
  const nodeUrl = metadata.nodeUrl || 
    (metadata.host && metadata.port ? `http://${metadata.host}:${metadata.port}` : undefined);
  
  if (!nodeUrl) {
    // Try port-based detection as fallback
    if (metadata.port) {
      try {
        const pid = await findPidByPort(metadata.port);
        if (pid) return true;
      } catch (error) {
        // Silently fail and return false
      }
    }
    return false;
  }

  try {
    // Add a timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    // First check if the node is responding at all
    const response = await fetch(nodeUrl, { 
      signal: controller.signal,
      method: 'HEAD' // Use HEAD request for faster checking
    });
    
    clearTimeout(timeoutId);
    
    // If we get any response, consider the node running
    return response.status < 500; // Accept any non-server error response
  } catch (error) {
    // Try port-based detection as fallback
    if (metadata.port) {
      try {
        const pid = await findPidByPort(metadata.port);
        if (pid) return true;
      } catch (portError) {
        // Silently fail
      }
    }
    
    return false;
  }
}

/**
 * Start a node
 */
async function startNode(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  const elasticsearchConfig = getConfig("elasticsearchConfig");
  
  if (!metadata) {
    throw new Error(`Node ${nodeName} not found in configuration`);
  }
  
  // Check if node is already running
  const isRunning = await isNodeRunning(nodeName);
  if (isRunning) {
    console.log(`Node ${nodeName} is already running`);
    return { success: true, message: `Node ${nodeName} is already running` };
  }

  try {
    console.log(`Attempting to start node ${nodeName}...`);
    
    // Construct nodeUrl if not available
    if (!metadata.nodeUrl && metadata.host && metadata.port) {
      metadata.nodeUrl = `http://${metadata.host}:${metadata.port}`;
      // Update the nodeMetadata in config
      await setConfig("nodeMetadata", nodeMetadata);
    }
    
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
      console.log(`Starting node ${nodeName} using service script: ${metadata.servicePath}`);
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
      console.log(`Starting node ${nodeName} using executable: ${nodeBin}`);
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

    // Wait for node to start (up to 120 seconds)
    console.log(`Waiting for node ${nodeName} to start...`);
    
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (i % 10 === 0) {
        console.log(`Still waiting for node ${nodeName} to start... (${i} seconds elapsed)`);
      }
      
      if (await isNodeRunning(nodeName)) {
        console.log(`Node ${nodeName} started successfully! Refreshing cache...`);
        await refreshAfterOperation(nodeName, "start");
        return { success: true, message: `Node ${nodeName} started successfully` };
      }
    }

    throw new Error(`Node ${nodeName} failed to start within 120 seconds`);
  } catch (error) {
    console.error(`Error starting node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Stop a node
 */
async function stopNode(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  
  if (!metadata) {
    throw new Error(`Node ${nodeName} not found in configuration`);
  }
  
  // Check if node is running
  const isRunning = await isNodeRunning(nodeName);
  if (!isRunning) {
    return { success: true, message: `Node ${nodeName} is already stopped` };
  }

  try {
    // Try to find and kill the process
    if (metadata.port) {
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
          console.log(`Stopping node ${nodeName} with PID ${pid}`);
          spawn('taskkill', ['/F', '/PID', pid], { shell: true });
          await refreshAfterOperation(nodeName, "stop");
          return { success: true, message: `Node ${nodeName} stopped successfully` };
        }
      } 
      // For non-Windows, try using the dataPath/pid file if available
      else if (metadata.dataPath) {
        const pidFile = path.join(metadata.dataPath, "pid");
        if (fs.existsSync(pidFile)) {
          const pid = parseInt(fs.readFileSync(pidFile, "utf8"));
          try {
            process.kill(pid);
            await refreshAfterOperation(nodeName, "stop");
            return { success: true, message: `Node ${nodeName} stopped successfully` };
          } catch (err) {
            console.error(`Failed to kill process with PID from pid file: ${pid}`, err);
          }
        }
        // Fallback: Try to find PID by port if pid file is missing or failed
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
            try {
              process.kill(pid);
              await refreshAfterOperation(nodeName, "stop");
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
    
    throw new Error(`Could not find process for node ${nodeName}`);
  } catch (error) {
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