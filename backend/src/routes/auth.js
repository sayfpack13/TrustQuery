// Authentication routes
const express = require("express");
const { login } = require("../middleware/auth");

const router = express.Router();

// Admin Login endpoint
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const result = login(username, password);
  
  if (result.success) {
    res.json({ token: result.token });
  } else {
    res.status(401).json({ error: result.error });
  }
});

module.exports = router;
