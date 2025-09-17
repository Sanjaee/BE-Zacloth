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

// Konfigurasi Midtrans
const MIDTRANS_SERVER_KEY = "SB-Mid-server-4zIt7djwCeRdMpgF4gXDjciC"
  // process.env.NODE_ENV === "production"
  //   ? process.env.MIDTRANS_SERVER_KEY_PROD
  //   : process.env.MIDTRANS_SERVER_KEY_SANDBOX;

const MIDTRANS_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

class MidtransController {
  // Get all roles (for frontend UI)
  static async getAllRoles(req, res) {
    try {
      const roles = await prisma.role.findMany({
        select: {
          id: true,
          name: true,
          price: true,
          benefit: true,
          image: true,
        },
        orderBy: { price: "desc" },
      });
      res.json({ success: true, data: roles });
    } catch (error) {
      console.error("Get all roles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Create payment token untuk Core API
  static async createPayment(req, res) {
    try {
      const { roleId, paymentMethod = "credit_card", bank } = req.body;
      const userId = req.user.userId;

      // Get role data (price, name, etc)
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) return res.status(404).json({ error: "Role not found" });
      const user = await prisma.user.findUnique({ where: { userId } });
      if (!user) return res.status(404).json({ error: "User not found" });

      const orderId = `order-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const grossAmount = role.price;
      const totalAmount = grossAmount;
      let paymentType = paymentMethod;
      if (paymentMethod === "gopay") paymentType = "qris"; // optional, bisa pakai gopay juga

      // Create payment record (PENDING)
      const payment = await prisma.payment.create({
        data: {
          orderId,
          userId,
          role: role.name,
          amount: grossAmount,
          adminFee: 0,
          totalAmount,
          status: "PENDING",
          paymentMethod,
          paymentType,
        },
      });

      // Prepare charge data for Midtrans
      const chargeData = {
        payment_type: paymentMethod,
        transaction_details: {
          order_id: orderId,
          gross_amount: totalAmount,
        },
        customer_details: {
          first_name: user.username,
          email: user.email,
        },
        item_details: [
          {
            id: role.id,
            price: role.price,
            quantity: 1,
            name: role.name,
            category: "role",
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

      const result = response.data;

      // Simpan seluruh response Midtrans (termasuk actions) ke midtransResponse
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

      // Kirim ke frontend
      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          orderId,
          amount: totalAmount,
          paymentMethod,
          actions: result.actions, // langsung kirim actions ke FE
          midtransResponse: result,
          status: result.transaction_status,
        },
      });
    } catch (error) {
      console.error("Create payment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Update user role after payment is successful
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
      // If payment is successful, update user role and send notification
      if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        payment.userId
      ) {
        // Update user role if it's a role payment
        if (payment.role && (payment.type === "role" || !payment.type)) {
          await prisma.user.update({
            where: { userId: payment.userId },
            data: { role: payment.role },
          });

          // Send role purchase notification
          const notificationController = require("./notificationController");
          const notificationResult =
            await notificationController.createRolePurchaseNotification(
              payment.userId,
              payment.user?.username || "User",
              payment.role,
              payment.amount,
              payment.orderId
            );

          if (notificationResult.success) {
            console.log(
              `Payment success notification sent for order ${payment.orderId}, user ${payment.userId}, role ${payment.role}`
            );
          } else {
            console.log(
              `Payment notification skipped for order ${payment.orderId}: ${notificationResult.message}`
            );
          }

          // Kirim email ke admin
          try {
            await sendAdminPaymentSuccessEmail({
              to: "afrizaahmad18@gmail.com",
              type: "role",
              username: payment.user?.username || "User",
              email: payment.user?.email || "No email",
              role: payment.role,
              amount: payment.amount,
              orderId: payment.orderId,
            });
          } catch (err) {
            console.error("Gagal mengirim email ke admin:", err);
          }
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
      // If payment is successful, update user role and send notification
      if (
        mapMidtransStatusToPrisma(notification.transaction_status) ===
          "SUCCESS" &&
        updatedPayment.userId
      ) {
        // Update user role if it's a role payment
        if (
          updatedPayment.role &&
          (updatedPayment.type === "role" || !updatedPayment.type)
        ) {
          await prisma.user.update({
            where: { userId: updatedPayment.userId },
            data: { role: updatedPayment.role },
          });

          // Send role purchase notification
          const notificationController = require("./notificationController");
          const notificationResult =
            await notificationController.createRolePurchaseNotification(
              updatedPayment.userId,
              updatedPayment.user?.username || "User",
              updatedPayment.role,
              updatedPayment.amount,
              updatedPayment.orderId
            );

          if (notificationResult.success) {
            console.log(
              `Payment success notification sent for order ${updatedPayment.orderId}, user ${updatedPayment.userId}, role ${updatedPayment.role}`
            );
          } else {
            console.log(
              `Payment notification skipped for order ${updatedPayment.orderId}: ${notificationResult.message}`
            );
          }

          // Kirim email ke admin
          try {
            await sendAdminPaymentSuccessEmail({
              to: "afrizaahmad18@gmail.com",
              type: "role",
              username: updatedPayment.user?.username || "User",
              email: updatedPayment.user?.email || "No email",
              role: updatedPayment.role,
              amount: updatedPayment.amount,
              orderId: updatedPayment.orderId,
            });
          } catch (err) {
            console.error("Gagal mengirim email ke admin:", err);
          }
        }

        // Update user star if it's a star payment
        if (updatedPayment.star && updatedPayment.type === "star") {
          await prisma.user.update({
            where: { userId: updatedPayment.userId },
            data: { star: updatedPayment.star },
          });

          // Send star upgrade notification
          const notificationController = require("./notificationController");
          const notificationResult =
            await notificationController.createStarUpgradeNotification(
              updatedPayment.userId,
              updatedPayment.user?.username || "User",
              updatedPayment.star,
              updatedPayment.amount,
              updatedPayment.orderId
            );

          if (notificationResult.success) {
            console.log(
              `Star upgrade notification sent for order ${updatedPayment.orderId}, user ${updatedPayment.userId}, star ${updatedPayment.star}`
            );
          } else {
            console.log(
              `Star notification skipped for order ${updatedPayment.orderId}: ${notificationResult.message}`
            );
          }

          // Kirim email ke admin
          try {
            await sendAdminPaymentSuccessEmail({
              to: "afrizaahmad18@gmail.com",
              type: "star",
              username: updatedPayment.user?.username || "User",
              email: updatedPayment.user?.email || "No email",
              star: updatedPayment.star,
              amount: updatedPayment.amount,
              orderId: updatedPayment.orderId,
            });
          } catch (err) {
            console.error("Gagal mengirim email ke admin:", err);
          }
        }
      }

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
          role: true,
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

  // Create a new role (only owner)
  static async createRole(req, res) {
    try {
      // Only allow owner
      const requesterRole = req.user?.role || req.headers["x-user-role"];
      if (requesterRole !== "owner") {
        return res
          .status(403)
          .json({ error: "Forbidden: Only owner can create roles" });
      }
      const { name, price, benefit, image } = req.body;
      if (!name || typeof name !== "string" || name.length < 2) {
        return res.status(400).json({
          error: "Role name is required and must be at least 2 characters",
        });
      }
      if (typeof price !== "number" || price < 0) {
        return res
          .status(400)
          .json({ error: "Price must be a non-negative number" });
      }
      if (!benefit || !Array.isArray(benefit) || benefit.length === 0) {
        return res.status(400).json({
          error: "Benefit is required and must be a non-empty array",
        });
      }
      // Validate each benefit item
      for (let i = 0; i < benefit.length; i++) {
        if (typeof benefit[i] !== "string" || benefit[i].trim().length < 2) {
          return res.status(400).json({
            error: `Benefit item ${
              i + 1
            } must be a string with at least 2 characters`,
          });
        }
      }
      // image is optional
      // Check for unique name
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) {
        return res.status(400).json({ error: "Role name already exists" });
      }
      const newRole = await prisma.role.create({
        data: {
          name,
          price,
          benefit,
          image: image || null,
        },
      });
      res.json({ success: true, data: newRole });
    } catch (error) {
      console.error("Create role error:", error);
      res.status(500).json({ error: "Internal server error" });
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

  // Delete a role (only owner)
  static async deleteRole(req, res) {
    try {
      // Only allow owner
      const requesterRole = req.user?.role || req.headers["x-user-role"];
      if (requesterRole !== "owner") {
        return res
          .status(403)
          .json({ error: "Forbidden: Only owner can delete roles" });
      }

      const { roleId } = req.params;

      // Check if role exists
      const existingRole = await prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!existingRole) {
        return res.status(404).json({ error: "Role not found" });
      }

      // Check if there are any payments using this role
      const paymentsWithRole = await prisma.payment.findFirst({
        where: { role: existingRole.name },
      });

      if (paymentsWithRole) {
        return res.status(400).json({
          error:
            "Cannot delete role: There are existing payments using this role",
        });
      }

      // Delete the role
      await prisma.role.delete({
        where: { id: roleId },
      });

      res.json({ success: true, message: "Role deleted successfully" });
    } catch (error) {
      console.error("Delete role error:", error);
      res.status(500).json({ error: "Internal server error" });
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
          role: "client",
          amount: productPrice,
          adminFee,
          totalAmount,
          status: "PENDING",
          paymentMethod,
          paymentType,
          type: "product",
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

  // Create payment for star upgrade
  static async createStarPayment(req, res) {
    try {
      const userId = req.user.userId;
      const user = await prisma.user.findUnique({ where: { userId } });
      if (!user) return res.status(404).json({ error: "User not found" });
      const currentStar = user.star || 0;
      const targetStar = Math.min(currentStar + 1, 8); // max 8 star
      if (currentStar >= 8) {
        return res.status(400).json({ error: "You already have max star (8)" });
      }
      // Harga: 1.000 x 10^(targetStar-1)
      const price = 1000 * Math.pow(10, targetStar - 1);
      const paymentMethod = req.body.paymentMethod || "gopay";
      const bank = req.body.bank;
      const orderId = `star-${userId.slice(0, 8)}-${Date.now()
        .toString()
        .slice(-6)}-${Math.random().toString(36).substr(2, 5)}`;
      let paymentType = paymentMethod;
      if (paymentMethod === "gopay") paymentType = "qris";
      // Prepare charge data for Midtrans
      const chargeData = {
        payment_type: paymentMethod,
        transaction_details: {
          order_id: orderId,
          gross_amount: price,
        },
        customer_details: {
          first_name: user.username,
          email: user.email,
        },
        item_details: [
          {
            id: `star-${targetStar}`,
            price: price,
            quantity: 1,
            name: `Star ${targetStar}`,
            category: "role",
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
          error:
            err?.response?.data?.status_message || "Failed to create payment",
          validation: err?.response?.data?.validation_messages,
        });
      }
      // Jika sukses, baru buat payment di DB
      const payment = await prisma.payment.create({
        data: {
          orderId,
          userId,
          role: user.role || "",
          amount: price,
          adminFee: 0,
          totalAmount: price,
          status: "PENDING",
          paymentMethod,
          paymentType,
          star: targetStar, // simpan target star
          type: "star", // tipe payment
        },
      });
      // Simpan seluruh response Midtrans (termasuk actions) ke midtransResponse
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
      // Kirim ke frontend
      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          orderId,
          amount: price,
          paymentMethod,
          actions: result.actions,
          midtransResponse: result,
          status: result.transaction_status,
          targetStar,
        },
      });
    } catch (error) {
      console.error("Create star payment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Get payment status for star upgrade
  static async getStarPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;
      const payment = await prisma.payment.findUnique({
        where: { orderId },
        include: { user: true },
      });
      if (!payment || payment.type !== "star") {
        return res.status(404).json({ error: "Star payment not found" });
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
      // Jika payment sukses, update star user dan kirim notifikasi
      if (
        mapMidtransStatusToPrisma(result.transaction_status) === "SUCCESS" &&
        payment.userId &&
        payment.star &&
        payment.type === "star"
      ) {
        await prisma.user.update({
          where: { userId: payment.userId },
          data: { star: payment.star },
        });

        // Send star upgrade notification
        const notificationController = require("./notificationController");
        const notificationResult =
          await notificationController.createStarUpgradeNotification(
            payment.userId,
            payment.user?.username || "User",
            payment.star,
            payment.amount,
            payment.orderId
          );

        if (notificationResult.success) {
          console.log(
            `Star upgrade notification sent for order ${payment.orderId}, user ${payment.userId}, star ${payment.star}`
          );
        } else {
          console.log(
            `Star notification skipped for order ${payment.orderId}: ${notificationResult.message}`
          );
        }

        // Kirim email ke admin
        try {
          await sendAdminPaymentSuccessEmail({
            to: "afrizaahmad18@gmail.com",
            type: "star",
            username: payment.user?.username || "User",
            email: payment.user?.email || "No email",
            star: payment.star,
            amount: payment.amount,
            orderId: payment.orderId,
          });
        } catch (err) {
          console.error("Gagal mengirim email ke admin:", err);
        }
      }
      const updatedPayment = await prisma.payment.update({
        where: { orderId },
        data: paymentUpdate,
        include: { user: true },
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
      console.error("Get star payment status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = MidtransController;
