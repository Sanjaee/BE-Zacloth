const express = require("express");
const {
  testDatabase,
  getAllProducts,
  createProduct,
  createProductWithImage,
  getProductById,
  getProductForCheckout,
  updateProduct,
  updateProductWithImage,
  deleteProduct,
} = require("../controllers/productController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  productCreationSecurity,
  validateRequest,
} = require("../middleware/security");
const { validateProductData } = require("../validation/imageValidation");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering
router.get("/", getAllProducts);

// Get product by ID or slug
router.get("/:id", getProductById);

// Get product by ID for checkout (minimal data)
router.get("/checkout/:id", getProductForCheckout);

// Get product by slug (alternative route for better SEO)
router.get("/slug/:slug", getProductById);

// Create new product (Admin only, with enhanced security)
router.post(
  "/",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  validateProductData,
  createProduct
);

// Create new product with image URLs (Admin only, with enhanced security)
router.post(
  "/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  createProductWithImage
);

// Update product with image URLs by ID (Admin only, with enhanced security)
router.put(
  "/:id/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  updateProductWithImage
);

// Update product by ID (Admin only, with enhanced security)
router.put(
  "/:id",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  validateProductData,
  updateProduct
);

// Delete product by ID (Admin only, with enhanced security)
router.delete(
  "/:id",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  deleteProduct
);

module.exports = router;
