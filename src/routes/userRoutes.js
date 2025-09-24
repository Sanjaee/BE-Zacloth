const express = require("express");
const {
  generateUser,
  getAllUsers,
  loginUser,
  refreshToken,
  updateProfile,
  getProfile,
  registerUser,
  verifyOtp,
  resendOtp,
  checkEmailStatus,
  deleteUser,
  checkOtpJobStatus,
  getOtpQueueStats,
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

// Register user with email OTP
router.post("/register", validateRequest, registerUser);

// Verify OTP
router.post("/verify-otp", validateRequest, verifyOtp);

// Resend OTP
router.post("/resend-otp", validateRequest, resendOtp);

// Check email status
router.post("/check-email", validateRequest, checkEmailStatus);

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

// Delete user (admin only, with enhanced security)
router.delete(
  "/:userId",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  deleteUser
);

// Check OTP job status (for monitoring)
router.get("/otp-job/:jobId", validateRequest, checkOtpJobStatus);

// Get OTP queue statistics (admin only)
router.get(
  "/otp-queue/stats",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  getOtpQueueStats
);

module.exports = router;
