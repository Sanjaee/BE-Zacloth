const express = require("express");
const router = express.Router();
const UnifiedPaymentController = require("../controllers/unifiedPaymentController");
const { authenticateToken } = require("../middleware/auth");

// Create payment (unified for both Midtrans and Plisio)
router.post(
  "/create-product-payment",
  authenticateToken,
  UnifiedPaymentController.createProductPayment
);

// Get payment status by orderId (unified for both Midtrans and Plisio)
router.get(
  "/status/:orderId",
  authenticateToken,
  UnifiedPaymentController.getPaymentStatus
);

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
