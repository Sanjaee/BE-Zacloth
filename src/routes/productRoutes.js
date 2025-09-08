const express = require("express");
const {
  testDatabase,
  getAllProducts,
} = require("../controllers/productController");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering
router.get("/", getAllProducts);

module.exports = router;
