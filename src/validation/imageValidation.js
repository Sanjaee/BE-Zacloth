const { z } = require("zod");

// Image validation schema
const imageValidationSchema = z.object({
  // File validation
  file: z
    .object({
      fieldname: z.string(),
      originalname: z.string(),
      encoding: z.string(),
      mimetype: z.string().refine(
        (mimetype) => {
          const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
          ];
          return allowedTypes.includes(mimetype);
        },
        {
          message: "Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed",
        }
      ),
      size: z.number().max(3 * 1024 * 1024, {
        message: "File size must not exceed 3MB",
      }),
      destination: z.string(),
      filename: z.string(),
      path: z.string(),
      buffer: z.any().optional(),
    })
    .optional(),

  // Form data validation
  data: z.string().optional(),
});

// Product data validation schema
const productDataSchema = z.object({
  isOnSale: z.boolean().optional(),
  isNikeByYou: z.boolean().optional(),
  catalogId: z.string().trim().min(1, "Catalog ID is required"),
  brand: z.string().trim().min(1, "Brand is required"),
  category: z.string().trim().min(1, "Category is required"),
  cloudProductId: z.string().optional(),
  color: z.string().optional(),
  country: z.string().optional(),
  currentPrice: z.number().min(0, "Current price must be non-negative"),
  fullPrice: z.number().min(0, "Full price must be non-negative"),
  name: z.string().trim().min(1, "Product name is required"),
  prodigyId: z.string().optional(),
  imageUrl: z.string().optional(),
  genders: z.array(z.string()).optional(),
  skuData: z
    .array(
      z.object({
        size: z.string(),
        sku: z.string(),
        gtin: z.string(),
      })
    )
    .optional(),
  subCategories: z.array(z.string()).optional(),
});

// Validation middleware for image upload
const validateImageUpload = (req, res, next) => {
  try {
    // Validate file if present
    if (req.file) {
      const fileValidation = z.object({
        fieldname: z.string(),
        originalname: z.string(),
        encoding: z.string(),
        mimetype: z.string().refine(
          (mimetype) => {
            const allowedTypes = [
              "image/jpeg",
              "image/jpg",
              "image/png",
              "image/gif",
              "image/webp",
            ];
            return allowedTypes.includes(mimetype);
          },
          {
            message: "Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed",
          }
        ),
        size: z.number().max(3 * 1024 * 1024, {
          message: "File size must not exceed 3MB",
        }),
        destination: z.string(),
        filename: z.string(),
        path: z.string(),
        buffer: z.any().optional(),
      });

      const fileValidationResult = fileValidation.safeParse(req.file);

      if (!fileValidationResult.success) {
        const errors = fileValidationResult.error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: "File validation failed",
          errors: errors,
        });
      }
    }

    // If there's form data, validate it too
    if (req.body.data) {
      console.log("Validation middleware - Raw data:", req.body.data);
      try {
        const productData = JSON.parse(req.body.data);
        console.log("Validation middleware - Parsed data:", productData);
        const productValidation = productDataSchema.safeParse(productData);

        if (!productValidation.success) {
          console.log(
            "Validation middleware - Validation failed:",
            productValidation.error.errors
          );
          const errors = productValidation.error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
            received: err.input,
          }));

          return res.status(400).json({
            success: false,
            message: "Product data validation failed",
            errors: errors,
            receivedData: productData,
          });
        }
        console.log("Validation middleware - Validation passed");
      } catch (parseError) {
        console.error("Validation middleware - Parse error:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in form data",
          error: parseError.message,
        });
      }
    }

    next();
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({
      success: false,
      message: "Validation error",
      error: error.message,
    });
  }
};

// Validation middleware for product data only
const validateProductData = (req, res, next) => {
  try {
    const validationResult = productDataSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Product data validation failed",
        errors: errors,
      });
    }

    next();
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({
      success: false,
      message: "Validation error",
      error: error.message,
    });
  }
};

module.exports = {
  imageValidationSchema,
  productDataSchema,
  validateImageUpload,
  validateProductData,
};
