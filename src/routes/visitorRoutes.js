const express = require("express");
const {
  trackVisitor,
  getVisitorStats,
} = require("../controllers/visitorController");
const {
  visitorTrackingLimiter,
  webAppOnly,
  validateRequest,
} = require("../middleware/security");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Track visitor (public endpoint) with rate limiting
router.post("/track", visitorTrackingLimiter, trackVisitor);

// Get visitor statistics (admin only, with enhanced security)
router.get(
  "/stats",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  getVisitorStats
);

module.exports = router;
