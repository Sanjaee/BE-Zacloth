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

module.exports = router;
