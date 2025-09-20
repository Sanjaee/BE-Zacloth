require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class UnifiedPaymentController {
  // Create payment - unified for both Midtrans and Plisio
  static async createProductPayment(req, res) {
    try {
      const userId = req.user.id;
      const {
        productId,
        addressId,
        origin,
        destination,
        weight,
        courier,
        service,
        productPrice,
        shippingCost,
        adminFee,
        totalAmount,
        paymentMethod = "bank_transfer",
        bank,
        currency, // For crypto payments
      } = req.body;

      // Validation
      const missingParams = [];
      if (!productId) missingParams.push("productId");
      if (!addressId) missingParams.push("addressId");
      if (!origin) missingParams.push("origin");
      if (!destination) missingParams.push("destination");
      if (!weight) missingParams.push("weight");
      if (!courier) missingParams.push("courier");
      if (!service) missingParams.push("service");
      if (productPrice === undefined || productPrice === null)
        missingParams.push("productPrice");
      if (shippingCost === undefined || shippingCost === null)
        missingParams.push("shippingCost");
      if (adminFee === undefined || adminFee === null)
        missingParams.push("adminFee");
      if (totalAmount === undefined || totalAmount === null)
        missingParams.push("totalAmount");

      if (missingParams.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missingParams.join(", ")}`,
        });
      }

      // Get user and product data
      const [user, product, address] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.product.findUnique({ where: { id: productId } }),
        prisma.userAddress.findUnique({ where: { id: addressId } }),
      ]);

      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }
      if (!product) {
        return res
          .status(400)
          .json({ success: false, message: "Product not found" });
      }
      if (!address) {
        return res
          .status(400)
          .json({ success: false, message: "Address not found" });
      }

      const orderId = `Order_${Date.now()}`;

      // Handle crypto payment with Plisio
      if (paymentMethod === "crypto") {
        const PlisioController = require("./plisioController");

        // Create a mock request object for PlisioController
        const mockReq = {
          user: { id: userId },
          body: {
            productId,
            addressId,
            origin,
            destination,
            weight,
            courier,
            service,
            productPrice,
            shippingCost,
            adminFee,
            totalAmount,
            currency: currency || "BTC",
          },
        };

        // Call PlisioController.createProductPayment
        return PlisioController.createProductPayment(mockReq, res);
      }

      // Handle traditional payment methods with Midtrans
      const MidtransController = require("./midtransController");

      // Create a mock request object for MidtransController
      const mockReq = {
        user: { id: userId },
        body: {
          productId,
          addressId,
          origin,
          destination,
          weight,
          courier,
          service,
          productPrice,
          shippingCost,
          adminFee,
          totalAmount,
          paymentMethod,
          bank,
        },
      };

      // Call MidtransController.createProductPayment
      return MidtransController.createProductPayment(mockReq, res);
    } catch (error) {
      console.error("Create product payment error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Get payment status by orderId - unified for both Midtrans and Plisio
  static async getPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { orderId: orderId },
        include: {
          user: true,
          product: true,
          shipments: true,
        },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // If it's a Plisio payment, get status from Plisio API
      if (payment.paymentType === "plisio" && payment.midtransTransactionId) {
        try {
          const axios = require("axios");
          const PLISIO_API_KEY =
            "eB_tpJ0APoZFakdp7HIH-drEhVjGwBNCMi-VaDxMtUulbgDsDDtUS86Hu7BkjzBG";
          const PLISIO_BASE_URL = "https://api.plisio.net/api/v1";

          const response = await axios.get(`${PLISIO_BASE_URL}/operations`, {
            params: {
              api_key: PLISIO_API_KEY,
              txn_id: payment.midtransTransactionId,
            },
          });

          const result = response.data;

          if (result.status === "success" && result.data.length > 0) {
            const plisioData = result.data[0];

            // Map Plisio status to our system
            const mapPlisioStatusToPrisma = (status) => {
              switch (status) {
                case "pending":
                  return "PENDING";
                case "completed":
                  return "SUCCESS";
                case "cancelled":
                  return "CANCELLED";
                case "expired":
                  return "EXPIRED";
                case "failed":
                  return "FAILED";
                default:
                  return "PENDING";
              }
            };

            const mappedStatus = mapPlisioStatusToPrisma(plisioData.status);

            // Update payment status
            let paymentUpdate = {
              status: mappedStatus,
              transactionStatus: plisioData.status,
              midtransResponse: JSON.stringify(plisioData),
              updatedAt: new Date(),
            };

            if (plisioData.paid_at) {
              paymentUpdate.paidAt = new Date(plisioData.paid_at * 1000);
            }

            const updatedPayment = await prisma.payment.update({
              where: { orderId: orderId },
              data: paymentUpdate,
              include: { user: true, product: true, shipments: true },
            });

            return res.json({
              success: true,
              data: {
                ...updatedPayment,
                status: plisioData.status,
                plisioData: plisioData,
              },
            });
          }
        } catch (error) {
          console.error("Error fetching from Plisio API:", error);
        }
      }

      // For Midtrans payments or if Plisio API fails, return current payment status
      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      console.error("Get payment status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Get pending payment by user - unified for both Midtrans and Plisio
  static async getPendingPaymentByUser(req, res) {
    try {
      const userId = req.user.id;

      const pendingPayment = await prisma.payment.findFirst({
        where: {
          userId,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderId: true,
          userId: true,
          amount: true,
          adminFee: true,
          totalAmount: true,
          paymentMethod: true,
          paymentType: true,
          snapRedirectUrl: true,
          midtransResponse: true,
          midtransAction: true,
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
              imageUrl: true,
              currentPrice: true,
              fullPrice: true,
            },
          },
        },
      });

      if (pendingPayment) {
        // Parse midtransResponse if it exists
        let parsedResponse = null;
        if (pendingPayment.midtransResponse) {
          try {
            parsedResponse = JSON.parse(pendingPayment.midtransResponse);
          } catch (e) {
            console.error("Error parsing midtransResponse:", e);
          }
        }

        // Parse midtransResponse for transaction details (for Plisio)
        let transactionDetails = null;
        if (parsedResponse && pendingPayment.paymentType === "plisio") {
          transactionDetails = parsedResponse;
        }

        // Parse midtransAction if it exists
        let parsedAction = null;
        if (pendingPayment.midtransAction) {
          try {
            parsedAction = JSON.parse(pendingPayment.midtransAction);
          } catch (e) {
            console.error("Error parsing midtransAction:", e);
          }
        }

        return res.json({
          success: true,
          data: {
            ...pendingPayment,
            midtransResponse: parsedResponse,
            transactionDetails: transactionDetails,
            midtransAction: parsedAction,
          },
        });
      }

      return res.json({ success: true, data: null });
    } catch (err) {
      console.error("Error in getPendingPaymentByUser:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }

  // Cancel payment - unified for both Midtrans and Plisio
  static async cancelPayment(req, res) {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;

      // Find the pending payment for this user and order
      const payment = await prisma.payment.findFirst({
        where: {
          orderId,
          userId,
          status: "PENDING",
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!payment) {
        return res.status(400).json({
          success: false,
          error: "No pending payment found for this order",
        });
      }

      // Handle different payment types
      if (payment.paymentType === "plisio") {
        // For Plisio payments, just update status to CANCELLED
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "CANCELLED" },
        });

        return res.json({
          success: true,
          message: "Plisio payment cancelled successfully",
          action: "cancelled",
        });
      } else if (payment.paymentType === "midtrans") {
        // For Midtrans payments, delete the payment record entirely
        await prisma.payment.delete({
          where: { id: payment.id },
        });

        return res.json({
          success: true,
          message: "Midtrans payment removed successfully",
          action: "deleted",
        });
      } else {
        // For unknown payment types, just update status
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "CANCELLED" },
        });

        return res.json({
          success: true,
          message: "Payment cancelled successfully",
          action: "cancelled",
        });
      }
    } catch (err) {
      console.error("Error in cancelPayment:", err);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }

  // Get all payments for user - unified
  static async getUserPayments(req, res) {
    try {
      const { userId } = req.params;

      const payments = await prisma.payment.findMany({
        where: { userId: userId },
        include: {
          product: {
            select: {
              name: true,
              imageUrl: true,
              currentPrice: true,
            },
          },
          shipments: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      console.error("Get user payments error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = UnifiedPaymentController;
