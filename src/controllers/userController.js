const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Generate random password
const generateRandomPassword = (length = 12) => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Generate user account
const generateUser = async (req, res) => {
  try {
    const { username } = req.body;

    // Validate input
    if (!username || username.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Generate random password
    const password = generateRandomPassword();

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with profile in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user first (users generated through admin panel default to client)
      const newUser = await tx.user.create({
        data: {
          username: username.trim(),
          password: hashedPassword,
          role: "client", // Users generated through admin panel default to client
        },
      });

      // Create profile for the user
      const newProfile = await tx.profile.create({
        data: {
          fullName: username.trim(), // Use username as default fullName
          userId: newUser.id,
        },
      });

      return { user: newUser, profile: newProfile };
    });

    // Return user data with profile info
    res.json({
      success: true,
      message: "User and profile created successfully",
      user: {
        id: result.user.id,
        username: result.user.username,
        password: password, // Only for admin display
        createdAt: result.user.createdAt,
        profile: {
          id: result.profile.id,
          fullName: result.profile.fullName,
        },
      },
    });
  } catch (error) {
    console.error("Error generating user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

// Get all users (for admin)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            fullName: true,
            bio: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

// Login user
const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      include: {
        profile: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Return user data (excluding password)
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        profile: user.profile,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

module.exports = {
  generateUser,
  getAllUsers,
  loginUser,
};
