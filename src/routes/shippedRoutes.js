const express = require("express");
const {
  getAllShippedOrders,
  getShippedByOrderId,
} = require("../controllers/shippedController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Admin routes
// Get all shipped orders for admin (simple version without Redis)
router.get("/admin/all", authenticateToken, requireAdmin, getAllShippedOrders);

// Public routes
// Get shipped order by orderId (public access)
router.get("/:orderId", getShippedByOrderId);

module.exports = router;
