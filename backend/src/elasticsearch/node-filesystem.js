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

    // Determine current node base directory
    const currentNodeBaseDir = path.dirname(path.dirname(metadata.configPath));
    const newNodeBaseDir = newBasePath; // Do NOT append nodeName
    const newNodeName = path.basename(newNodeBaseDir);

    // If the new path is the same as the current, do nothing
    if (path.resolve(currentNodeBaseDir) === path.resolve(newNodeBaseDir)) {
      return {
        configPath: path.join(newNodeBaseDir, "config", "elasticsearch.yml"),
        servicePath: path.join(
          newNodeBaseDir,
          "config",
          env.isWindows ? "start-node.bat" : "start-node.sh"
        ),
        dataPath: path.join(newNodeBaseDir, "data"),
        logsPath: path.join(newNodeBaseDir, "logs"),
      };
    }

    // Create newPath if it doesn't exist
    await fs.mkdir(newNodeBaseDir, { recursive: true });

    // Move all contents from currentNodeBaseDir into newNodeBaseDir
    const entries = await fs.readdir(currentNodeBaseDir);
    for (const entry of entries) {
      const srcPath = path.join(currentNodeBaseDir, entry);
      const destPath = path.join(newNodeBaseDir, entry);
      try {
        await fs.rename(srcPath, destPath);
      } catch (err) {
        // If cross-device error, fallback to copy+delete
        if (err.code === 'EXDEV') {
          await copyDirectory(srcPath, destPath);
          if (!preserveData) {
            await fs.rm(srcPath, { recursive: true, force: true });
          }
        } else {
          throw err;
        }
      }
    }

    // Remove the old (now empty) node directory
    try {
      await fs.rmdir(currentNodeBaseDir);
    } catch (e) {
      // Ignore if not empty or already removed
    }

    // Update node.name, path.data, and path.logs in config file
    const configPath = path.join(newNodeBaseDir, "config", "elasticsearch.yml");
    try {
      const yaml = require("yaml");
      let configContent = await fs.readFile(configPath, "utf8");
      let configObj = yaml.parse(configContent);
      let changed = false;
      // Update node.name
      if (configObj["node.name"] !== newNodeName) {
        configObj["node.name"] = newNodeName;
        changed = true;
      }
      // Update path.data if it was inside the old node dir
      if (configObj["path.data"]) {
        const oldDataPath = configObj["path.data"];
        if (oldDataPath.startsWith(currentNodeBaseDir + path.sep) || oldDataPath === path.join(currentNodeBaseDir, "data")) {
          configObj["path.data"] = path.join(newNodeBaseDir, path.relative(currentNodeBaseDir, oldDataPath));
          changed = true;
        }
      }
      // Update path.logs if it was inside the old node dir
      if (configObj["path.logs"]) {
        const oldLogsPath = configObj["path.logs"];
        if (oldLogsPath.startsWith(currentNodeBaseDir + path.sep) || oldLogsPath === path.join(currentNodeBaseDir, "logs")) {
          configObj["path.logs"] = path.join(newNodeBaseDir, path.relative(currentNodeBaseDir, oldLogsPath));
          changed = true;
        }
      }
      if (changed) {
        configContent = yaml.stringify(configObj);
        await fs.writeFile(configPath, configContent, "utf8");
      }
    } catch (e) {
      // If config file missing or invalid, ignore
    }

    // Return new paths
    return {
      configPath: path.join(newNodeBaseDir, "config", "elasticsearch.yml"),
      servicePath: path.join(
        newNodeBaseDir,
        "config",
        env.isWindows ? "start-node.bat" : "start-node.sh"
      ),
      dataPath: path.join(newNodeBaseDir, "data"),
      logsPath: path.join(newNodeBaseDir, "logs"),
    };
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
    let newNodeBaseDir = newBasePath;
    if (!newBasePath.endsWith(path.sep + newNodeName) && !newBasePath.endsWith('/' + newNodeName) && !newBasePath.endsWith('\\' + newNodeName)) {
      const baseName = path.basename(newBasePath);
      if (baseName !== newNodeName) {
        newNodeBaseDir = path.join(newBasePath, newNodeName);
      }
    }
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
      // Delete node base directory as before
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
      }
      // Now also delete custom dataPath and logsPath if they are not subfolders of nodeBaseDir
      const pathsToDelete = [];
      if (metadata.dataPath && !metadata.dataPath.startsWith(nodeBaseDir)) {
        pathsToDelete.push(metadata.dataPath);
      }
      if (metadata.logsPath && !metadata.logsPath.startsWith(nodeBaseDir)) {
        pathsToDelete.push(metadata.logsPath);
      }
      for (const customPath of pathsToDelete) {
        try {
          await fs.rm(customPath, { recursive: true, force: true });
        } catch (err) {
          if (process.platform === 'linux') {
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
              exec(`sudo rm -rf "${customPath}"`, (error) => {
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
          if (fsSync.existsSync(customPath)) {
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
              exec(`sudo rm -rf "${customPath}"`, (error) => {
                if (error) return reject(error);
                resolve();
              });
            });
          }
        }
        // After deleting customPath, try to delete its parent (node-named folder) if empty
        const parentDir = path.dirname(customPath);
        try {
          const fsSync = require('fs');
          if (fsSync.existsSync(parentDir)) {
            const files = fsSync.readdirSync(parentDir);
            if (files.length === 0) {
              if (process.platform === 'linux') {
                const { exec } = require('child_process');
                await new Promise((resolve, reject) => {
                  exec(`sudo rm -rf "${parentDir}"`, (error) => {
                    if (error) return reject(error);
                    resolve();
                  });
                });
              } else {
                await fs.rm(parentDir, { recursive: true, force: true });
              }
            }
          }
        } catch (err) {
          console.error(`Error checking or removing node-named parent directory: ${parentDir}`, err);
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