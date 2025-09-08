const express = require("express");
const cors = require("cors");
const productRoutes = require("./src/routes/productRoutes");
const userRoutes = require("./src/routes/userRoutes");
const qrRoutes = require("./src/routes/qrRoutes");

const app = express();
const port = 5000;

app.use(
  cors({
    origin: ["http://localhost:3000", "https://zacloth.com"],
    credentials: true,
  })
);
app.use(express.json());

// Endpoint welcome
app.get("/", (req, res) => {
  res.send("Selamat datang di Product API dengan Prisma!");
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
