const express = require("express");
const {
  testDatabase,
  getAllProducts,
  createProduct,
  createProductWithImage,
  getProductById,
  updateProduct,
  updateProductWithImage,
  deleteProduct,
} = require("../controllers/productController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  productCreationSecurity,
  validateRequest,
} = require("../middleware/security");
const { upload } = require("../controllers/imageController");
const {
  validateImageUpload,
  validateProductData,
} = require("../validation/imageValidation");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering
router.get("/", getAllProducts);

// Get product by ID or slug
router.get("/:id", getProductById);

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

// Create new product with multiple images upload (Admin only, with enhanced security)
router.post(
  "/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  upload.array("images", 10), // Allow up to 10 images
  validateImageUpload,
  createProductWithImage
);

// Update product with multiple images upload by ID (Admin only, with enhanced security)
router.put(
  "/:id/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  upload.array("images", 10), // Allow up to 10 images
  validateImageUpload,
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
