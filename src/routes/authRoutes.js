const express = require("express");
const passport = require("passport");
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/google/failure",
    session: false, // We're using JWT, not sessions
  }),
  authController.googleCallback
);

// NextAuth Google callback endpoint
router.post("/google/callback", authController.googleCallbackNextAuth);

router.get("/google/success", authController.googleSuccess);
router.get("/google/failure", authController.googleFailure);

// JWT token verification
router.post("/verify-token", authController.verifyToken);

// Create session (for NextAuth integration)
router.post("/create-session", authController.createSession);

// Generate token (for authenticated users)
router.get("/generate-token", authenticateToken, authController.generateToken);

// Profile routes
router.get("/profile", authenticateToken, authController.getProfile);
router.get("/profile/:userId", authController.getProfileById);
router.put("/profile", authenticateToken, authController.updateProfile);

// Address routes
router.get("/addresses", authenticateToken, authController.getUserAddresses);
router.post("/addresses", authenticateToken, authController.createUserAddress);
router.put(
  "/addresses/:id",
  authenticateToken,
  authController.updateUserAddress
);
router.delete(
  "/addresses/:id",
  authenticateToken,
  authController.deleteUserAddress
);

// Logout
router.post("/logout", authenticateToken, authController.logout);

module.exports = router;
