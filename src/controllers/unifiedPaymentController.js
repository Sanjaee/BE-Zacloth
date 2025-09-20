require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class UnifiedPaymentController {
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
