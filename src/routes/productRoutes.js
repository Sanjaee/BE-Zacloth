const express = require("express");
const {
  testDatabase,
  getAllProducts,
  createProduct,
  getProductById,
} = require("../controllers/productController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  productCreationSecurity,
  validateRequest,
} = require("../middleware/security");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering
router.get("/", getAllProducts);

// Get product by ID
router.get("/:id", getProductById);

// Create new product (Admin only, with enhanced security)
router.post(
  "/",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  createProduct
);

module.exports = router;
