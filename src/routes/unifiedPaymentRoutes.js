const express = require("express");
const router = express.Router();
const UnifiedPaymentController = require("../controllers/unifiedPaymentController");
const { authenticateToken } = require("../middleware/auth");

// Get pending payment by user (unified for both Midtrans and Plisio)
router.get(
  "/pending",
  authenticateToken,
  UnifiedPaymentController.getPendingPaymentByUser
);

// Cancel payment (unified for both Midtrans and Plisio)
router.post(
  "/cancel/:orderId",
  authenticateToken,
  UnifiedPaymentController.cancelPayment
);

// Get all payments for user (unified)
router.get(
  "/user/:userId",
  authenticateToken,
  UnifiedPaymentController.getUserPayments
);

module.exports = router;
