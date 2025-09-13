const express = require("express");
const {
  uploadImage,
  uploadImages,
  deleteImage,
  getImageInfo,
} = require("../controllers/imageController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { validateImageUpload } = require("../validation/imageValidation");

const router = express.Router();

// Upload single image (Admin only)
router.post("/upload", authenticateToken, requireAdmin, uploadImage);

// Upload multiple images (Admin only)
router.post("/upload-multiple", authenticateToken, requireAdmin, uploadImages);

// Delete image (Admin only)
router.delete("/:filename", authenticateToken, requireAdmin, deleteImage);

// Get image info (Public access)
router.get("/info/:filename", getImageInfo);

module.exports = router;
