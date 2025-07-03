// Authentication middleware
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password";

// JWT verification middleware
function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Login function
function login(username, password) {
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign(
      { username: ADMIN_USER, role: "admin" },
      SECRET_KEY,
      { expiresIn: "24h" }
    );
    return { success: true, token };
  }
  return { success: false, error: "Invalid credentials" };
}

module.exports = {
  verifyJwt,
  login
};
