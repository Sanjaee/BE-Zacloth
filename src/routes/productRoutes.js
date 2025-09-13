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

// Get product by ID
router.get("/:id", getProductById);

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

// Create new product with image upload (Admin only, with enhanced security)
router.post(
  "/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  upload.single("image"),
  validateImageUpload,
  createProductWithImage
);

// Update product with image upload by ID (Admin only, with enhanced security)
router.put(
  "/:id/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  upload.single("image"),
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
