const { PrismaClient } = require("@prisma/client");
const { uploadImage } = require("./imageController");
const { generateSlug, generateUniqueSlug } = require("../utils/slugGenerator");

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
      return res.status(404).json({
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

    res.json({
      success: true,
      data: transformedProduct,
    });
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
      return res.status(404).json({
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

// Create product with multiple images upload
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
      console.log("Raw data received:", req.body.data);
      try {
        productData = JSON.parse(req.body.data);
        console.log("Parsed product data:", productData);
      } catch (parseError) {
        console.error("Error parsing product data:", parseError);
        console.error("Raw data that failed to parse:", req.body.data);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in form data",
          error: parseError.message,
        });
      }
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
      hasImages: req.files ? req.files.length : 0,
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

    // Generate unique slug
    const baseSlug = generateSlug(name);
    const slug = await generateUniqueSlug(baseSlug, async (slugToCheck) => {
      const existing = await prisma.product.findUnique({
        where: { slug: slugToCheck },
      });
      return !!existing;
    });

    // Determine main image URL - use first uploaded image if available, otherwise use provided URL
    let finalImageUrl = imageUrl || "";
    if (req.files && req.files.length > 0) {
      finalImageUrl = `/assets/${req.files[0].filename}`;
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
            req.files?.map((file, index) => ({
              imageUrl: `/assets/${file.filename}`,
              altText: `${name} - Image ${index + 1}`,
              order: index, // Order based on array position
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
      return res.status(404).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Check if catalogId is being changed and if new catalogId already exists
    if (catalogId !== existingProduct.catalogId) {
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

    // Handle deleted images - delete files from assets folder
    if (deletedImages && deletedImages.length > 0) {
      const fs = require("fs");
      const path = require("path");

      for (const imageUrl of deletedImages) {
        if (imageUrl && imageUrl.startsWith("/assets/")) {
          const filename = path.basename(imageUrl);
          const filePath = path.join(__dirname, "../../assets", filename);

          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log("Deleted image file:", filePath);
            }
          } catch (error) {
            console.error("Error deleting image file:", filePath, error);
          }
        }
      }
    }

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

// Update product with image upload
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
      imageUrl,
      genders,
      skuData,
      subCategories,
      existingImages,
      deletedImages,
    } = productData;

    // Debug logging
    console.log("Product update with image request data:", {
      id,
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
      return res.status(404).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Check if catalogId is being changed and if new catalogId already exists
    if (catalogId !== existingProduct.catalogId) {
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
    } else if (req.files && req.files.length > 0) {
      // Fallback to first uploaded image if no main image selected
      finalImageUrl = `/assets/${req.files[0].filename}`;
    }

    // Handle deleted images - delete files from assets folder
    if (deletedImages && deletedImages.length > 0) {
      const fs = require("fs");
      const path = require("path");

      for (const imageUrl of deletedImages) {
        if (imageUrl && imageUrl.startsWith("/assets/")) {
          const filename = path.basename(imageUrl);
          const filePath = path.join(__dirname, "../../assets", filename);

          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log("Deleted image file:", filePath);
            }
          } catch (error) {
            console.error("Error deleting image file:", filePath, error);
          }
        }
      }
    }

    // Handle image management - we'll update images separately after product update
    let imagesToCreate = [];

    if (req.files && req.files.length > 0) {
      // If new images are uploaded, we need to handle existing images
      const fs = require("fs");
      const path = require("path");

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
            // Only delete file if it's not already in deletedImages (to avoid double deletion)
            if (
              img.imageUrl &&
              img.imageUrl.startsWith("/assets/") &&
              (!deletedImages || !deletedImages.includes(img.imageUrl))
            ) {
              const oldImagePath = path.join(
                __dirname,
                "../../assets",
                path.basename(img.imageUrl)
              );
              if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
              }
            }
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
        imagesToCreate = req.files.map((file, index) => ({
          imageUrl: `/assets/${file.filename}`,
          altText: `${name} - Image ${index + 1}`,
          order: maxOrder + 1 + index,
        }));
      } else {
        // If no existingImages provided, delete all existing images (old behavior)
        for (const img of currentExistingImages) {
          if (img.imageUrl && img.imageUrl.startsWith("/assets/")) {
            const oldImagePath = path.join(
              __dirname,
              "../../assets",
              path.basename(img.imageUrl)
            );
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
            }
          }
        }

        // Delete old image records
        await prisma.productImage.deleteMany({
          where: { productId: id },
        });

        // Prepare new images to create
        imagesToCreate = req.files.map((file, index) => ({
          imageUrl: `/assets/${file.filename}`,
          altText: `${name} - Image ${index + 1}`,
          order: index,
        }));
      }
    } else if (existingImages && existingImages.length > 0) {
      // If no new files but existing images order is provided, just update the order
      for (const img of existingImages) {
        await prisma.productImage.update({
          where: { id: img.id },
          data: { order: img.order },
        });
      }
    }

    // Handle deleted images from database when no new files are uploaded
    if (
      deletedImages &&
      deletedImages.length > 0 &&
      (!req.files || req.files.length === 0)
    ) {
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
        // Create new images if files are uploaded
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
      return res.status(404).json({
        message: "Produk tidak ditemukan",
      });
    }

    // Delete associated image file if it exists and is not a URL
    if (
      existingProduct.imageUrl &&
      existingProduct.imageUrl.startsWith("/assets/")
    ) {
      const fs = require("fs");
      const path = require("path");
      const imagePath = path.join(
        __dirname,
        "../../assets",
        path.basename(existingProduct.imageUrl)
      );
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log("Deleted image file:", imagePath);
      }
    }

    // Delete product (related data will be deleted automatically due to cascade)
    await prisma.product.delete({
      where: { id },
    });

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
