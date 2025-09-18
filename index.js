const express = require("express");
const cors = require("cors");
const path = require("path");
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

// Serve static files from assets directory with CORS headers (BEFORE security middleware)
app.use(
  "/assets",
  (req, res, next) => {
    console.log(
      "Assets request:",
      req.method,
      req.url,
      "Origin:",
      req.get("Origin")
    );

    // Set CORS headers for all requests
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );

    console.log("CORS headers set:", {
      "Access-Control-Allow-Origin": res.get("Access-Control-Allow-Origin"),
      "Access-Control-Allow-Methods": res.get("Access-Control-Allow-Methods"),
    });

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      console.log("Handling OPTIONS preflight request");
      res.sendStatus(200);
    } else {
      next();
    }
  },
  express.static(path.join(__dirname, "assets"))
);

// Security middleware (applied after assets)
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

// Test endpoint for assets CORS
app.get("/test-assets-cors", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.json({
    message: "Assets CORS test successful",
    timestamp: new Date().toISOString(),
  });
});

// Use product routes
app.use("/products", productRoutes);

// Use user routes
app.use("/users", userRoutes);

// Use QR routes
app.use("/qr", qrRoutes);

// Use visitor routes
const visitorRoutes = require("./src/routes/visitorRoutes");
app.use("/visitors", visitorRoutes);

// Use RajaOngkir routes
const rajaOngkirRoutes = require("./src/routes/rajaOngkirRoutes");
app.use("/rajaongkir", rajaOngkirRoutes);

// Use Payment routes
const paymentRoutes = require("./src/routes/paymentRoutes");
app.use("/payments", paymentRoutes);

// Use Plisio routes
const plisioRoutes = require("./src/routes/plisioRoutes");
app.use("/api/plisio", plisioRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
