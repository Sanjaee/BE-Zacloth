const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Get user's purchased products
const getUserPurchases = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;

    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || ""; // payment status filter
    const shippedStatus = req.query.shippedStatus || ""; // shipped status filter

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build where clause for payments
    const paymentWhere = {
      userId: userId,
    };

    if (status && status !== "") {
      paymentWhere.status = status;
    }

    // Get total count for pagination
    const totalCount = await prisma.payment.count({ where: paymentWhere });

    // Get user's payments with related data
    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        orderId: true,
        amount: true,
        adminFee: true,
        totalAmount: true,
        paymentMethod: true,
        paymentType: true,
        status: true,
        notes: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            currentPrice: true,
            fullPrice: true,
            imageUrl: true,
            slug: true,
            isOnSale: true,
            color: true,
            images: {
              select: {
                id: true,
                imageUrl: true,
                altText: true,
                order: true,
              },
              orderBy: { order: "asc" },
            },
          },
        },
        shipped: {
          select: {
            id: true,
            orderId: true,
            trackingNumber: true,
            courier: true,
            service: true,
            status: true,
            shippedAt: true,
            deliveredAt: true,
            estimatedDelivery: true,
            recipientName: true,
            recipientPhone: true,
            deliveryAddress: true,
            userNotes: true,
            shippingNotes: true,
            returnReason: true,
            returnAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        shipments: {
          select: {
            id: true,
            courier: true,
            service: true,
            description: true,
            weight: true,
            cost: true,
            etd: true,
            note: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });

    // Filter by shipped status if provided
    let filteredPayments = payments;
    if (shippedStatus && shippedStatus !== "") {
      filteredPayments = payments.filter((payment) => {
        if (!payment.shipped) return shippedStatus === "NOT_SHIPPED";
        return payment.shipped.status === shippedStatus;
      });
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const responseData = {
      success: true,
      data: filteredPayments,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching user purchases:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user purchases",
      error: error.message,
    });
  }
};

// Get single purchase by order ID
const getPurchaseByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get payment with related data
    const payment = await prisma.payment.findFirst({
      where: {
        orderId: orderId,
        userId: userId, // Ensure user can only access their own orders
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        adminFee: true,
        totalAmount: true,
        paymentMethod: true,
        paymentType: true,
        status: true,
        notes: true,
        snapRedirectUrl: true,
        midtransTransactionId: true,
        transactionStatus: true,
        fraudStatus: true,
        paymentCode: true,
        vaNumber: true,
        bankType: true,
        expiryTime: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
            currentPrice: true,
            fullPrice: true,
            imageUrl: true,
            slug: true,
            isOnSale: true,
            color: true,
            country: true,
            images: {
              select: {
                id: true,
                imageUrl: true,
                altText: true,
                order: true,
              },
              orderBy: { order: "asc" },
            },
            skuData: {
              select: {
                id: true,
                size: true,
                sku: true,
                gtin: true,
              },
            },
            genders: {
              select: {
                id: true,
                type: true,
              },
            },
            subCategories: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        shipped: {
          select: {
            id: true,
            orderId: true,
            trackingNumber: true,
            courier: true,
            service: true,
            status: true,
            shippedAt: true,
            deliveredAt: true,
            estimatedDelivery: true,
            recipientName: true,
            recipientPhone: true,
            deliveryAddress: true,
            userNotes: true,
            shippingNotes: true,
            returnReason: true,
            returnAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        shipments: {
          select: {
            id: true,
            courier: true,
            service: true,
            description: true,
            weight: true,
            cost: true,
            etd: true,
            note: true,
            address: {
              select: {
                id: true,
                recipientName: true,
                phoneNumber: true,
                provinceName: true,
                cityName: true,
                subdistrictName: true,
                postalCode: true,
                addressDetail: true,
              },
            },
            createdAt: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found or access denied",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Error fetching purchase by order ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase",
      error: error.message,
    });
  }
};

// Get purchase statistics for user
const getUserPurchaseStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get basic stats
    const totalPurchases = await prisma.payment.count({
      where: { userId: userId },
    });

    const totalSpent = await prisma.payment.aggregate({
      where: {
        userId: userId,
        status: "SUCCESS",
      },
      _sum: {
        totalAmount: true,
      },
    });

    const successfulPurchases = await prisma.payment.count({
      where: {
        userId: userId,
        status: "SUCCESS",
      },
    });

    const pendingPurchases = await prisma.payment.count({
      where: {
        userId: userId,
        status: "PENDING",
      },
    });

    const failedPurchases = await prisma.payment.count({
      where: {
        userId: userId,
        status: "FAILED",
      },
    });

    // Get shipped status stats
    const shippedStats = await prisma.shipped.groupBy({
      by: ["status"],
      where: {
        userId: userId,
      },
      _count: {
        status: true,
      },
    });

    const stats = {
      totalPurchases,
      totalSpent: totalSpent._sum.totalAmount || 0,
      successfulPurchases,
      pendingPurchases,
      failedPurchases,
      shippedStats: shippedStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching user purchase stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase statistics",
      error: error.message,
    });
  }
};

module.exports = {
  getUserPurchases,
  getPurchaseByOrderId,
  getUserPurchaseStats,
};
