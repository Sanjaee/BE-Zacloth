const express = require("express");
const {
  generateProfileQR,
  generateProfileQRSimple,
  getProfileByQR,
} = require("../controllers/qrController");
const {
  authenticateToken,
  requireClient,
  requireAdmin,
} = require("../middleware/auth");
const { webAppOnly, validateRequest } = require("../middleware/security");

const router = express.Router();

// Generate QR code for profile (JSON data version) - requires authentication
router.get(
  "/profile/:profileId",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireClient,
  generateProfileQR
);

// Generate QR code for profile (simple URL version) - admin only for user management
router.get(
  "/profile/:profileId/simple",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  generateProfileQRSimple
);

// Get profile data by QR code scan
router.get("/scan/:profileId", getProfileByQR);

module.exports = router;
