const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { generateTokens, refreshToken } = require("../middleware/auth");
const { sendVerificationEmail } = require("../utils/emailOtp");
const otpQueue = require("../config/otpQueue");

const prisma = new PrismaClient();

// Generate random password using crypto
const generateRandomPassword = (length = 12) => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
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

    // Check if email is verified (only for users with email)
    if (user.email && !user.emailVerified) {
      return res.status(401).json({
        success: false,
        message: "Email not verified. Please verify your email first.",
        requiresVerification: true,
        userId: user.id,
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

// Register user with email OTP
const registerUser = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (existingEmail) {
      if (!existingEmail.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            "Email already exists but not verified. Please verify your email first.",
          requiresVerification: true,
          userId: existingEmail.id,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Email already exists and verified",
        });
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user with email verification pending
    const newUser = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim(),
        password: hashedPassword,
        role: "client",
        emailVerified: false, // We'll add this field to schema
      },
    });

    // Store OTP in database
    await prisma.emailVerification.create({
      data: {
        userId: newUser.id,
        email: email.trim(),
        otp: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    // Add OTP job to queue for background processing
    try {
      const job = await otpQueue.addOtpJob(
        "send-registration-otp",
        {
          userId: newUser.id,
          email: email.trim(),
          username: username.trim(),
          otp: otp,
        },
        {
          priority: 1, // High priority for registration OTPs
          jobId: `reg-otp-${newUser.id}-${Date.now()}`,
        }
      );

      console.log(`Registration OTP job queued: ${job.id}`);

      res.json({
        success: true,
        message:
          "Registration successful. Please check your email for verification code.",
        userId: newUser.id,
        jobId: job.id, // Return job ID for tracking (optional)
      });
    } catch (queueError) {
      console.error("Failed to queue OTP job:", queueError);

      // Fallback: send email directly if queue fails
      try {
        await sendVerificationEmail(email.trim(), username.trim(), otp);
        console.log("Fallback: OTP sent directly");

        res.json({
          success: true,
          message:
            "Registration successful. Please check your email for verification code.",
          userId: newUser.id,
        });
      } catch (emailError) {
        console.error("Fallback email sending failed:", emailError);

        // Clean up the user if both queue and email fail
        await prisma.user.delete({ where: { id: newUser.id } });
        await prisma.emailVerification.deleteMany({
          where: { userId: newUser.id },
        });

        res.status(500).json({
          success: false,
          message: "Registration failed. Please try again.",
          error: "Failed to send verification email",
        });
      }
    }
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Delete any existing verification records for this user
    await prisma.emailVerification.deleteMany({
      where: { userId: userId },
    });

    // Generate new 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store new OTP in database
    await prisma.emailVerification.create({
      data: {
        userId: userId,
        email: user.email,
        otp: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    // Add resend OTP job to queue for background processing
    try {
      const job = await otpQueue.addOtpJob(
        "resend-otp",
        {
          userId: userId,
          email: user.email,
          username: user.username,
          otp: otp,
        },
        {
          priority: 2, // Medium priority for resend OTPs
          jobId: `resend-otp-${userId}-${Date.now()}`,
        }
      );

      console.log(`Resend OTP job queued: ${job.id}`);

      res.json({
        success: true,
        message: "New verification code sent to your email",
        jobId: job.id, // Return job ID for tracking (optional)
      });
    } catch (queueError) {
      console.error("Failed to queue resend OTP job:", queueError);

      // Fallback: send email directly if queue fails
      try {
        await sendVerificationEmail(user.email, user.username, otp);
        console.log("Fallback: Resend OTP sent directly");

        res.json({
          success: true,
          message: "New verification code sent to your email",
        });
      } catch (emailError) {
        console.error("Fallback resend email sending failed:", emailError);

        res.status(500).json({
          success: false,
          message: "Failed to resend OTP. Please try again.",
          error: "Failed to send verification email",
        });
      }
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};

// Check email status (for login validation)
const checkEmailStatus = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.json({
        success: true,
        exists: false,
        message: "Email not found",
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.json({
        success: true,
        exists: true,
        verified: false,
        message: "Email exists but not verified",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      });
    }

    return res.json({
      success: true,
      exists: true,
      verified: true,
      message: "Email exists and verified",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error("Error checking email status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check email status",
      error: error.message,
    });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id; // From authenticated middleware

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Check if user exists
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent admin from deleting themselves
    if (userId === adminId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // Prevent deleting other admins (optional security measure)
    if (userToDelete.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete admin accounts",
      });
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({
      success: true,
      message: `User ${userToDelete.username} has been deleted successfully`,
      deletedUser: {
        id: userToDelete.id,
        username: userToDelete.username,
        email: userToDelete.email,
      },
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

// Verify OTP and activate account
const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    // Find the verification record
    const verification = await prisma.emailVerification.findFirst({
      where: {
        userId: userId,
        otp: otp,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
    });

    if (!verification) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Update user to verified
    const user = await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      include: {
        profile: true,
      },
    });

    // Delete the verification record
    await prisma.emailVerification.delete({
      where: { id: verification.id },
    });

    // Generate JWT tokens
    const tokens = generateTokens(user);

    res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        profile: user.profile,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: error.message,
    });
  }
};

// Check OTP job status (for monitoring)
const checkOtpJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      });
    }

    const jobStatus = await otpQueue.getJobStatus(jobId);

    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    res.json({
      success: true,
      jobStatus,
    });
  } catch (error) {
    console.error("Error checking OTP job status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check job status",
      error: error.message,
    });
  }
};

// Get OTP queue statistics (admin only)
const getOtpQueueStats = async (req, res) => {
  try {
    const stats = await otpQueue.getQueueStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting OTP queue stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get queue statistics",
      error: error.message,
    });
  }
};

// Forgot password - send OTP to email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email || email.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email not found in our system",
      });
    }

    if (!user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email not verified. Please verify your email first.",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing password reset records for this user
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id },
    });

    // Store OTP in database
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        email: email.trim(),
        otp: otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Add password reset OTP job to queue for background processing
    try {
      const job = await otpQueue.addOtpJob(
        "send-password-reset-otp",
        {
          userId: user.id,
          email: email.trim(),
          username: user.username,
          otp: otp,
        },
        {
          priority: 1, // High priority for password reset OTPs
          jobId: `reset-otp-${user.id}-${Date.now()}`,
        }
      );

      console.log(`Password reset OTP job queued: ${job.id}`);

      res.json({
        success: true,
        message: "Password reset code sent to your email",
        userId: user.id,
        jobId: job.id, // Return job ID for tracking (optional)
      });
    } catch (queueError) {
      console.error("Failed to queue password reset OTP job:", queueError);

      // Fallback: send email directly if queue fails
      try {
        await sendVerificationEmail(email.trim(), user.username, otp);
        console.log("Fallback: Password reset OTP sent directly");

        res.json({
          success: true,
          message: "Password reset code sent to your email",
          userId: user.id,
        });
      } catch (emailError) {
        console.error(
          "Fallback password reset email sending failed:",
          emailError
        );

        res.status(500).json({
          success: false,
          message: "Failed to send password reset code. Please try again.",
          error: "Failed to send reset email",
        });
      }
    }
  } catch (error) {
    console.error("Error during forgot password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process forgot password request",
      error: error.message,
    });
  }
};

// Verify password reset OTP
const verifyPasswordResetOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    // Find the password reset record
    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        userId: userId,
        otp: otp,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
    });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Generate new random password
    const newPassword = generateRandomPassword(12);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and delete reset record
    await prisma.$transaction(async (tx) => {
      // Update user password
      await tx.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Delete the reset record
      await tx.passwordReset.delete({
        where: { id: resetRecord.id },
      });
    });

    res.json({
      success: true,
      message: "Password reset successful",
      newPassword: newPassword, // Return new password for display
      userId: userId,
    });
  } catch (error) {
    console.error("Error verifying password reset OTP:", error);
    res.status(500).json({
      success: false,
      message: "Password reset verification failed",
      error: error.message,
    });
  }
};

// Resend password reset OTP
const resendPasswordResetOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email not verified",
      });
    }

    // Delete any existing password reset records for this user
    await prisma.passwordReset.deleteMany({
      where: { userId: userId },
    });

    // Generate new 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store new OTP in database
    await prisma.passwordReset.create({
      data: {
        userId: userId,
        email: user.email,
        otp: otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Add resend password reset OTP job to queue for background processing
    try {
      const job = await otpQueue.addOtpJob(
        "resend-password-reset-otp",
        {
          userId: userId,
          email: user.email,
          username: user.username,
          otp: otp,
        },
        {
          priority: 2, // Medium priority for resend OTPs
          jobId: `resend-reset-otp-${userId}-${Date.now()}`,
        }
      );

      console.log(`Resend password reset OTP job queued: ${job.id}`);

      res.json({
        success: true,
        message: "New password reset code sent to your email",
        jobId: job.id, // Return job ID for tracking (optional)
      });
    } catch (queueError) {
      console.error(
        "Failed to queue resend password reset OTP job:",
        queueError
      );

      // Fallback: send email directly if queue fails
      try {
        await sendVerificationEmail(user.email, user.username, otp);
        console.log("Fallback: Resend password reset OTP sent directly");

        res.json({
          success: true,
          message: "New password reset code sent to your email",
        });
      } catch (emailError) {
        console.error(
          "Fallback resend password reset email sending failed:",
          emailError
        );

        res.status(500).json({
          success: false,
          message: "Failed to resend password reset code. Please try again.",
          error: "Failed to send reset email",
        });
      }
    }
  } catch (error) {
    console.error("Error resending password reset OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend password reset code",
      error: error.message,
    });
  }
};

// Update password (for password reset flow)
const updatePassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "User ID and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password",
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
  registerUser,
  verifyOtp,
  resendOtp,
  checkEmailStatus,
  deleteUser,
  checkOtpJobStatus,
  getOtpQueueStats,
  forgotPassword,
  verifyPasswordResetOtp,
  resendPasswordResetOtp,
  updatePassword,
};
