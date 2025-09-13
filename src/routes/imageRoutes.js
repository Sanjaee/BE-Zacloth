const express = require("express");
const {
  uploadImage,
  uploadImages,
  deleteImage,
  getImageInfo,
} = require("../controllers/imageController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { validateImageUpload } = require("../validation/imageValidation");
const { webAppOnly, validateRequest } = require("../middleware/security");

const router = express.Router();

// Upload single image (Admin only, with enhanced security)
router.post(
  "/upload",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  uploadImage
);

// Upload multiple images (Admin only, with enhanced security)
router.post(
  "/upload-multiple",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  uploadImages
);

// Delete image (Admin only, with enhanced security)
router.delete(
  "/:filename",
  webAppOnly,
  validateRequest,
  authenticateToken,
  requireAdmin,
  deleteImage
);

// Get image info (Public access)
router.get("/info/:filename", getImageInfo);

module.exports = router;
