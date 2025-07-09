const fs = require("fs").promises;
const path = require("path");
const { getEnvAndConfig } = require("./node-config");
const { getNodeMetadata } = require("./node-metadata");

/**
 * Create base directories for cluster
 */
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
 * Move a node to a new location
 */
async function moveNode(nodeName, newBasePath, preserveData = true) {
  try {
    const env = getEnvAndConfig();
    const metadata = getNodeMetadata(nodeName);
    
    if (!metadata) {
      throw new Error(`Node "${nodeName}" not found`);
    }

    // Create new paths
    const newNodeBaseDir = path.join(newBasePath, "nodes", nodeName);
    const newPaths = {
      configPath: path.join(newNodeBaseDir, "config", "elasticsearch.yml"),
      servicePath: path.join(
        newNodeBaseDir,
        "config",
        env.isWindows ? "start-node.bat" : "start-node.sh"
      ),
      dataPath: path.join(newNodeBaseDir, "data"),
      logsPath: path.join(newNodeBaseDir, "logs"),
    };

    // Create directories
    await fs.mkdir(path.dirname(newPaths.configPath), { recursive: true });
    await fs.mkdir(newPaths.dataPath, { recursive: true });
    await fs.mkdir(newPaths.logsPath, { recursive: true });

    // Copy files
    if (preserveData) {
      await copyDirectory(metadata.dataPath, newPaths.dataPath);
      await copyDirectory(metadata.logsPath, newPaths.logsPath);
    }

    // Return new paths
    return newPaths;
  } catch (error) {
    console.error(`Error moving node ${nodeName}:`, error);
    throw error;
  }
}

/**
 * Copy a node to a new location
 */
async function copyNode(sourceNodeName, newNodeName, newBasePath, copyData = false) {
  try {
    const env = getEnvAndConfig();
    const sourceMetadata = getNodeMetadata(sourceNodeName);
    
    if (!sourceMetadata) {
      throw new Error(`Source node "${sourceNodeName}" not found`);
    }

    // Create new paths
    const newNodeBaseDir = path.join(newBasePath, "nodes", newNodeName);
    const newPaths = {
      configPath: path.join(newNodeBaseDir, "config", "elasticsearch.yml"),
      servicePath: path.join(
        newNodeBaseDir,
        "config",
        env.isWindows ? "start-node.bat" : "start-node.sh"
      ),
      dataPath: path.join(newNodeBaseDir, "data"),
      logsPath: path.join(newNodeBaseDir, "logs"),
    };

    // Create directories
    await fs.mkdir(path.dirname(newPaths.configPath), { recursive: true });
    await fs.mkdir(newPaths.dataPath, { recursive: true });
    await fs.mkdir(newPaths.logsPath, { recursive: true });

    // Copy files
    if (copyData) {
      await copyDirectory(sourceMetadata.dataPath, newPaths.dataPath);
      await copyDirectory(sourceMetadata.logsPath, newPaths.logsPath);
    }

    // Return new paths
    return newPaths;
  } catch (error) {
    console.error(`Error copying node ${sourceNodeName}:`, error);
    throw error;
  }
}

/**
 * Copy a directory recursively
 */
async function copyDirectory(src, dest) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });
    await fs.mkdir(dest, { recursive: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error(`Error copying directory from ${src} to ${dest}:`, error);
    throw error;
  }
}

/**
 * Remove a node's files
 */
async function removeNodeFiles(nodeName, preserveData = false) {
  try {
    const env = getEnvAndConfig();
    const metadata = getNodeMetadata(nodeName);
    
    if (!metadata) {
      throw new Error(`Node "${nodeName}" not found`);
    }

    const nodeBaseDir = path.join(env.baseElasticsearchPath, "nodes", nodeName);

    // Remove node directory
    if (!preserveData) {
      try {
        await fs.rm(nodeBaseDir, { recursive: true, force: true });
      } catch (err) {
        if (process.platform === 'linux') {
          const { exec } = require('child_process');
          await new Promise((resolve, reject) => {
            exec(`sudo rm -rf "${nodeBaseDir}"`, (error) => {
              if (error) return reject(error);
              resolve();
            });
          });
        } else {
          throw err;
        }
      }
      // Double-check: if still exists on Linux, try sudo rm -rf
      if (process.platform === 'linux') {
        const fsSync = require('fs');
        if (fsSync.existsSync(nodeBaseDir)) {
          const { exec } = require('child_process');
          await new Promise((resolve, reject) => {
            exec(`sudo rm -rf "${nodeBaseDir}"`, (error) => {
              if (error) return reject(error);
              resolve();
            });
          });
        }
        // Also check and clean up parent directory if empty
        const parentDir = path.dirname(nodeBaseDir);
        if (fsSync.existsSync(parentDir)) {
          try {
            const files = fsSync.readdirSync(parentDir);
            if (files.length === 0) {
              await new Promise((resolve, reject) => {
                exec(`sudo rm -rf "${parentDir}"`, (error) => {
                  if (error) {
                    console.error(`Failed to remove empty parent directory: ${parentDir}`, error);
                    return reject(error);
                  }
                  resolve();
                });
              });
            }
          } catch (err) {
            console.error(`Error checking or removing parent directory: ${parentDir}`, err);
          }
        }
      }
    } else {
      // If preserving data, only remove config files
      const configDir = path.join(nodeBaseDir, "config");
      await fs.rm(configDir, { recursive: true, force: true });
    }

    return {
      success: true,
      message: `Node "${nodeName}" files removed successfully`,
      preservedData: preserveData,
    };
  } catch (error) {
    console.error(`Error removing node ${nodeName} files:`, error);
    throw error;
  }
}

module.exports = {
  createBaseDirectories,
  moveNode,
  copyNode,
  copyDirectory,
  removeNodeFiles,
}; 