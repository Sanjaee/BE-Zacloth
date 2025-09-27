require("dotenv").config();
const { Queue, Worker } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const redisConfig = require("./redisConfig");

const prisma = new PrismaClient();

// Helper function to invalidate product-related caches
const invalidateProductCaches = async (productId = null) => {
  if (!redisConfig.isRedisConnected()) {
    return;
  }

  try {
    const patterns = [
      "products:list:*",
      "product:detail:*",
      "cache:GET:/api/products*",
      "cache:GET:/api/products/*",
      "cache:GET:/products*",
      "cache:GET:/products/*",
      // More comprehensive patterns for middleware cache
      "cache:GET:/api/products*",
      "cache:GET:/api/products/*",
      "cache:GET:/api/products/*:*",
      "cache:GET:/products*",
      "cache:GET:/products/*",
      "cache:GET:/products/*:*",
      // Additional patterns for middleware cache keys with base64 encoding
      "cache:GET:/api/products/*:*:*",
      "cache:GET:/products/*:*:*",
    ];

    if (productId) {
      patterns.push(`product:detail:${productId}`);
      patterns.push(`product:checkout:${productId}`);
      patterns.push(`cache:GET:/api/products/${productId}*`);
      patterns.push(`cache:GET:/products/${productId}*`);
      // Add more specific patterns for middleware cache keys
      patterns.push(`cache:GET:/api/products/${productId}:*`);
      patterns.push(`cache:GET:/products/${productId}:*`);
      patterns.push(`cache:GET:/api/products/${productId}:*:*`);
      patterns.push(`cache:GET:/products/${productId}:*:*`);
    }

    for (const pattern of patterns) {
      const deletedCount = await redisConfig.invalidatePattern(pattern);
      console.log(
        `Invalidated ${deletedCount} cache entries for pattern: ${pattern}`
      );
    }

    console.log(
      `Product caches invalidated successfully for ${
        productId ? `product ${productId}` : "all products"
      }`
    );
  } catch (error) {
    console.error("Error invalidating product caches:", error);
  }
};

// Redis connection configuration
const getRedisConnection = () => {
  const host = process.env.REDIS_HOST || "localhost";
  const port = process.env.REDIS_PORT || 6379;
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB || 0;

  return {
    host,
    port,
    password: password && password.trim() !== "" ? password : undefined,
    db: parseInt(db),
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  };
};

// Payment queue configuration
class PaymentQueue {
  constructor() {
    this.connection = getRedisConnection();
    this.queue = null;
    this.worker = null;
    this.initializeQueue();
  }

  initializeQueue() {
    // Create payment queue
    this.queue = new Queue("payment-processing", {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    });

    // Create worker to process payment jobs
    this.worker = new Worker(
      "payment-processing",
      this.processPaymentJob.bind(this),
      {
        connection: this.connection,
        concurrency: 3,
      }
    );

    // Add event listeners
    this.queue.on("error", (error) => {
      console.error("Payment queue error:", error);
    });

    this.worker.on("error", (error) => {
      console.error("Payment worker error:", error);
    });

    this.worker.on("ready", () => {
      console.log("Payment worker is ready");
    });

    this.worker.on("completed", (job) => {
      console.log(`Payment job ${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`Payment job ${job.id} failed:`, err.message);
    });

    console.log("Payment queue and worker initialized");
  }

  // Process payment job
  async processPaymentJob(job) {
    const { type, data } = job.data;

    console.log(`Processing payment job: ${type}`, { jobId: job.id });

    try {
      switch (type) {
        case "create-midtrans-payment":
          return await this.processMidtransPayment(job, data);
        case "create-plisio-payment":
          return await this.processPlisioPayment(job, data);
        default:
          throw new Error(`Unknown payment job type: ${type}`);
      }
    } catch (error) {
      console.error(`Payment job ${job.id} failed:`, error);
      throw error;
    }
  }

  // Process Midtrans payment
  async processMidtransPayment(job, data) {
    const {
      userId,
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
      notes,
      isMultiItem,
      multiItemData,
    } = data;

    await job.updateProgress(10);

    // Get user and product data
    const [user, product, address] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.userAddress.findUnique({ where: { id: addressId } }),
    ]);

    if (!user) throw new Error("User not found");
    if (!product) throw new Error("Product not found");
    if (!address) throw new Error("Address not found");

    await job.updateProgress(30);

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

    await job.updateProgress(50);

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
        notes,
        isMultiItem: isMultiItem || false,
        multiItemData: multiItemData ? JSON.stringify(multiItemData) : null,
      },
    });

    // Reserve stock for pending payment
    try {
      const productIds = [];

      if (isMultiItem && multiItemData) {
        // Reserve stock for multi-item checkout
        for (const item of multiItemData.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              reservedStock: {
                increment: item.quantity,
              },
            },
          });
          productIds.push(item.productId);
          console.log(
            `Reserved ${item.quantity} stock for product ${item.productId}`
          );
        }
      } else {
        // Reserve stock for single item checkout
        await prisma.product.update({
          where: { id: productId },
          data: {
            reservedStock: {
              increment: 1,
            },
          },
        });
        productIds.push(productId);
        console.log(`Reserved 1 stock for product ${productId}`);
      }

      // Invalidate cache for affected products
      if (productIds.length > 0) {
        await invalidateProductCaches();
        console.log(`Invalidated cache for products: ${productIds.join(", ")}`);
      }
    } catch (stockReserveError) {
      console.error("Error reserving stock:", stockReserveError);
      // If stock reservation fails, delete the payment record
      await prisma.payment.delete({ where: { id: payment.id } });
      throw new Error("Failed to reserve stock for payment");
    }

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

    await job.updateProgress(70);

    // Charge to Midtrans
    const MIDTRANS_SERVER_KEY = "SB-Mid-server-4zIt7djwCeRdMpgF4gXDjciC";
    const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com/v2";

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

    await job.updateProgress(90);

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
        status: this.mapMidtransStatusToPrisma(result.transaction_status),
        fraudStatus: result.fraud_status || null,
        midtransResponse: JSON.stringify(result),
        midtransAction: JSON.stringify(result.actions),
        vaNumber: vaNumber,
        bankType: bankType,
        expiryTime: result.expiry_time ? new Date(result.expiry_time) : null,
      },
    });

    await job.updateProgress(100);

    return {
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
    };
  }

  // Process Plisio payment
  async processPlisioPayment(job, data) {
    const {
      userId,
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
      currency = "BTC",
      notes,
      isMultiItem,
      multiItemData,
    } = data;

    await job.updateProgress(10);

    // Get user and product data
    const [user, product, address] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.userAddress.findUnique({ where: { id: addressId } }),
    ]);

    if (!user) throw new Error("User not found");
    if (!product) throw new Error("Product not found");
    if (!address) throw new Error("Address not found");

    await job.updateProgress(30);

    const orderId = `PROD_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Convert IDR to USD (approximate rate)
    const usdRate = 0.000065; // 1 IDR = 0.000065 USD (approximate)
    const amountUSD = Math.round(totalAmount * usdRate * 100) / 100;

    await job.updateProgress(50);

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
        paymentMethod: "crypto",
        paymentType: "plisio",
        notes,
        isMultiItem: isMultiItem || false,
        multiItemData: multiItemData ? JSON.stringify(multiItemData) : null,
      },
    });

    // Reserve stock for pending payment
    try {
      const productIds = [];

      if (isMultiItem && multiItemData) {
        // Reserve stock for multi-item checkout
        for (const item of multiItemData.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              reservedStock: {
                increment: item.quantity,
              },
            },
          });
          productIds.push(item.productId);
          console.log(
            `Reserved ${item.quantity} stock for product ${item.productId}`
          );
        }
      } else {
        // Reserve stock for single item checkout
        await prisma.product.update({
          where: { id: productId },
          data: {
            reservedStock: {
              increment: 1,
            },
          },
        });
        productIds.push(productId);
        console.log(`Reserved 1 stock for product ${productId}`);
      }

      // Invalidate cache for affected products
      if (productIds.length > 0) {
        await invalidateProductCaches();
        console.log(`Invalidated cache for products: ${productIds.join(", ")}`);
      }
    } catch (stockReserveError) {
      console.error("Error reserving stock:", stockReserveError);
      // If stock reservation fails, delete the payment record
      await prisma.payment.delete({ where: { id: payment.id } });
      throw new Error("Failed to reserve stock for payment");
    }

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

    await job.updateProgress(70);

    // Create Plisio invoice
    const PLISIO_API_KEY =
      "eB_tpJ0APoZFakdp7HIH-drEhVjGwBNCMi-VaDxMtUulbgDsDDtUS86Hu7BkjzBG";

    const invoiceData = {
      api_key: PLISIO_API_KEY,
      order_name: `Product Purchase: ${product.name}`,
      order_number: orderId,
      source_currency: "USD",
      source_amount: amountUSD,
      currency: currency,
      callback_url: `${process.env.BACKEND_URL}/api/plisio/callback?json=true`,
      success_callback_url: `${process.env.BACKEND_URL}/api/plisio/success?json=true`,
      fail_callback_url: `${process.env.BACKEND_URL}/api/plisio/fail?json=true`,
      success_invoice_url: `${process.env.FRONTEND_URL}/payment/${orderId}`,
      fail_invoice_url: `${process.env.FRONTEND_URL}/checkout/${productId}`,
      email: user.email || "user@example.com",
      description: `Purchase ${product.name} for ${user.username}`,
      expire_min: 60, // Invoice expires in 60 minutes
    };

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

    await job.updateProgress(90);

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

    await job.updateProgress(100);

    return {
      success: true,
      data: {
        paymentId: payment.id,
        orderId,
        amount: totalAmount,
        amountUSD: amountUSD,
        currency: currency,
        paymentMethod: "crypto",
        hostedUrl:
          plisioResult.data.invoice_url || plisioResult.data.hosted_url,
        status: plisioResult.data.status,
        txnId: plisioResult.data.txn_id,
        shipment: shipment,
      },
    };
  }

  // Helper: Map Midtrans status to Prisma enum
  mapMidtransStatusToPrisma(status) {
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

  // Add payment job to queue
  async addPaymentJob(type, data, options = {}) {
    if (!this.queue) {
      throw new Error("Payment queue not initialized");
    }

    const job = await this.queue.add(
      type,
      { type, data },
      {
        priority: options.priority || 0,
        delay: options.delay || 0,
        ...options,
      }
    );

    console.log(`Added payment job: ${type}`, { jobId: job.id });
    return job;
  }

  // Get job status
  async getJobStatus(jobId) {
    if (!this.queue) {
      throw new Error("Payment queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      opts: job.opts,
      state: await job.getState(),
    };
  }

  // Close queue and worker
  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }
}

// Create singleton instance
const paymentQueue = new PaymentQueue();

module.exports = paymentQueue;
