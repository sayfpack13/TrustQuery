// Task management routes
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getActiveTasks, getTask } = require("../tasks");

const router = express.Router();

// GET all current tasks
router.get("/", verifyJwt, (req, res) => {
  const activeTasks = getActiveTasks();
  res.json(activeTasks);
});

// GET task status
router.get("/:taskId", verifyJwt, (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (task) {
    res.json(task);
  } else {
    res.status(404).json({ error: "Task not found" });
  }
});

module.exports = router;
