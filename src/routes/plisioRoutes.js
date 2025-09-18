const express = require("express");
const router = express.Router();
const PlisioController = require("../controllers/plisioController");
const { authenticateToken } = require("../middleware/auth");

// Public routes (no authentication required)
router.get("/currencies", PlisioController.getCurrencies);
router.get("/test-callback", PlisioController.testCallback);

// Callback routes (no authentication required - called by Plisio)
router.post("/callback", PlisioController.handleCallback);
router.post("/success", PlisioController.handleCallback);
router.post("/fail", PlisioController.handleCallback);

// Protected routes (authentication required)
router.post(
  "/create-product-payment",
  authenticateToken,
  PlisioController.createProductPayment
);
router.get(
  "/payment-status/:orderId",
  authenticateToken,
  PlisioController.getPaymentStatus
);
router.post(
  "/check-payment-status",
  authenticateToken,
  PlisioController.checkPaymentStatus
);
router.post(
  "/crypto-callback",
  authenticateToken,
  PlisioController.handleCryptoCallback
);
router.post(
  "/auto-success",
  authenticateToken,
  PlisioController.handleAutoSuccess
);
router.get(
  "/user-payments/:userId",
  authenticateToken,
  PlisioController.getUserPayments
);
router.get(
  "/pending-payment",
  authenticateToken,
  PlisioController.getPendingPaymentByUser
);
router.post(
  "/cancel-payment/:orderId",
  authenticateToken,
  PlisioController.cancelPayment
);

module.exports = router;
