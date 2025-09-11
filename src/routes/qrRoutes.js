const express = require("express");
const {
  generateProfileQR,
  generateProfileQRSimple,
  getProfileByQR,
} = require("../controllers/qrController");
const { authenticateToken, requireClient } = require("../middleware/auth");

const router = express.Router();

// Generate QR code for profile (JSON data version) - requires authentication
router.get(
  "/profile/:profileId",
  authenticateToken,
  requireClient,
  generateProfileQR
);

// Generate QR code for profile (simple URL version) - requires authentication
router.get(
  "/profile/:profileId/simple",
  authenticateToken,
  requireClient,
  generateProfileQRSimple
);

// Get profile data by QR code scan
router.get("/scan/:profileId", getProfileByQR);

module.exports = router;
