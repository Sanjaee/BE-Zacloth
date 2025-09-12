const express = require("express");
const {
  generateUser,
  getAllUsers,
  loginUser,
  refreshToken,
  updateProfile,
  getProfile,
} = require("../controllers/userController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  loginLimiter,
  userGenerationLimiter,
  webAppOnly,
  validateRequest,
  loginSecurity,
} = require("../middleware/security");

const router = express.Router();

// Login user (with enhanced security - blocks all external tools)
router.post("/login", loginSecurity, validateRequest, loginLimiter, loginUser);

// Refresh token endpoint (enhanced security - blocks all external tools)
router.post("/refresh", loginSecurity, validateRequest, refreshToken);

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

// Get user profile (authenticated users only, web app only)
router.get(
  "/profile",
  webAppOnly,
  validateRequest,
  authenticateToken,
  getProfile
);

// Update user profile (authenticated users only, web app only)
router.put(
  "/profile",
  webAppOnly,
  validateRequest,
  authenticateToken,
  updateProfile
);

module.exports = router;
