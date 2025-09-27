const { PrismaClient } = require("@prisma/client");
const { generateSlug, generateUniqueSlug } = require("../utils/slugGenerator");
const redisConfig = require("../config/redisConfig");

const prisma = new PrismaClient();

// Helper function to log cache invalidation (no longer needed for SSR)
const logCacheInvalidation = (productId, action) => {
  console.log(`🔄 Cache invalidated for product ${productId} (${action})`);
  console.log(`📝 Frontend will fetch fresh data on next request via SSR`);
};

// Helper function to invalidate product-related caches
const invalidateProductCaches = async (productId = null) => {
  if (!redisConfig.isRedisConnected()) {
    return;
  }

  try {
    const patterns = [
      "products:list:*",
      "product:detail:*",
      "cache:GET:/api/products*",
      "cache:GET:/api/products/*",
      "cache:GET:/products*",
      "cache:GET:/products/*",
      // More comprehensive patterns for middleware cache
      "cache:GET:/api/products*",
      "cache:GET:/api/products/*",
      "cache:GET:/api/products/*:*",
      "cache:GET:/products*",
      "cache:GET:/products/*",
      "cache:GET:/products/*:*",
      // Additional patterns for middleware cache keys with base64 encoding
      "cache:GET:/api/products/*:*:*",
      "cache:GET:/products/*:*:*",
    ];

    if (productId) {
      patterns.push(`product:detail:${productId}`);
      patterns.push(`product:checkout:${productId}`);
      patterns.push(`cache:GET:/api/products/${productId}*`);
      patterns.push(`cache:GET:/products/${productId}*`);
      // Add more specific patterns for middleware cache keys
      patterns.push(`cache:GET:/api/products/${productId}:*`);
      patterns.push(`cache:GET:/products/${productId}:*`);
      patterns.push(`cache:GET:/api/products/${productId}:*:*`);
      patterns.push(`cache:GET:/products/${productId}:*:*`);
    }

    for (const pattern of patterns) {
      const deletedCount = await redisConfig.invalidatePattern(pattern);
      console.log(
        `Invalidated ${deletedCount} cache entries for pattern: ${pattern}`
      );
    }

    console.log(
      `Product caches invalidated successfully for ${
        productId ? `product ${productId}` : "all products"
      }`
    );
  } catch (error) {
    console.error("Error invalidating product caches:", error);
  }
};

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

    // Generate cache key based on query parameters
    const cacheKey = `products:list:${JSON.stringify({
      page,
      limit,
      search,
      category,
      gender,
      sortBy,
      sortOrder,
    })}`;

    // Try to get cached data first
    if (redisConfig.isRedisConnected()) {
      const cachedData = await redisConfig.get(cacheKey);
      if (cachedData) {
        console.log(`Cache HIT for products list: ${cacheKey}`);
        return res.json(cachedData);
      }
    }

    console.log(`Cache MISS for products list: ${cacheKey}`);

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

    const responseData = {
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    };

    // Cache the response for 15 minutes (900 seconds)
    if (redisConfig.isRedisConnected()) {
      await redisConfig.set(cacheKey, responseData, 900);
    }

    res.json(responseData);
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
      stock,
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
      stock,
      userId,
      userRole,
    });

    // Validate required fields
    if (
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0 ||
      stock === undefined ||
      stock === null ||
      stock < 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0), stock (harus >= 0)",
      });
    }

    // Check if catalogId already exists (only if catalogId is provided)
    if (catalogId && catalogId.trim() !== "") {
      const existingProduct = await prisma.product.findUnique({
        where: { catalogId },
      });

      if (existingProduct) {
        return res.status(400).json({
          message: "Produk dengan catalogId ini sudah ada",
        });
      }
    }

    // Generate unique slug
    const baseSlug = generateSlug(name);
    const slug = await generateUniqueSlug(baseSlug, async (slugToCheck) => {
      const existing = await prisma.product.findUnique({
        where: { slug: slugToCheck },
      });
      return !!existing;
    });

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
        slug,
        prodigyId: prodigyId || "",
        imageUrl: imageUrl || "",
        stock: parseInt(stock) || 0,
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

    // Invalidate product caches after successful creation
    await invalidateProductCaches();

    // Log cache invalidation
    logCacheInvalidation(product.id, "created");

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

// Get product by ID or slug
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Generate cache key
    const cacheKey = `product:detail:${id}`;

    // Try to get cached data first
    if (redisConfig.isRedisConnected()) {
      const cachedData = await redisConfig.get(cacheKey);
      if (cachedData) {
        console.log(`Cache HIT for product: ${cacheKey}`);
        return res.json(cachedData);
      }
    }

    console.log(`Cache MISS for product: ${cacheKey}`);

    // Check if the parameter is a slug (contains hyphens and no special characters) or ID
    const isSlug = /^[a-z0-9-]+$/.test(id) && id.includes("-");
    const whereClause = isSlug ? { slug: id } : { id };

    const product = await prisma.product.findUnique({
      where: whereClause,
      include: {
        skuData: true,
        genders: true,
        subCategories: true,
        images: {
          orderBy: { order: "asc" },
        },
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
      return res.status(400).json({
        success: false,
        message: "Product not found",
      });
    }

    // Transform data to match frontend expectations
    const transformedProduct = {
      ...product,
      genders: product.genders.map((g) => g.type),
      subCategory: product.subCategories.map((sc) => sc.name),
      images: product.images.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        altText: img.altText,
        order: img.order,
      })),
    };

    const responseData = {
      success: true,
      data: transformedProduct,
    };

    // Cache the response for 30 minutes (1800 seconds)
    if (redisConfig.isRedisConnected()) {
      await redisConfig.set(cacheKey, responseData, 1800);
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      error: error.message,
    });
  }
};

// Get product by ID for checkout (minimal data needed for payment)
const getProductForCheckout = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        currentPrice: true,
        fullPrice: true,
        imageUrl: true,
        isOnSale: true,
        brand: true,
        category: true,
        color: true,
        country: true,
        catalogId: true,
        cloudProductId: true,
        prodigyId: true,
        isNikeByYou: true,
        slug: true,
        stock: true,
        createdAt: true,
        updatedAt: true,
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
      return res.status(400).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch product for checkout",
      error: error.message,
    });
  }
};

// Create product with image URLs
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
      stock,
      genders,
      skuData,
      subCategories,
      images, // Array of image URLs from Cloudinary
    } = req.body;

    // Debug logging
    console.log("Product creation request data:", {
      catalogId,
      brand,
      category,
      name,
      currentPrice,
      fullPrice,
      stock,
      userId,
      userRole,
      hasImages: images ? images.length : 0,
    });

    // Validate required fields
    if (
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0 ||
      stock === undefined ||
      stock === null ||
      stock < 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0), stock (harus >= 0)",
      });
    }

    // Check if catalogId already exists (only if catalogId is provided)
    if (catalogId && catalogId.trim() !== "") {
      const existingProduct = await prisma.product.findUnique({
        where: { catalogId },
      });

      if (existingProduct) {
        return res.status(400).json({
          message: "Produk dengan catalogId ini sudah ada",
        });
      }
    }

    // Generate unique slug
    const baseSlug = generateSlug(name);
    const slug = await generateUniqueSlug(baseSlug, async (slugToCheck) => {
      const existing = await prisma.product.findUnique({
        where: { slug: slugToCheck },
      });
      return !!existing;
    });

    // Use provided imageUrl or first image from images array
    let finalImageUrl = imageUrl || "";
    if (!finalImageUrl && images && images.length > 0) {
      finalImageUrl = images[0].imageUrl;
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
        slug,
        prodigyId: prodigyId || "",
        imageUrl: finalImageUrl,
        stock: parseInt(stock) || 0,
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
        // Create multiple images with proper ordering
        images: {
          create:
            images?.map((img, index) => ({
              imageUrl: img.imageUrl,
              altText: img.altText || `${name} - Image ${index + 1}`,
              order: img.order || index,
            })) || [],
        },
      },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
        images: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Invalidate product caches after successful creation
    await invalidateProductCaches();

    res.status(201).json({
      message: "Produk berhasil ditambahkan",
      product: {
        ...product,
        genders: product.genders.map((g) => g.type),
        subCategory: product.subCategories.map((sc) => sc.name),
        images: product.images.map((img) => ({
          id: img.id,
          imageUrl: img.imageUrl,
          altText: img.altText,
          order: img.order,
        })),
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

// Update product by ID
const updateProduct = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin (this should already be checked by requireAdmin middleware)
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat mengupdate produk.",
      });
    }

    const { id } = req.params;
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
      stock,
      genders,
      skuData,
      subCategories,
      existingImages,
      deletedImages,
    } = req.body;

    // Debug logging
    console.log("Product update request data:", {
      id,
      catalogId,
      brand,
      category,
      name,
      currentPrice,
      fullPrice,
      stock,
      userId,
      userRole,
    });

    // Validate required fields
    if (
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0 ||
      stock === undefined ||
      stock === null ||
      stock < 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0), stock (harus >= 0)",
      });
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
      },
    });

    if (!existingProduct) {
      return res.status(400).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Check if catalogId is being changed and if new catalogId already exists
    if (
      catalogId !== existingProduct.catalogId &&
      catalogId &&
      catalogId.trim() !== ""
    ) {
      const catalogIdExists = await prisma.product.findUnique({
        where: { catalogId },
      });

      if (catalogIdExists) {
        return res.status(400).json({
          message: "Produk dengan catalogId ini sudah ada",
        });
      }
    }

    // Generate new slug if name is being changed
    let slug = existingProduct.slug;
    if (name !== existingProduct.name) {
      const baseSlug = generateSlug(name);
      slug = await generateUniqueSlug(baseSlug, async (slugToCheck) => {
        const existing = await prisma.product.findUnique({
          where: { slug: slugToCheck },
        });
        return !!existing;
      });
    }

    // Note: Image files are now stored in Cloudinary, no local file deletion needed

    // Handle existing image order update and deletion
    if (existingImages && existingImages.length > 0) {
      // Update existing images order
      for (const img of existingImages) {
        await prisma.productImage.update({
          where: { id: img.id },
          data: { order: img.order },
        });
      }
    }

    // Handle deleted images from database
    if (deletedImages && deletedImages.length > 0) {
      // Delete images from database that are in deletedImages list
      for (const imageUrl of deletedImages) {
        await prisma.productImage.deleteMany({
          where: {
            productId: id,
            imageUrl: imageUrl,
          },
        });
      }
    }

    // Update product with related data
    const updatedProduct = await prisma.product.update({
      where: { id },
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
        slug,
        prodigyId: prodigyId || "",
        imageUrl: imageUrl || existingProduct.imageUrl, // Keep existing image if not provided
        stock: parseInt(stock) || 0,
        userId: userId,
        // Update related data
        genders: {
          deleteMany: {}, // Delete all existing genders
          create:
            genders?.map((gender) => ({
              type: gender,
            })) || [],
        },
        skuData: {
          deleteMany: {}, // Delete all existing SKU data
          create:
            skuData?.map((sku) => ({
              size: sku.size,
              sku: sku.sku,
              gtin: sku.gtin,
            })) || [],
        },
        subCategories: {
          deleteMany: {}, // Delete all existing subcategories
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
        images: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Invalidate product caches after successful update
    await invalidateProductCaches(id);

    // Log cache invalidation
    logCacheInvalidation(updatedProduct.id, "updated");

    res.json({
      message: "Produk berhasil diupdate",
      product: {
        ...updatedProduct,
        genders: updatedProduct.genders.map((g) => g.type),
        subCategory: updatedProduct.subCategories.map((sc) => sc.name),
        images:
          updatedProduct.images?.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            altText: img.altText,
            order: img.order,
          })) || [],
      },
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      message: "Gagal mengupdate produk",
      error: error.message,
    });
  }
};

// Update product with image URLs
const updateProductWithImage = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin (this should already be checked by requireAdmin middleware)
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat mengupdate produk.",
      });
    }

    const { id } = req.params;

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
      stock,
      genders,
      skuData,
      subCategories,
      existingImages,
      deletedImages,
      images, // Array of new image URLs from Cloudinary
    } = req.body;

    // Debug logging
    console.log("Product update with image request data:", {
      id,
      catalogId,
      brand,
      category,
      name,
      currentPrice,
      fullPrice,
      stock,
      userId,
      userRole,
      hasNewImages: images ? images.length : 0,
    });

    // Validate required fields
    if (
      !brand ||
      !category ||
      !name ||
      currentPrice === undefined ||
      currentPrice === null ||
      currentPrice <= 0 ||
      fullPrice === undefined ||
      fullPrice === null ||
      fullPrice <= 0 ||
      stock === undefined ||
      stock === null ||
      stock < 0
    ) {
      return res.status(400).json({
        message:
          "Field yang wajib diisi: brand, category, name, currentPrice (harus > 0), fullPrice (harus > 0), stock (harus >= 0)",
      });
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
      },
    });

    if (!existingProduct) {
      return res.status(400).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Check if catalogId is being changed and if new catalogId already exists
    if (
      catalogId !== existingProduct.catalogId &&
      catalogId &&
      catalogId.trim() !== ""
    ) {
      const catalogIdExists = await prisma.product.findUnique({
        where: { catalogId },
      });

      if (catalogIdExists) {
        return res.status(400).json({
          message: "Produk dengan catalogId ini sudah ada",
        });
      }
    }

    // Generate new slug if name is being changed
    let slug = existingProduct.slug;
    if (name !== existingProduct.name) {
      const baseSlug = generateSlug(name);
      slug = await generateUniqueSlug(baseSlug, async (slugToCheck) => {
        const existing = await prisma.product.findUnique({
          where: { slug: slugToCheck },
        });
        return !!existing;
      });
    }

    // Determine main image URL - prioritize selected main image from frontend
    let finalImageUrl = existingProduct.imageUrl; // Keep existing by default
    if (imageUrl) {
      // Use the selected main image from frontend
      finalImageUrl = imageUrl;
    } else if (images && images.length > 0) {
      // Fallback to first new image if no main image selected
      finalImageUrl = images[0].imageUrl;
    }

    // Handle image management
    let imagesToCreate = [];

    if (images && images.length > 0) {
      // Get existing images to potentially delete
      const currentExistingImages = await prisma.productImage.findMany({
        where: { productId: id },
      });

      // If existingImages is provided, we need to preserve the order and only delete images not in the list
      if (existingImages && existingImages.length > 0) {
        // Get IDs of images that should be kept
        const keepImageIds = existingImages.map((img) => img.id);

        // Delete images that are not in the keep list
        for (const img of currentExistingImages) {
          if (!keepImageIds.includes(img.id)) {
            await prisma.productImage.delete({
              where: { id: img.id },
            });
          }
        }

        // Update order of existing images
        for (const img of existingImages) {
          await prisma.productImage.update({
            where: { id: img.id },
            data: { order: img.order },
          });
        }

        // Prepare new images to create with proper order (after existing images)
        const maxOrder = Math.max(
          ...existingImages.map((img) => img.order),
          -1
        );
        imagesToCreate = images.map((img, index) => ({
          imageUrl: img.imageUrl,
          altText: img.altText || `${name} - Image ${index + 1}`,
          order: maxOrder + 1 + index,
        }));
      } else {
        // If no existingImages provided, delete all existing images
        await prisma.productImage.deleteMany({
          where: { productId: id },
        });

        // Prepare new images to create
        imagesToCreate = images.map((img, index) => ({
          imageUrl: img.imageUrl,
          altText: img.altText || `${name} - Image ${index + 1}`,
          order: index,
        }));
      }
    } else if (existingImages && existingImages.length > 0) {
      // If no new images but existing images order is provided, just update the order
      for (const img of existingImages) {
        await prisma.productImage.update({
          where: { id: img.id },
          data: { order: img.order },
        });
      }
    }

    // Handle deleted images from database
    if (deletedImages && deletedImages.length > 0) {
      // Delete images from database that are in deletedImages list
      for (const imageUrl of deletedImages) {
        await prisma.productImage.deleteMany({
          where: {
            productId: id,
            imageUrl: imageUrl,
          },
        });
      }
    }

    // Update product with related data
    const updatedProduct = await prisma.product.update({
      where: { id },
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
        slug,
        prodigyId: prodigyId || "",
        imageUrl: finalImageUrl,
        stock: parseInt(stock) || 0,
        userId: userId,
        // Update related data
        genders: {
          deleteMany: {}, // Delete all existing genders
          create:
            genders?.map((gender) => ({
              type: gender,
            })) || [],
        },
        skuData: {
          deleteMany: {}, // Delete all existing SKU data
          create:
            skuData?.map((sku) => ({
              size: sku.size,
              sku: sku.sku,
              gtin: sku.gtin,
            })) || [],
        },
        subCategories: {
          deleteMany: {}, // Delete all existing subcategories
          create:
            subCategories?.map((subCat) => ({
              name: subCat,
            })) || [],
        },
        // Create new images if provided
        ...(imagesToCreate.length > 0 && {
          images: {
            create: imagesToCreate,
          },
        }),
      },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
        images: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Invalidate product caches after successful update
    await invalidateProductCaches(id);

    // Log cache invalidation
    logCacheInvalidation(updatedProduct.id, "updated");

    res.json({
      message: "Produk berhasil diupdate",
      product: {
        ...updatedProduct,
        genders: updatedProduct.genders.map((g) => g.type),
        subCategory: updatedProduct.subCategories.map((sc) => sc.name),
        images:
          updatedProduct.images?.map((img) => ({
            id: img.id,
            imageUrl: img.imageUrl,
            altText: img.altText,
            order: img.order,
          })) || [],
      },
    });
  } catch (error) {
    console.error("Error updating product with image:", error);
    res.status(500).json({
      message: "Gagal mengupdate produk",
      error: error.message,
    });
  }
};

// Delete product by ID
const deleteProduct = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin (this should already be checked by requireAdmin middleware)
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat menghapus produk.",
      });
    }

    const { id } = req.params;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        genders: true,
        skuData: true,
        subCategories: true,
      },
    });

    if (!existingProduct) {
      return res.status(400).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Note: Image files are now stored in Cloudinary, no local file deletion needed

    // Delete product (related data will be deleted automatically due to cascade)
    await prisma.product.delete({
      where: { id },
    });

    // Invalidate product caches after successful deletion
    await invalidateProductCaches(id);

    // Log cache invalidation
    logCacheInvalidation(id, "deleted");

    res.json({
      message: "Produk berhasil dihapus",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      message: "Gagal menghapus produk",
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
  getProductForCheckout,
  updateProduct,
  updateProductWithImage,
  deleteProduct,
};
