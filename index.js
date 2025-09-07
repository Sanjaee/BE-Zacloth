const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const port = 5000;
const prisma = new PrismaClient();

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

// Test endpoint to check if database is working
app.get("/test", async (req, res) => {
  try {
    const count = await prisma.product.count();
    res.json({
      message: "Database connected successfully",
      totalProducts: count,
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Endpoint ambil semua produk dengan pagination
app.get("/products", async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const category = req.query.category || "";
    const gender = req.query.gender || "";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder || "asc";

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category && category !== "") {
      where.category = category;
    }

    if (gender && gender !== "") {
      where.genders = {
        some: {
          type: gender,
        },
      };
    }

    // Build orderBy clause
    let orderBy = {};
    console.log("Backend sorting:", { sortBy, sortOrder });
    switch (sortBy) {
      case "price":
        orderBy = { currentPrice: sortOrder };
        break;
      case "brand":
        orderBy = { brand: sortOrder };
        break;
      case "name":
      default:
        orderBy = { name: sortOrder };
        break;
    }
    console.log("Final orderBy:", orderBy);

    // Get total count for pagination
    const totalCount = await prisma.product.count({ where });

    // Get products with pagination
    const rawProducts = await prisma.product.findMany({
      where,
      include: {
        skuData: true,
        genders: true,
        subCategories: true,
      },
      orderBy,
      skip: offset,
      take: limit,
    });

    // Transform data to match frontend expectations
    const products = rawProducts.map((product) => ({
      ...product,
      genders: product.genders.map((g) => g.type),
      subCategory: product.subCategories.map((sc) => sc.name),
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Gagal mengambil produk" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
