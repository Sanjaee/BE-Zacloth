const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { generateTokens, refreshToken } = require("../middleware/auth");

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
        role: true,
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

    // Generate JWT tokens
    const tokens = generateTokens(user);

    // Return user data with tokens (excluding password)
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
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
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

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware
    const {
      fullName,
      bio,
      avatarUrl,
      email,
      instagram,
      tiktok,
      xAccount,
      facebook,
      youtube,
      linkedin,
    } = req.body;

    // Validate input
    if (!fullName || fullName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Update profile in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user email if provided
      if (email && email !== user.email) {
        await tx.user.update({
          where: { id: userId },
          data: { email: email.trim() },
        });
      }

      // Update profile
      const updatedProfile = await tx.profile.update({
        where: { userId: userId },
        data: {
          fullName: fullName.trim(),
          bio: bio ? bio.trim() : null,
          avatarUrl: avatarUrl ? avatarUrl.trim() : null,
          instagram: instagram ? instagram.trim() : null,
          tiktok: tiktok ? tiktok.trim() : null,
          xAccount: xAccount ? xAccount.trim() : null,
          facebook: facebook ? facebook.trim() : null,
          youtube: youtube ? youtube.trim() : null,
          linkedin: linkedin ? linkedin.trim() : null,
        },
      });

      return updatedProfile;
    });

    // Return updated profile data
    res.json({
      success: true,
      message: "Profile updated successfully",
      profile: {
        id: result.id,
        fullName: result.fullName,
        bio: result.bio,
        avatarUrl: result.avatarUrl,
        instagram: result.instagram,
        tiktok: result.tiktok,
        xAccount: result.xAccount,
        facebook: result.facebook,
        youtube: result.youtube,
        linkedin: result.linkedin,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// Get user profile (authenticated users only)
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware

    // Get user with profile data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Return profile data
    res.json({
      success: true,
      profile: {
        id: user.profile?.id || null,
        fullName: user.profile?.fullName || user.username,
        bio: user.profile?.bio || null,
        avatarUrl: user.profile?.avatarUrl || null,
        instagram: user.profile?.instagram || null,
        tiktok: user.profile?.tiktok || null,
        xAccount: user.profile?.xAccount || null,
        facebook: user.profile?.facebook || null,
        youtube: user.profile?.youtube || null,
        linkedin: user.profile?.linkedin || null,
        email: user.email || null,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// Get user addresses (authenticated users only)
const getUserAddresses = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware

    // Get user addresses
    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    res.json({
      success: true,
      addresses,
      hasAddresses: addresses.length > 0,
    });
  } catch (error) {
    console.error("Error fetching user addresses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user addresses",
      error: error.message,
    });
  }
};

// Create user address (authenticated users only)
const createUserAddress = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware
    const {
      recipientName,
      phoneNumber,
      provinceId,
      provinceName,
      cityId,
      cityName,
      subdistrictId,
      subdistrictName,
      postalCode,
      addressDetail,
      isPrimary = false,
    } = req.body;

    // Validation
    if (
      !recipientName ||
      !phoneNumber ||
      !provinceId ||
      !cityId ||
      !addressDetail
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: recipientName, phoneNumber, provinceId, cityId, addressDetail",
      });
    }

    // Check if user already has 2 addresses (maximum limit)
    const existingAddressesCount = await prisma.userAddress.count({
      where: { userId },
    });

    if (existingAddressesCount >= 2) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum of 2 addresses allowed. Please delete an existing address first.",
      });
    }

    // If this is set as primary, unset other primary addresses
    if (isPrimary) {
      await prisma.userAddress.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Create new address
    const newAddress = await prisma.userAddress.create({
      data: {
        userId,
        recipientName,
        phoneNumber,
        provinceId: parseInt(provinceId),
        provinceName,
        cityId: parseInt(cityId),
        cityName,
        subdistrictId: subdistrictId ? parseInt(subdistrictId) : null,
        subdistrictName,
        postalCode,
        addressDetail,
        isPrimary,
      },
    });

    res.json({
      success: true,
      message: "Address created successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Error creating user address:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create address",
      error: error.message,
    });
  }
};

// Update user address (authenticated users only)
const updateUserAddress = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware
    const addressId = req.params.id;
    const {
      recipientName,
      phoneNumber,
      provinceId,
      provinceName,
      cityId,
      cityName,
      subdistrictId,
      subdistrictName,
      postalCode,
      addressDetail,
      isPrimary = false,
    } = req.body;

    // Validation
    if (
      !recipientName ||
      !phoneNumber ||
      !provinceId ||
      !cityId ||
      !addressDetail
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: recipientName, phoneNumber, provinceId, cityId, addressDetail",
      });
    }

    // Check if address exists and belongs to user
    const existingAddress = await prisma.userAddress.findFirst({
      where: { id: addressId, userId },
    });

    if (!existingAddress) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      });
    }

    // If this is set as primary, unset other primary addresses
    if (isPrimary) {
      await prisma.userAddress.updateMany({
        where: { userId, isPrimary: true, id: { not: addressId } },
        data: { isPrimary: false },
      });
    }

    // Update address
    const updatedAddress = await prisma.userAddress.update({
      where: { id: addressId },
      data: {
        recipientName,
        phoneNumber,
        provinceId: parseInt(provinceId),
        provinceName,
        cityId: parseInt(cityId),
        cityName,
        subdistrictId: subdistrictId ? parseInt(subdistrictId) : null,
        subdistrictName,
        postalCode,
        addressDetail,
        isPrimary,
      },
    });

    res.json({
      success: true,
      message: "Address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Error updating user address:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address",
      error: error.message,
    });
  }
};

// Delete user address (authenticated users only)
const deleteUserAddress = async (req, res) => {
  try {
    const userId = req.user.id; // From authenticated middleware
    const addressId = req.params.id;

    // Check if address exists and belongs to user
    const existingAddress = await prisma.userAddress.findFirst({
      where: { id: addressId, userId },
    });

    if (!existingAddress) {
      return res.status(400).json({
        success: false,
        message: "Address not found",
      });
    }

    // Delete address
    await prisma.userAddress.delete({
      where: { id: addressId },
    });

    res.json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user address:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete address",
      error: error.message,
    });
  }
};

module.exports = {
  generateUser,
  getAllUsers,
  loginUser,
  refreshToken,
  updateProfile,
  getProfile,
  getUserAddresses,
  createUserAddress,
  updateUserAddress,
  deleteUserAddress,
};
