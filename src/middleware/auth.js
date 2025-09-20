require("dotenv").config();
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// JWT Secret - should be in environment variables
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "D8D3DA7A75F61ACD5A4CD579EDBBC";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "D8D3DA7A75F61ACD5A4CD579EDBBC";

// Generate JWT tokens
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d", // Short-lived access token
    issuer: "zacloth-api",
    audience: "zacloth-client",
  });

  const refreshToken = jwt.sign(
    { id: user.id, type: "refresh" },
    JWT_REFRESH_SECRET,
    {
      expiresIn: "7d", // Long-lived refresh token
      issuer: "zacloth-api",
      audience: "zacloth-client",
    }
  );

  return { accessToken, refreshToken };
};

// Verify JWT token
const verifyToken = (token, secret = JWT_SECRET) => {
  try {
    return jwt.verify(token, secret, {
      issuer: "zacloth-api",
      audience: "zacloth-client",
    });
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

// Middleware to authenticate requests
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
        code: "NO_TOKEN",
      });
    }

    const decoded = verifyToken(token);

    // Handle both 'id' and 'userId' fields for backward compatibility
    const userId = decoded.id || decoded.userId;

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      code: "INVALID_TOKEN",
      error: error.message,
    });
  }
};

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
      code: "INSUFFICIENT_PERMISSIONS",
    });
  }
  next();
};

// Middleware to check client role
const requireClient = (req, res, next) => {
  if (req.user.role !== "client" && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Client access required",
      code: "INSUFFICIENT_PERMISSIONS",
    });
  }
  next();
};

// Refresh token endpoint
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
        code: "NO_REFRESH_TOKEN",
      });
    }

    const decoded = verifyToken(refreshToken, JWT_REFRESH_SECRET);

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    // Handle both 'id' and 'userId' fields for backward compatibility
    const userId = decoded.id || decoded.userId;

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    res.json({
      success: true,
      message: "Tokens refreshed successfully",
      ...tokens,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token",
      code: "INVALID_REFRESH_TOKEN",
      error: error.message,
    });
  }
};

module.exports = {
  generateTokens,
  verifyToken,
  authenticateToken,
  requireAdmin,
  requireClient,
  refreshToken,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};
