const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Track visitor
const trackVisitor = async (req, res) => {
  try {
    const { page, userAgent, referrer } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Create visitor record
    const visitor = await prisma.visitor.create({
      data: {
        page: page || "/",
        userAgent: userAgent || "",
        referrer: referrer || "",
        ip: ip,
        visitedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Visitor tracked successfully",
      visitor: {
        id: visitor.id,
        page: visitor.page,
        visitedAt: visitor.visitedAt,
      },
    });
  } catch (error) {
    console.error("Error tracking visitor:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track visitor",
      error: error.message,
    });
  }
};

// Get visitor statistics
const getVisitorStats = async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get total visitors
    const totalVisitors = await prisma.visitor.count({
      where: {
        visitedAt: {
          gte: startDate,
        },
      },
    });

    // Get unique visitors (by IP)
    const uniqueVisitors = await prisma.visitor.groupBy({
      by: ["ip"],
      where: {
        visitedAt: {
          gte: startDate,
        },
      },
    });

    // Get visitors by day for chart
    const visitorsByDay = await prisma.visitor.groupBy({
      by: ["visitedAt"],
      where: {
        visitedAt: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        visitedAt: "asc",
      },
    });

    // Get new customers (users created in period)
    const newCustomers = await prisma.user.count({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    });

    // Get previous period for comparison
    const previousStartDate = new Date(startDate);
    const previousEndDate = new Date(startDate);
    previousStartDate.setDate(
      startDate.getDate() - (now.getDate() - startDate.getDate())
    );

    const previousVisitors = await prisma.visitor.count({
      where: {
        visitedAt: {
          gte: previousStartDate,
          lt: previousEndDate,
        },
      },
    });

    const previousNewCustomers = await prisma.user.count({
      where: {
        createdAt: {
          gte: previousStartDate,
          lt: previousEndDate,
        },
      },
    });

    // Calculate growth percentages
    const visitorGrowth =
      previousVisitors > 0
        ? (
            ((totalVisitors - previousVisitors) / previousVisitors) *
            100
          ).toFixed(1)
        : 0;

    const customerGrowth =
      previousNewCustomers > 0
        ? (
            ((newCustomers - previousNewCustomers) / previousNewCustomers) *
            100
          ).toFixed(1)
        : 0;

    // Format chart data
    const chartData = visitorsByDay.map((item) => ({
      date: item.visitedAt.toISOString().split("T")[0],
      visitors: item._count.id,
    }));

    res.json({
      success: true,
      stats: {
        totalVisitors,
        uniqueVisitors: uniqueVisitors.length,
        newCustomers,
        visitorGrowth: parseFloat(visitorGrowth),
        customerGrowth: parseFloat(customerGrowth),
        chartData,
        period,
      },
    });
  } catch (error) {
    console.error("Error fetching visitor stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visitor statistics",
      error: error.message,
    });
  }
};

module.exports = {
  trackVisitor,
  getVisitorStats,
};
