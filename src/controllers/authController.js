// controllers/authController.js
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const jwt = require("jsonwebtoken");

const authController = {
  // Get current user profile
  getProfile: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          googleId: true,
          username: true,
          email: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user });
    } catch (error) {
      console.error("Error getting profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Get user profile by user ID
  getProfileById: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user });
    } catch (error) {
      console.error("Error getting profile by ID:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Update user profile
  updateProfile: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { username, avatarUrl } = req.body;

      if (username && username !== req.user.username) {
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });

        if (existingUser) {
          return res.status(400).json({ error: "Username already taken" });
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(username && { username }),
        },
        select: {
          id: true,
          googleId: true,
          username: true,
          email: true,
          createdAt: true,
        },
      });

      res.json({ user: updatedUser });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Create JWT session - NEW ENDPOINT
  createSession: async (req, res) => {
    try {
      const { userId, email } = req.body;

      if (!userId || !email) {
        return res.status(400).json({ error: "UserId and email required" });
      }

      // Verify user exists with complete data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      if (!user || user.email !== email) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id, // Use 'id' to match credential login format
          email: user.email,
          username: user.username,
        },
        process.env.JWT_SECRET || "your-secret-key",
        {
          expiresIn: "15m",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      const responseData = {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          role: user.role,
        },
      };

      res.json(responseData);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Generate JWT token for NextAuth integration
  generateToken: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = jwt.sign(
        {
          id: req.user.id, // Use 'id' to match credential login format
          email: req.user.email,
          username: req.user.username,
        },
        process.env.JWT_SECRET || "your-secret-key",
        {
          expiresIn: "15m",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      res.json({ token, user: req.user });
    } catch (error) {
      console.error("Error generating token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Verify JWT token - Updated to handle both JWT and user object
  verifyToken: async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Token required" });
      }

      // Try JWT verification first
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your-secret-key",
          {
            issuer: "zacloth-api",
            audience: "zacloth-client",
          }
        );

        // Handle both 'id' and 'userId' fields for backward compatibility
        const userId = decoded.id || decoded.userId;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            googleId: true,
            username: true,
            email: true,
            createdAt: true,
            role: true,
          },
        });

        if (!user) {
          return res
            .status(404)
            .json({ error: "User not found", valid: false });
        }

        return res.json({ user, valid: true });
      } catch (jwtError) {
        // If JWT verification fails, try parsing as user object (fallback)
        try {
          const userData = JSON.parse(token);
          if (userData.userId || userData.id) {
            // Handle both 'id' and 'userId' fields for backward compatibility
            const userId = userData.id || userData.userId;
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                id: true,
                googleId: true,
                username: true,
                email: true,
                createdAt: true,
                role: true,
              },
            });

            if (user) {
              return res.json({ user, valid: true });
            }
          }
        } catch (parseError) {
          // Both JWT and JSON parsing failed
        }
      }

      res.status(401).json({ error: "Invalid token", valid: false });
    } catch (error) {
      console.error("Error verifying token:", error);
      res.status(401).json({ error: "Invalid token", valid: false });
    }
  },

  // Google OAuth callback handler (for Passport)
  googleCallback: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Google authentication failed" });
      }

      const user = req.user;

      // Generate JWT token for the authenticated user
      const token = jwt.sign(
        {
          id: user.id, // Use 'id' to match credential login format
          email: user.email,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET || "your-secret-key",
        {
          expiresIn: "15m",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          id: user.id, // Use 'id' to match credential login format
          type: "refresh",
        },
        process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
        {
          expiresIn: "30d",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      res.json({
        success: true,
        message: "Google authentication successful",
        accessToken: token,
        refreshToken: refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile || null,
        },
      });
    } catch (error) {
      console.error("Error in Google callback:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Google OAuth callback handler (for NextAuth)
  googleCallbackNextAuth: async (req, res) => {
    try {
      const { googleId, email, name, picture } = req.body;

      if (!googleId || !email) {
        return res
          .status(400)
          .json({ error: "Google ID and email are required" });
      }

      // Check if user already exists with this Google ID
      let user = await prisma.user.findUnique({
        where: { googleId: googleId },
        include: {
          profile: true,
        },
      });

      if (user) {
        // User exists, generate tokens
        const token = jwt.sign(
          {
            id: user.id, // Use 'id' to match credential login format
            email: user.email,
            username: user.username,
            role: user.role,
          },
          process.env.JWT_SECRET || "your-secret-key",
          {
            expiresIn: "15m",
            issuer: "zacloth-api",
            audience: "zacloth-client",
          }
        );

        const refreshToken = jwt.sign(
          {
            id: user.id, // Use 'id' to match credential login format
            type: "refresh",
          },
          process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
          {
            expiresIn: "30d",
            issuer: "zacloth-api",
            audience: "zacloth-client",
          }
        );

        return res.json({
          success: true,
          message: "Google authentication successful",
          accessToken: token,
          refreshToken: refreshToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            profile: user.profile || null,
          },
        });
      }

      // Check if user exists with this email
      user = await prisma.user.findUnique({
        where: { email: email },
        include: {
          profile: true,
        },
      });

      if (user) {
        // Update existing user with Google ID
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleId,
            profile: {
              upsert: {
                create: {
                  fullName: name || user.username,
                  avatarUrl: picture || null,
                },
                update: {
                  avatarUrl: picture || user.profile?.avatarUrl,
                },
              },
            },
          },
          include: {
            profile: true,
          },
        });

        const token = jwt.sign(
          {
            id: updatedUser.id, // Use 'id' to match credential login format
            email: updatedUser.email,
            username: updatedUser.username,
            role: updatedUser.role,
          },
          process.env.JWT_SECRET || "your-secret-key",
          {
            expiresIn: "15m",
            issuer: "zacloth-api",
            audience: "zacloth-client",
          }
        );

        const refreshToken = jwt.sign(
          {
            id: updatedUser.id, // Use 'id' to match credential login format
            type: "refresh",
          },
          process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
          {
            expiresIn: "30d",
            issuer: "zacloth-api",
            audience: "zacloth-client",
          }
        );

        return res.json({
          success: true,
          message: "Google authentication successful",
          accessToken: token,
          refreshToken: refreshToken,
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            profile: updatedUser.profile || null,
          },
        });
      }

      // Create new user
      const baseUsername = email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 20);
      const newUser = await prisma.user.create({
        data: {
          googleId: googleId,
          username: baseUsername,
          email: email,
          role: "client",
          profile: {
            create: {
              fullName: name || baseUsername,
              avatarUrl: picture || null,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      const token = jwt.sign(
        {
          id: newUser.id, // Use 'id' to match credential login format
          email: newUser.email,
          username: newUser.username,
          role: newUser.role,
        },
        process.env.JWT_SECRET || "your-secret-key",
        {
          expiresIn: "15m",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      const refreshToken = jwt.sign(
        {
          id: newUser.id, // Use 'id' to match credential login format
          type: "refresh",
        },
        process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
        {
          expiresIn: "30d",
          issuer: "zacloth-api",
          audience: "zacloth-client",
        }
      );

      res.json({
        success: true,
        message: "Google authentication successful",
        accessToken: token,
        refreshToken: refreshToken,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          profile: newUser.profile || null,
        },
      });
    } catch (error) {
      console.error("Error in Google callback NextAuth:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Google OAuth success redirect
  googleSuccess: (req, res) => {
    if (req.user) {
      res.json({
        success: true,
        message: "Google authentication successful",
        user: req.user,
      });
    } else {
      res.status(401).json({ error: "Google authentication failed" });
    }
  },

  // Google OAuth failure redirect
  googleFailure: (req, res) => {
    res.status(401).json({
      error: "Google authentication failed",
      message: "Unable to authenticate with Google. Please try again.",
    });
  },

  // Get user addresses (authenticated users only)
  getUserAddresses: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userId = req.user.id;

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
  },

  // Create user address (authenticated users only)
  createUserAddress: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userId = req.user.id;
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
  },

  // Update user address (authenticated users only)
  updateUserAddress: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userId = req.user.id;
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
        return res.status(404).json({
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
  },

  // Delete user address (authenticated users only)
  deleteUserAddress: async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userId = req.user.id;
      const addressId = req.params.id;

      // Check if address exists and belongs to user
      const existingAddress = await prisma.userAddress.findFirst({
        where: { id: addressId, userId },
      });

      if (!existingAddress) {
        return res.status(404).json({
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
  },

  // Logout
  logout: (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  },
};

module.exports = authController;
