require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const axios = require("axios");

const prisma = new PrismaClient();

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

// Helper: Get URLs based on NODE_ENV
function getUrls() {
  let backendUrl, frontendUrl;

  if (process.env.NODE_ENV === "production") {
    backendUrl = process.env.BACKEND_URL || "http://8.215.196.12:5000";
    frontendUrl = process.env.FRONTEND_URL || "https://lost-media.vercel.app";
  } else if (process.env.NODE_ENV === "staging") {
    backendUrl = process.env.BACKEND_URL || "https://staging-api.zascript.com";
    frontendUrl =
      process.env.FRONTEND_URL || "https://staging-lost-media.vercel.app";
  } else {
    // Development environment - use ngrok for testing
    backendUrl =
      process.env.BACKEND_URL || "https://59cd0f71c24d.ngrok-free.app";
    frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  }

  return { backendUrl, frontendUrl };
}

// Konfigurasi Midtrans
const MIDTRANS_SERVER_KEY = "SB-Mid-server-4zIt7djwCeRdMpgF4gXDjciC";
const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com/v2";

class MidtransController {
  // Create payment for product purchase
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
      } = req.body;

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
      const paymentType = "midtrans";

      // Prepare charge data for Midtrans
      const chargeData = {
        payment_type: paymentMethod,
        transaction_details: {
          order_id: orderId,
          gross_amount: totalAmount,
        },
        customer_details: {
          first_name: user.username,
          email: user.email || "user@example.com",
        },
        item_details: [
          {
            id: product.id,
            price: productPrice,
            quantity: 1,
            name: product.name,
            category: "product",
          },
          {
            id: `shipping_${courier}_${service}`,
            price: shippingCost,
            quantity: 1,
            name: `Shipping ${courier.toUpperCase()} ${service}`,
            category: "shipping",
          },
          {
            id: "admin_fee",
            price: adminFee,
            quantity: 1,
            name: "Admin Fee",
            category: "fee",
          },
        ],
      };

      if (paymentMethod === "credit_card") {
        chargeData.credit_card = {
          secure: true,
          authentication: true,
        };
      } else if (paymentMethod === "bank_transfer") {
        chargeData.bank_transfer = {
          bank: bank || "bca",
        };
      } else if (paymentMethod === "gopay") {
        chargeData.gopay = {
          enable_callback: true,
          callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        };
      }

      // Charge ke Midtrans
      let result;
      try {
        const auth = Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64");
        const response = await axios.post(
          `${MIDTRANS_BASE_URL}/charge`,
          chargeData,
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
          }
        );
        result = response.data;
      } catch (err) {
        return res.status(400).json({
          success: false,
          error:
            err?.response?.data?.status_message || "Failed to create payment",
          validation: err?.response?.data?.validation_messages,
        });
      }

      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          orderId,
          userId,
          productId,
          amount: productPrice,
          adminFee,
          totalAmount,
          status: "PENDING",
          paymentMethod,
          paymentType,
        },
      });

      // Create shipment record
      const shipment = await prisma.shipment.create({
        data: {
          courier,
          service,
          description: `${courier.toUpperCase()} ${service}`,
          weight,
          cost: shippingCost,
          etd: "2-3 hari",
          note: "Product shipping",
          addressId,
          paymentId: payment.id,
        },
      });

      // Extract VA number and bank type from Midtrans response
      let vaNumber = null;
      let bankType = null;

      if (result.va_numbers && result.va_numbers.length > 0) {
        vaNumber = result.va_numbers[0].va_number;
        bankType = result.va_numbers[0].bank;
      }

      // Update payment with Midtrans response
      await prisma.payment.update({
        where: { orderId },
        data: {
          midtransTransactionId: result.transaction_id,
          status: mapMidtransStatusToPrisma(result.transaction_status),
          fraudStatus: result.fraud_status || null,
          midtransResponse: JSON.stringify(result),
          midtransAction: JSON.stringify(result.actions),
          vaNumber: vaNumber,
          bankType: bankType,
          expiryTime: result.expiry_time ? new Date(result.expiry_time) : null,
        },
      });

      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          orderId,
          amount: totalAmount,
          paymentMethod,
          actions: result.actions,
          midtransResponse: result,
          status: result.transaction_status,
          shipment: shipment,
          vaNumber: vaNumber,
          bankType: bankType,
          expiryTime: result.expiry_time,
        },
      });
    } catch (error) {
      console.error("Create product payment error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: error.message,
      });
    }
  }
}

module.exports = MidtransController;
