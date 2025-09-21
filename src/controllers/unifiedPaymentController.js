require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const crypto = require("crypto");

const prisma = new PrismaClient();

// Konfigurasi Midtrans
const MIDTRANS_SERVER_KEY = "SB-Mid-server-4zIt7djwCeRdMpgF4gXDjciC";
const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com/v2";

// Helper: Map Midtrans status to Prisma enum
function mapMidtransStatusToPrisma(status) {
  switch (status) {
    case "pending":
      return "PENDING";
    case "settlement":
      return "SUCCESS";
    case "capture":
      return "SUCCESS";
    case "deny":
      return "FAILED";
    case "cancel":
      return "CANCELLED";
    case "expire":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

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
        return res.status(404).json({ error: "Payment not found" });
      }
      // Get status from Midtrans
      const auth = Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64");
      const response = await axios.get(
        `${MIDTRANS_BASE_URL}/${orderId}/status`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );
      const result = response.data;
      // Extract additional fields from Midtrans response
      let paymentUpdate = {
        status: mapMidtransStatusToPrisma(result.transaction_status),
        transactionStatus: result.transaction_status,
        fraudStatus: result.fraud_status || null,
        midtransResponse: JSON.stringify(result),
      };
      if (
        result.va_numbers &&
        Array.isArray(result.va_numbers) &&
        result.va_numbers.length > 0
      ) {
        paymentUpdate.vaNumber = result.va_numbers[0].va_number;
        paymentUpdate.bankType = result.va_numbers[0].bank;
      }
      if (result.permata_va_number) {
        paymentUpdate.vaNumber = result.permata_va_number;
        paymentUpdate.bankType = "permata";
      }
      if (result.payment_code) paymentUpdate.paymentCode = result.payment_code;
      if (result.expiry_time)
        paymentUpdate.expiryTime = new Date(result.expiry_time);
      if (result.paid_at) {
        paymentUpdate.paidAt = new Date(result.paid_at);
      } else if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        !payment.paidAt
      ) {
        // If payment is successful but no paid_at from Midtrans, set it to current time
        paymentUpdate.paidAt = new Date();
      }
      // QRIS/GoPay
      if (result.actions && Array.isArray(result.actions)) {
        const qrAction = result.actions.find(
          (a) => a.name === "generate-qr-code"
        );
        if (qrAction && qrAction.url)
          paymentUpdate.snapRedirectUrl = qrAction.url;
      }
      // If payment is successful, send notification and create shipped record
      if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        payment.userId
      ) {
        // Log payment success
        console.log(
          `Payment success for order ${payment.orderId}, user ${payment.userId}, amount: ${payment.amount}`
        );

        // Create shipped record if it doesn't exist
        try {
          const existingShipped = await prisma.shipped.findUnique({
            where: { orderId: payment.orderId },
          });

          if (!existingShipped) {
            // Get user address from payment data or use default
            const userAddress = await prisma.userAddress.findFirst({
              where: { userId: payment.userId, isPrimary: true },
            });

            if (userAddress) {
              await prisma.shipped.create({
                data: {
                  orderId: payment.orderId,
                  paymentId: payment.id,
                  userId: payment.userId,
                  productId: payment.productId,
                  recipientName: userAddress.recipientName,
                  recipientPhone: userAddress.phoneNumber,
                  deliveryAddress: `${userAddress.addressDetail}, ${userAddress.cityName}, ${userAddress.provinceName} ${userAddress.postalCode}`,
                  status: "SHIPPED",
                  shippedAt: new Date(),
                },
              });
              console.log(
                `Created shipped record for order ${payment.orderId}`
              );
            }
          }
        } catch (shippedError) {
          console.error("Error creating shipped record:", shippedError);
        }

        // Kirim email ke admin
        try {
          const { sendAdminPaymentSuccessEmail } = require("../utils/email");
          await sendAdminPaymentSuccessEmail({
            to: "afrizaahmad18@gmail.com",
            type: "product",
            username: payment.user?.username || "User",
            email: payment.user?.email || "No email",
            amount: payment.amount,
            orderId: payment.orderId,
          });
        } catch (err) {
          console.error("Gagal mengirim email ke admin:", err);
        }
      }
      const updatedPayment = await prisma.payment.update({
        where: { orderId: orderId },
        data: paymentUpdate,
        include: { user: true, product: true, shipments: true },
      });
      res.json({
        success: true,
        data: {
          ...updatedPayment,
          status: result.transaction_status,
          fraudStatus: result.fraud_status,
        },
      });
    } catch (error) {
      console.error("Get payment status error:", error);
      res.status(500).json({ error: "Internal server error" });
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

  // Midtrans callback handler
  static async midtransCallback(req, res) {
    try {
      const { order_id, status_code, gross_amount, signature_key } = req.body;

      console.log("Midtrans callback received:", {
        order_id,
        status_code,
        gross_amount,
        signature_key,
      });

      // Verify signature
      const expectedSignature = crypto
        .createHash("sha512")
        .update(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
        .digest("hex");

      if (signature_key !== expectedSignature) {
        console.error("Invalid signature in Midtrans callback");
        return res.status(400).json({ error: "Invalid signature" });
      }

      // Find payment by order_id
      const payment = await prisma.payment.findUnique({
        where: { orderId: order_id },
        include: { user: true, product: true, shipments: true },
      });

      if (!payment) {
        console.error("Payment not found for order_id:", order_id);
        return res.status(404).json({ error: "Payment not found" });
      }

      // Get detailed status from Midtrans API
      const auth = Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64");
      const response = await axios.get(
        `${MIDTRANS_BASE_URL}/${order_id}/status`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );

      const result = response.data;

      // Update payment status
      let paymentUpdate = {
        status: mapMidtransStatusToPrisma(result.transaction_status),
        transactionStatus: result.transaction_status,
        fraudStatus: result.fraud_status || null,
        midtransResponse: JSON.stringify(result),
      };

      if (
        result.va_numbers &&
        Array.isArray(result.va_numbers) &&
        result.va_numbers.length > 0
      ) {
        paymentUpdate.vaNumber = result.va_numbers[0].va_number;
        paymentUpdate.bankType = result.va_numbers[0].bank;
      }

      if (result.permata_va_number) {
        paymentUpdate.vaNumber = result.permata_va_number;
        paymentUpdate.bankType = "permata";
      }

      if (result.payment_code) paymentUpdate.paymentCode = result.payment_code;
      if (result.expiry_time)
        paymentUpdate.expiryTime = new Date(result.expiry_time);
      if (result.paid_at) {
        paymentUpdate.paidAt = new Date(result.paid_at);
      } else if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        !payment.paidAt
      ) {
        // If payment is successful but no paid_at from Midtrans, set it to current time
        paymentUpdate.paidAt = new Date();
      }

      // QRIS/GoPay
      if (result.actions && Array.isArray(result.actions)) {
        const qrAction = result.actions.find(
          (a) => a.name === "generate-qr-code"
        );
        if (qrAction && qrAction.url)
          paymentUpdate.snapRedirectUrl = qrAction.url;
      }

      // If payment is successful, send notification and create shipped record
      if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        payment.userId
      ) {
        // Log payment success
        console.log(
          `Payment success for order ${payment.orderId}, user ${payment.userId}, amount: ${payment.amount}`
        );

        // Create shipped record if it doesn't exist
        try {
          const existingShipped = await prisma.shipped.findUnique({
            where: { orderId: payment.orderId },
          });

          if (!existingShipped) {
            // Get user address from payment data or use default
            const userAddress = await prisma.userAddress.findFirst({
              where: { userId: payment.userId, isPrimary: true },
            });

            if (userAddress) {
              await prisma.shipped.create({
                data: {
                  orderId: payment.orderId,
                  paymentId: payment.id,
                  userId: payment.userId,
                  productId: payment.productId,
                  recipientName: userAddress.recipientName,
                  recipientPhone: userAddress.phoneNumber,
                  deliveryAddress: `${userAddress.addressDetail}, ${userAddress.cityName}, ${userAddress.provinceName} ${userAddress.postalCode}`,
                  status: "SHIPPED",
                  shippedAt: new Date(),
                },
              });
              console.log(
                `Created shipped record for order ${payment.orderId}`
              );
            }
          }
        } catch (shippedError) {
          console.error("Error creating shipped record:", shippedError);
        }

        // Kirim email ke admin
        try {
          const { sendAdminPaymentSuccessEmail } = require("../utils/email");
          await sendAdminPaymentSuccessEmail({
            to: "afrizaahmad18@gmail.com",
            type: "product",
            username: payment.user?.username || "User",
            email: payment.user?.email || "No email",
            amount: payment.amount,
            orderId: payment.orderId,
          });
        } catch (err) {
          console.error("Gagal mengirim email ke admin:", err);
        }
      }

      const updatedPayment = await prisma.payment.update({
        where: { orderId: order_id },
        data: paymentUpdate,
        include: { user: true, product: true, shipments: true },
      });

      console.log(
        `Payment status updated for order ${order_id}: ${result.transaction_status}`
      );

      res.json({ success: true, message: "Callback processed successfully" });
    } catch (error) {
      console.error("Midtrans callback error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = UnifiedPaymentController;
