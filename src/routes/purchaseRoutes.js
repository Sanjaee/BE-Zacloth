const express = require("express");
const {
  getUserPurchases,
  getPurchaseByOrderId,
  getUserPurchaseStats,
} = require("../controllers/purchaseController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get user's purchased products with pagination and filtering
router.get("/", getUserPurchases);

// Get single purchase by order ID
router.get("/:orderId", getPurchaseByOrderId);

// Get user's purchase statistics
router.get("/stats/overview", getUserPurchaseStats);

module.exports = router;
