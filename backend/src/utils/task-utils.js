// Task management
const { randomUUID } = require("crypto");

// In-memory task store
const tasks = {};

// Helper function to create a new task and add it to the in-memory store
function createTask(type, initialStatus = "pending", filename = null) {
  const taskId = randomUUID();
  tasks[taskId] = {
    taskId: taskId,
    type: type,
    status: initialStatus,
    progress: 0,
    total: 0,
    error: null,
    completed: false,
    startTime: Date.now(),
    fileMovedCount: 0,
    filename: filename,
  };
  return taskId;
}

// Helper function to update an existing task
function updateTask(taskId, updates) {
  if (tasks[taskId]) {
    Object.assign(tasks[taskId], updates);
  }
}

// Get all active tasks
function getActiveTasks() {
  return Object.values(tasks).filter(
    (task) => !task.completed && task.status !== "error"
  );
}

// Get specific task
function getTask(taskId) {
  return tasks[taskId];
}

// Get all tasks
function getAllTasks() {
  return { ...tasks };
}

// Clean up old tasks
function cleanupOldTasks() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  Object.keys(tasks).forEach(taskId => {
    const task = tasks[taskId];
    if (task.completed && (now - task.startTime) > maxAge) {
      delete tasks[taskId];
    }
  });
}

module.exports = {
  createTask,
  updateTask,
  getActiveTasks,
  getTask,
  getAllTasks,
  cleanupOldTasks
}; 