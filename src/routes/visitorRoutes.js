const express = require("express");
const {
  trackVisitor,
  getVisitorStats,
} = require("../controllers/visitorController");

const router = express.Router();

// Track visitor (public endpoint)
router.post("/track", trackVisitor);

// Get visitor statistics (admin only)
router.get("/stats", getVisitorStats);

module.exports = router;
