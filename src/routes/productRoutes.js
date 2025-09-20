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
const {
  cacheMiddleware,
  invalidateCache,
  productCachePatterns,
} = require("../middleware/redisCache");

const router = express.Router();

// Test endpoint to check if database is working
router.get("/test", testDatabase);

// Get all products with pagination, search, and filtering (with caching)
router.get("/", cacheMiddleware({ ttl: 900 }), getAllProducts);

// Get product by ID or slug (with caching)
router.get("/:id", cacheMiddleware({ ttl: 1800 }), getProductById);

// Get product by ID for checkout (minimal data, with caching)
router.get(
  "/checkout/:id",
  cacheMiddleware({ ttl: 1800 }),
  getProductForCheckout
);

// Get product by slug (alternative route for better SEO)
router.get("/slug/:slug", getProductById);

// Create new product (Admin only, with enhanced security and cache invalidation)
router.post(
  "/",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  validateProductData,
  invalidateCache(productCachePatterns.invalidateAll),
  createProduct
);

// Create new product with image URLs (Admin only, with enhanced security and cache invalidation)
router.post(
  "/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  invalidateCache(productCachePatterns.invalidateAll),
  createProductWithImage
);

// Update product with image URLs by ID (Admin only, with enhanced security and cache invalidation)
router.put(
  "/:id/with-image",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  invalidateCache(productCachePatterns.invalidateProduct),
  updateProductWithImage
);

// Update product by ID (Admin only, with enhanced security and cache invalidation)
router.put(
  "/:id",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  validateProductData,
  invalidateCache(productCachePatterns.invalidateProduct),
  updateProduct
);

// Delete product by ID (Admin only, with enhanced security and cache invalidation)
router.delete(
  "/:id",
  productCreationSecurity,
  validateRequest,
  authenticateToken,
  requireAdmin,
  invalidateCache(productCachePatterns.invalidateProduct),
  deleteProduct
);

module.exports = router;
