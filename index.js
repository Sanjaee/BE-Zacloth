const express = require("express");
const cors = require("cors");
const path = require("path");
const productRoutes = require("./src/routes/productRoutes");
const userRoutes = require("./src/routes/userRoutes");
const qrRoutes = require("./src/routes/qrRoutes");
const imageRoutes = require("./src/routes/imageRoutes");
const {
  securityHeaders,
  corsOptions,
  apiLimiter,
  validateRequest,
  requestLogger,
} = require("./src/middleware/security");

const app = express();
const port = process.env.PORT || 5000;

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Security middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(apiLimiter);
app.use(validateRequest);
app.use(requestLogger);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files from assets directory with CORS headers
app.use(
  "/assets",
  (req, res, next) => {
    const origin = req.get("Origin");

    // Allow localhost in development
    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV !== "production"
    ) {
      if (
        origin &&
        (origin.includes("localhost") || origin.includes("127.0.0.1"))
      ) {
        res.header("Access-Control-Allow-Origin", origin);
      } else {
        res.header("Access-Control-Allow-Origin", "*");
      }
    } else {
      // In production, use the same CORS logic as the main app
      const allowedOrigins = [
        process.env.FRONTEND_URL || "https://zacloth.com",
        "https://www.zacloth.com",
      ];

      if (origin && allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
      }
    }

    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  },
  express.static(path.join(__dirname, "assets"))
);

// Endpoint welcome
app.get("/", (req, res) => {
  res.send("Selamat datang di Product API dengan Prisma!");
});

// Debug endpoint for CORS
app.get("/debug/cors", (req, res) => {
  res.json({
    origin: req.get("Origin"),
    userAgent: req.get("User-Agent"),
    allowedOrigins: [process.env.FRONTEND_URL || "https://zacloth.com"],
    nodeEnv: process.env.NODE_ENV,
  });
});

// Use product routes
app.use("/products", productRoutes);

// Use user routes
app.use("/users", userRoutes);

// Use QR routes
app.use("/qr", qrRoutes);

// Use image routes
app.use("/images", imageRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
