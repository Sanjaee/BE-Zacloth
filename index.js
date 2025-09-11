const express = require("express");
const cors = require("cors");
const productRoutes = require("./src/routes/productRoutes");
const userRoutes = require("./src/routes/userRoutes");
const qrRoutes = require("./src/routes/qrRoutes");
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
