require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const axios = require("axios");
const { sendAdminPaymentSuccessEmail } = require("../utils/email");

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
// process.env.NODE_ENV === "production"
//   ? process.env.MIDTRANS_SERVER_KEY_PROD
//   : process.env.MIDTRANS_SERVER_KEY_SANDBOX;

const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com/v2";
// process.env.NODE_ENV === "production"
//   ? "https://api.midtrans.com/v2"
//   : "https://api.sandbox.midtrans.com/v2";

class MidtransController {
  // Get payment status
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
      if (result.paid_at) paymentUpdate.paidAt = new Date(result.paid_at);
      // QRIS/GoPay
      if (result.actions && Array.isArray(result.actions)) {
        const qrAction = result.actions.find(
          (a) => a.name === "generate-qr-code"
        );
        if (qrAction && qrAction.url)
          paymentUpdate.snapRedirectUrl = qrAction.url;
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
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Handle notification dari Midtrans
  static async handleNotification(req, res) {
    try {
      const notification = req.body;

      // Verify signature
      const serverKey = MIDTRANS_SERVER_KEY;
      const orderId = notification.order_id;
      const statusCode = notification.status_code;
      const grossAmount = notification.gross_amount;
      const signatureKey = crypto
        .createHash("sha512")
        .update(orderId + statusCode + grossAmount + serverKey)
        .digest("hex");

      if (signatureKey !== notification.signature_key) {
        return res.status(400).json({ error: "Invalid signature" });
      }

      // Update payment status
      const payment = await prisma.payment.findUnique({
        where: { orderId: orderId },
        include: { user: true, product: true, shipments: true },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // Extract additional fields from Midtrans notification
      let paymentUpdate = {
        status: mapMidtransStatusToPrisma(notification.transaction_status),
        transactionStatus: notification.transaction_status,
        fraudStatus: notification.fraud_status || null,
        midtransResponse: JSON.stringify(notification),
        updatedAt: new Date(),
      };
      if (
        notification.va_numbers &&
        Array.isArray(notification.va_numbers) &&
        notification.va_numbers.length > 0
      ) {
        paymentUpdate.vaNumber = notification.va_numbers[0].va_number;
        paymentUpdate.bankType = notification.va_numbers[0].bank;
      }
      if (notification.permata_va_number) {
        paymentUpdate.vaNumber = notification.permata_va_number;
        paymentUpdate.bankType = "permata";
      }
      if (notification.payment_code)
        paymentUpdate.paymentCode = notification.payment_code;
      if (notification.expiry_time)
        paymentUpdate.expiryTime = new Date(notification.expiry_time);
      if (notification.paid_at)
        paymentUpdate.paidAt = new Date(notification.paid_at);
      // QRIS/GoPay
      if (notification.actions && Array.isArray(notification.actions)) {
        const qrAction = notification.actions.find(
          (a) => a.name === "generate-qr-code"
        );
        if (qrAction && qrAction.url)
          paymentUpdate.snapRedirectUrl = qrAction.url;
      }
      // JANGAN timpa snapRedirectUrl jika tidak ada QR baru

      const updatedPayment = await prisma.payment.update({
        where: { orderId: orderId },
        data: paymentUpdate,
        include: { user: true, product: true, shipments: true },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Handle notification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Get all payments for user
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

  // Mendapatkan payment pending milik user
  static async getPendingPaymentByUser(req, res) {
    try {
      const userId = req.user.userId;
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
          midtransResponse: true,
          midtransAction: true,
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
        return res.json({ success: true, data: pendingPayment });
      }
      return res.json({ success: true, data: null });
    } catch (err) {
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }

  static async cancelPayment(req, res) {
    try {
      const userId = req.user.userId;
      const { orderId } = req.params;
      const payment = await prisma.payment.findFirst({
        where: { orderId, userId, status: "PENDING" },
      });
      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment not found or not cancellable",
        });
      }
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "CANCELLED" },
      });
      return res.json({ success: true, message: "Payment cancelled" });
    } catch (err) {
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }

  // Create payment for product purchase
  static async createProductPayment(req, res) {
    try {
      const userId = req.user.id; // From authenticated middleware
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

      // Validation with specific error messages
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
          .status(404)
          .json({ success: false, message: "User not found" });
      }
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }
      if (!address) {
        return res
          .status(404)
          .json({ success: false, message: "Address not found" });
      }

      const orderId = `PROD_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      let paymentType = paymentMethod;
      if (paymentMethod === "gopay") paymentType = "qris";
      if (paymentMethod === "crypto") paymentType = "plisio";

      // Handle crypto payment with Plisio
      if (paymentMethod === "crypto") {
        const PlisioController = require("./plisioController");

        // Convert IDR to USD (approximate rate)
        const usdRate = 0.000065; // 1 IDR = 0.000065 USD (approximate)
        const amountUSD = Math.round(totalAmount * usdRate * 100) / 100;

        // Create payment record (PENDING)
        const payment = await prisma.payment.create({
          data: {
            orderId,
            userId,
            productId,
            amount: productPrice,
            adminFee,
            totalAmount,
            status: "PENDING",
            paymentMethod: "crypto",
            paymentType: "plisio",
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

        // Create Plisio invoice
        const { backendUrl, frontendUrl } = getUrls();

        const invoiceData = {
          api_key:
            process.env.PLISIO_API_KEY ||
            "eB_tpJ0APoZFakdp7HIH-drEhVjGwBNCMi-VaDxMtUulbgDsDDtUS86Hu7BkjzBG",
          order_name: `Product Purchase: ${product.name}`,
          order_number: orderId,
          source_currency: "USD",
          source_amount: amountUSD,
          currency: currency || "BTC",
          callback_url: `${backendUrl}/api/plisio/callback?json=true`,
          success_callback_url: `${backendUrl}/api/plisio/success?json=true`,
          fail_callback_url: `${backendUrl}/api/plisio/fail?json=true`,
          success_invoice_url: `${frontendUrl}/payment/${orderId}`,
          fail_invoice_url: `${frontendUrl}/checkout/${productId}`,
          email: user.email || "user@example.com",
          description: `Purchase ${product.name} for ${user.username}`,
          expire_min: 60, // Invoice expires in 60 minutes
        };

        // Create invoice with Plisio
        const queryParams = new URLSearchParams(invoiceData).toString();
        const plisioResponse = await axios.get(
          `https://api.plisio.net/api/v1/invoices/new?${queryParams}`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const plisioResult = plisioResponse.data;

        if (plisioResult.status !== "success") {
          throw new Error(
            plisioResult.message || "Failed to create Plisio invoice"
          );
        }

        // Update payment with Plisio response
        await prisma.payment.update({
          where: { orderId },
          data: {
            midtransTransactionId: plisioResult.data.txn_id,
            status: "PENDING",
            midtransResponse: JSON.stringify(plisioResult.data),
            snapRedirectUrl:
              plisioResult.data.invoice_url || plisioResult.data.hosted_url,
          },
        });

        return res.json({
          success: true,
          data: {
            paymentId: payment.id,
            orderId,
            amount: totalAmount,
            amountUSD: amountUSD,
            currency: currency || "BTC",
            paymentMethod: "crypto",
            hostedUrl:
              plisioResult.data.invoice_url || plisioResult.data.hosted_url,
            status: plisioResult.data.status,
            txnId: plisioResult.data.txn_id,
            shipment: shipment,
          },
        });
      }

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
        console.error("Midtrans error:", err?.response?.data || err.message);
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

      // Update payment with Midtrans response
      await prisma.payment.update({
        where: { orderId },
        data: {
          midtransTransactionId: result.transaction_id,
          status: mapMidtransStatusToPrisma(result.transaction_status),
          fraudStatus: result.fraud_status || null,
          midtransResponse: JSON.stringify(result),
          midtransAction: JSON.stringify(result.actions),
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
