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
  forgotPassword,
  verifyPasswordResetOtp,
  resendPasswordResetOtp,
  updatePassword,
  // Cart functions
  getCartItems,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
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

// Forgot password - send OTP to email
router.post("/forgot-password", validateRequest, forgotPassword);

// Verify password reset OTP
router.post("/verify-password-reset", validateRequest, verifyPasswordResetOtp);

// Resend password reset OTP
router.post("/resend-password-reset", validateRequest, resendPasswordResetOtp);

// Update password (for password reset flow)
router.put("/update-password", validateRequest, updatePassword);

// Cart routes (authenticated users only)
// Get user's cart items
router.get(
  "/cart",
  webAppOnly,
  validateRequest,
  authenticateToken,
  getCartItems
);

// Add item to cart
router.post(
  "/cart/add",
  webAppOnly,
  validateRequest,
  authenticateToken,
  addToCart
);

// Update cart item quantity
router.put(
  "/cart/:cartItemId",
  webAppOnly,
  validateRequest,
  authenticateToken,
  updateCartItem
);

// Remove item from cart
router.delete(
  "/cart/:cartItemId",
  webAppOnly,
  validateRequest,
  authenticateToken,
  removeFromCart
);

// Clear entire cart
router.delete(
  "/cart",
  webAppOnly,
  validateRequest,
  authenticateToken,
  clearCart
);

module.exports = router;
