const express = require("express");
const {
  testDatabase,
  getAllProducts,
  createProduct,
  getProductById,
} = require("../controllers/productController");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering
router.get("/", getAllProducts);

// Get product by ID
router.get("/:id", getProductById);

// Create new product (Admin only)
router.post("/", createProduct);

module.exports = router;
