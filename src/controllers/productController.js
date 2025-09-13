const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("./imageController");

const prisma = new PrismaClient();

// Test endpoint to check if database is working
const testDatabase = async (req, res) => {
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
};

// Get all products with pagination, search, and filtering
const getAllProducts = async (req, res) => {
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
};

// Create new product (Admin only)
const createProduct = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin (this should already be checked by requireAdmin middleware)
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat menambah produk.",
      });
    }

    const {
      isOnSale,
      isNikeByYou,
      catalogId,
      brand,
      category,
      cloudProductId,
      color,
      country,
      currentPrice,
      fullPrice,
      name,
      prodigyId,
      imageUrl,
      genders,
      skuData,
      subCategories,
    } = req.body;

    // Debug logging
    console.log("Product creation request data:", {
      catalogId,
      brand,
      category,
      name,
      currentPrice,
      fullPrice,
      userId,
      userRole,
    });

    // Validate required fields
    if (
      !catalogId ||
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: catalogId, brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0)",
      });
    }

    // Check if catalogId already exists
    const existingProduct = await prisma.product.findUnique({
      where: { catalogId },
    });

    if (existingProduct) {
      return res.status(400).json({
        message: "Produk dengan catalogId ini sudah ada",
      });
    }

    // Create product with related data
    const product = await prisma.product.create({
      data: {
        isOnSale: isOnSale || false,
        isNikeByYou: isNikeByYou || false,
        catalogId,
        brand,
        category,
        cloudProductId: cloudProductId || "",
        color: color || "",
        country: country || "",
        currentPrice: parseInt(currentPrice),
        fullPrice: parseInt(fullPrice),
        name,
        prodigyId: prodigyId || "",
        imageUrl: imageUrl || "",
        userId: userId,
        genders: {
          create:
            genders?.map((gender) => ({
              type: gender,
            })) || [],
        },
        skuData: {
          create:
            skuData?.map((sku) => ({
              size: sku.size,
              sku: sku.sku,
              gtin: sku.gtin,
            })) || [],
        },
        subCategories: {
          create:
            subCategories?.map((subCat) => ({
              name: subCat,
            })) || [],
        },
      },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
      },
    });

    res.status(201).json({
      message: "Produk berhasil ditambahkan",
      product: {
        ...product,
        genders: product.genders.map((g) => g.type),
        subCategory: product.subCategories.map((sc) => sc.name),
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      message: "Gagal menambahkan produk",
      error: error.message,
    });
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Product ID is required",
      });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        skuData: true,
        genders: true,
        subCategories: true,
        user: {
          select: {
            id: true,
            username: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Transform data to match frontend expectations
    const transformedProduct = {
      ...product,
      genders: product.genders.map((g) => g.type),
      subCategory: product.subCategories.map((sc) => sc.name),
    };

    res.json({
      product: transformedProduct,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      message: "Gagal mengambil detail produk",
      error: error.message,
    });
  }
};

// Create product with image upload
const createProductWithImage = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin (this should already be checked by requireAdmin middleware)
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat menambah produk.",
      });
    }

    // Parse form data - handle both JSON and FormData
    let productData;
    if (req.body.data) {
      // If data is sent as FormData, parse the JSON string
      productData = JSON.parse(req.body.data);
    } else {
      // If data is sent as regular JSON
      productData = req.body;
    }

    const {
      isOnSale,
      isNikeByYou,
      catalogId,
      brand,
      category,
      cloudProductId,
      color,
      country,
      currentPrice,
      fullPrice,
      name,
      prodigyId,
      imageUrl, // This can be a URL or will be replaced by uploaded image
      genders,
      skuData,
      subCategories,
    } = productData;

    // Debug logging
    console.log("Product creation request data:", {
      catalogId,
      brand,
      category,
      name,
      currentPrice,
      fullPrice,
      userId,
      userRole,
      hasImage: !!req.file,
    });

    // Validate required fields
    if (
      !catalogId ||
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: catalogId, brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0)",
      });
    }

    // Check if catalogId already exists
    const existingProduct = await prisma.product.findUnique({
      where: { catalogId },
    });

    if (existingProduct) {
      return res.status(400).json({
        message: "Produk dengan catalogId ini sudah ada",
      });
    }

    // Determine image URL - use uploaded image if available, otherwise use provided URL
    let finalImageUrl = imageUrl || "";
    if (req.file) {
      finalImageUrl = `/assets/${req.file.filename}`;
    }

    // Create product with related data
    const product = await prisma.product.create({
      data: {
        isOnSale: isOnSale || false,
        isNikeByYou: isNikeByYou || false,
        catalogId,
        brand,
        category,
        cloudProductId: cloudProductId || "",
        color: color || "",
        country: country || "",
        currentPrice: parseInt(currentPrice),
        fullPrice: parseInt(fullPrice),
        name,
        prodigyId: prodigyId || "",
        imageUrl: finalImageUrl,
        userId: userId,
        genders: {
          create:
            genders?.map((gender) => ({
              type: gender,
            })) || [],
        },
        skuData: {
          create:
            skuData?.map((sku) => ({
              size: sku.size,
              sku: sku.sku,
              gtin: sku.gtin,
            })) || [],
        },
        subCategories: {
          create:
            subCategories?.map((subCat) => ({
              name: subCat,
            })) || [],
        },
      },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
      },
    });

    res.status(201).json({
      message: "Produk berhasil ditambahkan",
      product: {
        ...product,
        genders: product.genders.map((g) => g.type),
        subCategory: product.subCategories.map((sc) => sc.name),
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      message: "Gagal menambahkan produk",
      error: error.message,
    });
  }
};

module.exports = {
  testDatabase,
  getAllProducts,
  createProduct,
  createProductWithImage,
  getProductById,
};
