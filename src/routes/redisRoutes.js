const express = require("express");
const {
  healthCheck,
  getStats,
  clearCache,
  clearCachePattern,
  getCacheKeys,
  getCacheValue,
} = require("../controllers/redisController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Redis health check (public endpoint)
router.get("/health", healthCheck);

// Redis statistics (admin only)
router.get("/stats", authenticateToken, requireAdmin, getStats);

// Get cache keys by pattern (admin only)
router.get("/keys", authenticateToken, requireAdmin, getCacheKeys);

// Get cache value by key (admin only)
router.get("/value/:key", authenticateToken, requireAdmin, getCacheValue);

// Clear all caches (admin only)
router.delete("/clear", authenticateToken, requireAdmin, clearCache);

// Clear cache by pattern (admin only)
router.delete(
  "/clear/:pattern",
  authenticateToken,
  requireAdmin,
  clearCachePattern
);

module.exports = router;
