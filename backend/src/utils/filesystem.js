// File system utilities
const fs = require("fs").promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const UNPARSED_DIR = path.join(DATA_DIR, "unparsed");
const PARSED_DIR = path.join(DATA_DIR, "parsed");
const PENDING_DIR = path.join(DATA_DIR, "pending");

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UNPARSED_DIR, { recursive: true });
  await fs.mkdir(PARSED_DIR, { recursive: true });
  await fs.mkdir(PENDING_DIR, { recursive: true });
}

// Get files from directory
async function getFiles(directory) {
  try {
    await fs.mkdir(directory, { recursive: true });
    const files = await fs.readdir(directory);
    return files;
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error);
    throw error;
  }
}

// Move file between directories
async function moveFile(fromPath, toPath) {
  try {
    await fs.rename(fromPath, toPath);
  } catch (error) {
    console.error(`Error moving file from ${fromPath} to ${toPath}:`, error);
    throw error;
  }
}

// Delete file
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    throw error;
  }
}

// Check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DATA_DIR,
  UNPARSED_DIR,
  PARSED_DIR,
  PENDING_DIR,
  ensureDirectories,
  getFiles,
  moveFile,
  deleteFile,
  fileExists
};
