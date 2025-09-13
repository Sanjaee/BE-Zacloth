const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure assets directory exists
const assetsDir = path.join(__dirname, "../../assets");
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, assetsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const fileName = file.fieldname + "-" + uniqueSuffix + fileExtension;
    cb(null, fileName);
  },
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed!"));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB limit
  },
  fileFilter: fileFilter,
});

// Single image upload
const uploadSingle = upload.single("image");

// Multiple images upload
const uploadMultiple = upload.array("images", 5); // Max 5 images

// Upload single image
const uploadImage = (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "Error uploading image",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // Return the file information
    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `/assets/${req.file.filename}`, // URL to access the image
    };

    res.json({
      success: true,
      message: "Image uploaded successfully",
      data: fileInfo,
    });
  });
};

// Upload multiple images
const uploadImages = (req, res) => {
  uploadMultiple(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "Error uploading images",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files provided",
      });
    }

    // Return the files information
    const filesInfo = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/assets/${file.filename}`, // URL to access the image
    }));

    res.json({
      success: true,
      message: `${req.files.length} images uploaded successfully`,
      data: filesInfo,
    });
  });
};

// Delete image
const deleteImage = (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: "Filename is required",
      });
    }

    const filePath = path.join(assetsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting image",
      error: error.message,
    });
  }
};

// Get image info
const getImageInfo = (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: "Filename is required",
      });
    }

    const filePath = path.join(assetsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Get file stats
    const stats = fs.statSync(filePath);

    res.json({
      success: true,
      data: {
        filename: filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `/assets/${filename}`,
      },
    });
  } catch (error) {
    console.error("Get image info error:", error);
    res.status(500).json({
      success: false,
      message: "Error getting image info",
      error: error.message,
    });
  }
};

module.exports = {
  uploadImage,
  uploadImages,
  deleteImage,
  getImageInfo,
  upload, // Export multer instance for use in routes
};
