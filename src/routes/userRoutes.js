const express = require("express");
const {
  generateUser,
  getAllUsers,
  loginUser,
} = require("../controllers/userController");

const router = express.Router();

// Login user
router.post("/login", loginUser);

// Generate new user account
router.post("/generate", generateUser);

// Get all users (for admin)
router.get("/", getAllUsers);

module.exports = router;
