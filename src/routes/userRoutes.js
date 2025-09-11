const express = require("express");
const {
  generateUser,
  getAllUsers,
  loginUser,
  refreshToken,
} = require("../controllers/userController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  loginLimiter,
  userGenerationLimiter,
} = require("../middleware/security");

const router = express.Router();

// Login user (with rate limiting)
router.post("/login", loginLimiter, loginUser);

// Refresh token endpoint
router.post("/refresh", refreshToken);

// Generate new user account (admin only, with rate limiting)
router.post(
  "/generate",
  authenticateToken,
  requireAdmin,
  userGenerationLimiter,
  generateUser
);

// Get all users (admin only)
router.get("/", authenticateToken, requireAdmin, getAllUsers);

module.exports = router;
