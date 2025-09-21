const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Get all shipped orders for admin (simple version without Redis)
const getAllShippedOrders = async (req, res) => {
  try {
    // Get user info from JWT token (set by authenticateToken middleware)
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if user is admin
    if (userRole !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admin can view all shipped orders.",
      });
    }

    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const status = req.query.status || "";

    // Calculate offset
    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (status && status !== "") {
      where.status = status;
    }

    if (search && search !== "") {
      where.OR = [
        { orderId: { contains: search, mode: "insensitive" } },
        { trackingNumber: { contains: search, mode: "insensitive" } },
        { recipientName: { contains: search, mode: "insensitive" } },
        { recipientPhone: { contains: search, mode: "insensitive" } },
        { courier: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get total count for pagination
    const totalCount = await prisma.shipped.count({ where });

    // Get shipped orders with pagination
    const shippedOrders = await prisma.shipped.findMany({
      where,
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
        notes: true,
        returnReason: true,
        returnAt: true,
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
        product: {
          select: {
            id: true,
            name: true,
            currentPrice: true,
            imageUrl: true,
            brand: true,
            category: true,
          },
        },
        payment: {
          select: {
            id: true,
            orderId: true,
            amount: true,
            adminFee: true,
            totalAmount: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const responseData = {
      success: true,
      data: shippedOrders,
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
    console.error("Error fetching admin shipped orders:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shipped orders",
      error: error.message,
    });
  }
};

// Get shipped order by orderId for public access
const getShippedByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get shipped order with related data
    const shippedOrder = await prisma.shipped.findUnique({
      where: { orderId: orderId },
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
        notes: true,
        returnReason: true,
        returnAt: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            currentPrice: true,
            imageUrl: true,
            brand: true,
            category: true,
          },
        },
        payment: {
          select: {
            id: true,
            orderId: true,
            amount: true,
            adminFee: true,
            totalAmount: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!shippedOrder) {
      return res.status(404).json({
        success: false,
        message: "Shipped order not found",
      });
    }

    res.json({
      success: true,
      data: shippedOrder,
    });
  } catch (error) {
    console.error("Error fetching shipped order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch shipped order",
      error: error.message,
    });
  }
};

module.exports = {
  getAllShippedOrders,
  getShippedByOrderId,
};
