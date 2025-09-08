const express = require("express");
const {
  generateProfileQR,
  generateProfileQRSimple,
  getProfileByQR,
} = require("../controllers/qrController");

const router = express.Router();

// Generate QR code for profile (JSON data version)
router.get("/profile/:profileId", generateProfileQR);

// Generate QR code for profile (simple URL version)
router.get("/profile/:profileId/simple", generateProfileQRSimple);

// Get profile data by QR code scan
router.get("/scan/:profileId", getProfileByQR);

module.exports = router;
