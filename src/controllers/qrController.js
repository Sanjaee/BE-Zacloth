const { PrismaClient } = require("@prisma/client");
const QRCode = require("qrcode");

const prisma = new PrismaClient();

// Generate QR code for user profile
const generateProfileQR = async (req, res) => {
  try {
    const { profileId } = req.params;

    // Verify profile exists
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    // Create QR code data
    const qrData = {
      profileId: profile.id,
      username: profile.user.username,
      fullName: profile.fullName,
      type: "user_profile",
      timestamp: new Date().toISOString(),
    };

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      success: true,
      qrCode: qrCodeDataURL,
      profile: {
        id: profile.id,
        fullName: profile.fullName,
        username: profile.user.username,
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate QR code",
      error: error.message,
    });
  }
};

// Generate QR code for user profile (simple URL version)
const generateProfileQRSimple = async (req, res) => {
  try {
    const { profileId } = req.params;

    // Verify profile exists
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    // Create simple URL for QR code
    const baseUrl = process.env.FRONTEND_URL || "https://zacloth.com";
    const profileUrl = `${baseUrl}/qr/${profileId}`;

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(profileUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      success: true,
      qrCode: qrCodeDataURL,
      profileUrl: profileUrl,
      profile: {
        id: profile.id,
        fullName: profile.fullName,
        username: profile.user.username,
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate QR code",
      error: error.message,
    });
  }
};

// Get profile by ID (for QR code scanning)
const getProfileByQR = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            username: true,
            createdAt: true,
          },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        fullName: profile.fullName,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        username: profile.user.username,
        createdAt: profile.user.createdAt,
        socialMedia: {
          instagram: profile.instagram,
          tiktok: profile.tiktok,
          xAccount: profile.xAccount,
          facebook: profile.facebook,
          youtube: profile.youtube,
          linkedin: profile.linkedin,
        },
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

module.exports = {
  generateProfileQR,
  generateProfileQRSimple,
  getProfileByQR,
};
