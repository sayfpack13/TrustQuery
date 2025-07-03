// Task management system
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
    filename: filename, // Store filename for single file parsing tasks
  };
  return taskId;
}

// Helper function to update an existing task
function updateTask(taskId, updates) {
  if (tasks[taskId]) {
    Object.assign(tasks[taskId], updates);
  }
}

// Get all tasks
function getAllTasks() {
  return tasks;
}

// Get task by ID
function getTask(taskId) {
  return tasks[taskId];
}

// Get active tasks (not completed and not in error state)
function getActiveTasks() {
  return Object.values(tasks).filter(
    (task) => !task.completed && task.status !== "error"
  );
}

// Clean up old completed tasks (optional)
function cleanupOldTasks(maxAge = 24 * 60 * 60 * 1000) { // 24 hours in milliseconds
  const now = Date.now();
  const tasksToDelete = [];
  
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.completed && (now - task.startTime) > maxAge) {
      tasksToDelete.push(taskId);
    }
  }
  
  tasksToDelete.forEach(taskId => delete tasks[taskId]);
  
  if (tasksToDelete.length > 0) {
    console.log(`🧹 Cleaned up ${tasksToDelete.length} old tasks`);
  }
}

module.exports = {
  createTask,
  updateTask,
  getAllTasks,
  getTask,
  getActiveTasks,
  cleanupOldTasks
};
