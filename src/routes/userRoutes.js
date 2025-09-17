const express = require("express");
const {
  generateUser,
  getAllUsers,
  loginUser,
  refreshToken,
  updateProfile,
  getProfile,
  getUserAddresses,
  createUserAddress,
  updateUserAddress,
  deleteUserAddress,
} = require("../controllers/userController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  loginLimiter,
  userGenerationLimiter,
  webAppOnly,
  validateRequest,
  loginSecurity,
  userGenerationSecurity,
} = require("../middleware/security");

const router = express.Router();

// Login user (with enhanced security - blocks all external tools)
router.post("/login", loginSecurity, validateRequest, loginLimiter, loginUser);

// Refresh token endpoint (enhanced security - blocks all external tools)
router.post("/refresh", loginSecurity, validateRequest, refreshToken);

// Generate new user account (admin only, with rate limiting, enhanced security)
router.post(
  "/generate",
  userGenerationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  userGenerationLimiter,
  generateUser
);

// Get all users (admin only, with enhanced security)
router.get(
  "/",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  getAllUsers
);

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

// Get user addresses (authenticated users only, web app only)
router.get(
  "/addresses",
  webAppOnly,
  validateRequest,
  authenticateToken,
  getUserAddresses
);

// Create user address (authenticated users only, web app only)
router.post(
  "/addresses",
  webAppOnly,
  validateRequest,
  authenticateToken,
  createUserAddress
);

// Update user address (authenticated users only, web app only)
router.put(
  "/addresses/:id",
  webAppOnly,
  validateRequest,
  authenticateToken,
  updateUserAddress
);

// Delete user address (authenticated users only, web app only)
router.delete(
  "/addresses/:id",
  webAppOnly,
  validateRequest,
  authenticateToken,
  deleteUserAddress
);

module.exports = router;
