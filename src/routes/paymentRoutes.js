const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { authenticateToken } = require("../middleware/auth");

// Create payment for product purchase
router.post(
  "/create-product-payment",
  authenticateToken,
  paymentController.createProductPayment.bind(paymentController)
);

// Get payment status
router.get(
  "/status/:orderId",
  authenticateToken,
  paymentController.getPaymentStatus.bind(paymentController)
);

// Handle Midtrans notification
router.post(
  "/notification",
  paymentController.handleNotification.bind(paymentController)
);

// Get user payments
router.get(
  "/user/:userId",
  authenticateToken,
  paymentController.getUserPayments.bind(paymentController)
);

// Get pending payment by user
router.get(
  "/pending",
  authenticateToken,
  paymentController.getPendingPaymentByUser.bind(paymentController)
);

// Cancel payment
router.post(
  "/cancel/:orderId",
  authenticateToken,
  paymentController.cancelPayment.bind(paymentController)
);

module.exports = router;
