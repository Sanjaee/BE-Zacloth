// require("dotenv").config();
// const { PrismaClient } = require("@prisma/client");
// const crypto = require("crypto");
// const axios = require("axios");
// const { sendAdminPaymentSuccessEmail } = require("../utils/email");

// const prisma = new PrismaClient();

// // Plisio Configuration
// const PLISIO_API_KEY =
//   "eB_tpJ0APoZFakdp7HIH-drEhVjGwBNCMi-VaDxMtUulbgDsDDtUS86Hu7BkjzBG";
// const PLISIO_BASE_URL = "https://api.plisio.net/api/v1";

// // Helper: Map Plisio status to Prisma enum
// function mapPlisioStatusToPrisma(status) {
//   switch (status) {
//     case "pending":
//       return "PENDING";
//     case "completed":
//       return "SUCCESS";
//     case "cancelled":
//       return "CANCELLED";
//     case "expired":
//       return "EXPIRED";
//     case "failed":
//       return "FAILED";
//     default:
//       return "PENDING";
//   }
// }

// // Helper: Get URLs based on NODE_ENV
// function getUrls() {
//   let backendUrl, frontendUrl;

//   if (process.env.NODE_ENV === "production") {
//     backendUrl = process.env.BACKEND_URL || "http://8.215.196.12:5000";
//     frontendUrl = process.env.FRONTEND_URL || "https://lost-media.vercel.app";
//   } else if (process.env.NODE_ENV === "staging") {
//     backendUrl = process.env.BACKEND_URL || "https://staging-api.zascript.com";
//     frontendUrl =
//       process.env.FRONTEND_URL || "https://staging-lost-media.vercel.app";
//   } else {
//     // Development environment - use ngrok for testing
//     backendUrl =
//       process.env.BACKEND_URL || "https://59cd0f71c24d.ngrok-free.app";
//     frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
//   }

//   return { backendUrl, frontendUrl };
// }

// // Helper: Verify Plisio callback signature (updated implementation)
// function verifyPlisioCallback(data, secretKey) {
//   if (!data.verify_hash || !secretKey) {
//     console.error("Missing verify_hash or secret key");
//     return false;
//   }

//   try {
//     const ordered = { ...data };
//     delete ordered.verify_hash;

//     // Sort the data for consistent hashing
//     const sortedData = {};
//     Object.keys(ordered)
//       .sort()
//       .forEach((key) => {
//         sortedData[key] = ordered[key];
//       });

//     // Handle special fields as mentioned in documentation
//     if (sortedData.expire_utc) {
//       sortedData.expire_utc = String(sortedData.expire_utc);
//     }
//     if (sortedData.tx_urls) {
//       // Handle HTML entity decoding if needed
//       sortedData.tx_urls = sortedData.tx_urls
//         .replace(/&amp;/g, "&")
//         .replace(/&lt;/g, "<")
//         .replace(/&gt;/g, ">")
//         .replace(/&quot;/g, '"')
//         .replace(/&#039;/g, "'");
//     }

//     // For JSON callbacks, use JSON.stringify instead of PHP serialize
//     const dataString = JSON.stringify(sortedData);

//     // Create HMAC hash
//     const hmac = crypto.createHmac("sha1", secretKey);
//     hmac.update(dataString);
//     const computedHash = hmac.digest("hex");

//     console.log("Computed hash:", computedHash);
//     console.log("Received hash:", data.verify_hash);

//     return computedHash === data.verify_hash;
//   } catch (error) {
//     console.error("Error verifying callback data:", error);
//     return false;
//   }
// }

// // Helper: Process payment status update
// async function processPaymentUpdate(callbackData) {
//   const {
//     txn_id,
//     order_number,
//     order_name,
//     status,
//     amount,
//     currency,
//     confirmations,
//     source_currency,
//     source_amount,
//     merchant_id,
//     invoice_commission,
//     invoice_sum,
//     invoice_total_sum,
//   } = callbackData;

//   console.log(`Processing payment update for order ${order_number}:`, {
//     txn_id,
//     status,
//     amount,
//     currency,
//     confirmations,
//   });

//   // Find payment by txn_id or order_number
//   let payment = await prisma.payment.findFirst({
//     where: {
//       OR: [{ midtransTransactionId: txn_id }, { orderId: order_number }],
//     },
//     include: {
//       user: true,
//       roleModel: true,
//     },
//   });

//   if (!payment) {
//     console.error(
//       `❌ Payment not found for txn_id: ${txn_id}, order_number: ${order_number}`
//     );
//     return false;
//   }

//   console.log(
//     `✅ Found payment: ${payment.orderId}, Current status: ${payment.status}`
//   );

//   // Map Plisio status to our system
//   const mappedStatus = mapPlisioStatusToPrisma(status);
//   console.log(`🔄 Status mapping: ${status} -> ${mappedStatus}`);

//   // Update payment status with detailed callback information
//   let paymentUpdate = {
//     status: mappedStatus,
//     transactionStatus: status,
//     midtransResponse: JSON.stringify(callbackData),
//     updatedAt: new Date(),
//     // Store additional Plisio-specific data
//     transactionDetails: JSON.stringify({
//       txn_id,
//       currency,
//       amount,
//       confirmations,
//       source_currency,
//       source_amount,
//       source_rate: callbackData.source_rate,
//       invoice_commission,
//       invoice_sum,
//       invoice_total_sum,
//       pending_amount: callbackData.pending_amount,
//       expected_confirmations: callbackData.expected_confirmations,
//       wallet_hash: callbackData.wallet_hash,
//       comment: callbackData.comment,
//       merchant: callbackData.merchant,
//       merchant_id,
//     }),
//   };

//   // Add paid timestamp if completed
//   if (status === "completed") {
//     paymentUpdate.paidAt = new Date();
//   }

//   const updatedPayment = await prisma.payment.update({
//     where: { id: payment.id },
//     data: paymentUpdate,
//     include: { user: true, roleModel: true },
//   });

//   console.log(
//     `✅ Payment ${updatedPayment.orderId} status updated to: ${updatedPayment.status}`
//   );

//   // Handle successful payment completion
//   if (mappedStatus === "SUCCESS" && updatedPayment.userId) {
//     console.log(
//       `🎉 Processing successful payment for user: ${updatedPayment.userId}`
//     );

//     const notificationController = require("./notificationController");

//     // Handle star payment
//     if (updatedPayment.type === "star" && updatedPayment.star) {
//       console.log(
//         `⭐ Updating user ${updatedPayment.userId} star to ${updatedPayment.star}`
//       );

//       await prisma.user.update({
//         where: { userId: updatedPayment.userId },
//         data: { star: updatedPayment.star },
//       });

//       // Send star upgrade notification
//       const notificationResult =
//         await notificationController.createStarUpgradeNotification(
//           updatedPayment.userId,
//           updatedPayment.user?.username || "User",
//           updatedPayment.star,
//           updatedPayment.amount,
//           updatedPayment.orderId
//         );

//       if (notificationResult.success) {
//         console.log(
//           `✅ Star upgrade notification sent for order ${updatedPayment.orderId}`
//         );
//       } else {
//         console.log(
//           `⚠️ Star notification skipped: ${notificationResult.message}`
//         );
//       }

//       // Send email to admin
//       try {
//         await sendAdminPaymentSuccessEmail({
//           to: "afrizaahmad18@gmail.com",
//           type: "star",
//           username: updatedPayment.user?.username || "User",
//           email: updatedPayment.user?.email || "No email",
//           star: updatedPayment.star,
//           amount: updatedPayment.amount,
//           orderId: updatedPayment.orderId,
//           paymentMethod: "Crypto (Plisio)",
//           txnId: txn_id,
//           currency: currency,
//           amountReceived: amount,
//         });
//       } catch (err) {
//         console.error("❌ Failed to send email to admin:", err);
//       }
//     }
//     // Handle role payment
//     else if (
//       updatedPayment.role &&
//       (updatedPayment.type === "role" || !updatedPayment.type)
//     ) {
//       console.log(
//         `👑 Updating user ${updatedPayment.userId} role to ${updatedPayment.role}`
//       );

//       await prisma.user.update({
//         where: { userId: updatedPayment.userId },
//         data: { role: updatedPayment.role },
//       });

//       // Send role purchase notification
//       const notificationResult =
//         await notificationController.createRolePurchaseNotification(
//           updatedPayment.userId,
//           updatedPayment.user?.username || "User",
//           updatedPayment.role,
//           updatedPayment.amount,
//           updatedPayment.orderId
//         );

//       if (notificationResult.success) {
//         console.log(
//           `✅ Role purchase notification sent for order ${updatedPayment.orderId}`
//         );
//       } else {
//         console.log(
//           `⚠️ Role notification skipped: ${notificationResult.message}`
//         );
//       }

//       // Send email to admin
//       try {
//         await sendAdminPaymentSuccessEmail({
//           to: "afrizaahmad18@gmail.com",
//           type: "role",
//           username: updatedPayment.user?.username || "User",
//           email: updatedPayment.user?.email || "No email",
//           role: updatedPayment.role,
//           amount: updatedPayment.amount,
//           orderId: updatedPayment.orderId,
//           paymentMethod: "Crypto (Plisio)",
//           txnId: txn_id,
//           currency: currency,
//           amountReceived: amount,
//         });
//       } catch (err) {
//         console.error("❌ Failed to send email to admin:", err);
//       }
//     }
//   }

//   // Handle different payment statuses for logging
//   switch (status) {
//     case "new":
//       console.log(`New invoice created: ${txn_id}`);
//       break;

//     case "pending":
//       console.log(
//         `Payment pending confirmations: ${txn_id} (${confirmations} confirmations)`
//       );
//       break;

//     case "pending internal":
//       console.log(`Payment processing internally: ${txn_id}`);
//       break;

//     case "completed":
//       console.log(`Payment completed successfully: ${txn_id}`);
//       break;

//     case "mismatch":
//       console.log(`Payment overpaid: ${txn_id}`);
//       break;

//     case "expired":
//       console.log(`Payment expired: ${txn_id}`);
//       if (parseFloat(amount) > 0) {
//         console.log(`Partial payment received: ${amount} ${currency}`);
//       }
//       break;

//     case "cancelled":
//       console.log(`Payment cancelled: ${txn_id}`);
//       break;

//     case "error":
//       console.log(`Payment error: ${txn_id}`);
//       break;

//     default:
//       console.log(`Unknown payment status: ${status} for ${txn_id}`);
//   }

//   return true;
// }

// class PlisioController {
//   // Get all roles (for frontend UI)
//   static async getAllRoles(req, res) {
//     try {
//       const roles = await prisma.role.findMany({
//         select: {
//           id: true,
//           name: true,
//           price: true,
//           benefit: true,
//           image: true,
//         },
//         orderBy: { price: "desc" },
//       });
//       res.json({ success: true, data: roles });
//     } catch (error) {
//       console.error("Get all roles error:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }

//   // Get supported cryptocurrencies from Plisio
//   static async getCurrencies(req, res) {
//     try {
//       const response = await axios.get(`${PLISIO_BASE_URL}/currencies`, {
//         params: {
//           api_key: PLISIO_API_KEY,
//         },
//       });

//       const result = response.data;

//       if (result.status !== "success") {
//         throw new Error(result.message || "Failed to get currencies");
//       }

//       res.json({ success: true, data: result.data });
//     } catch (error) {
//       console.error("Get currencies error:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }

//   // Create payment invoice for Plisio
//   static async createPayment(req, res) {
//     try {
//       const { roleId, currency = "BTC" } = req.body; // Default to BTC instead of USD
//       const userId = req.user.userId;

//       // Get role data (price, name, etc)
//       const role = await prisma.role.findUnique({ where: { id: roleId } });
//       if (!role) return res.status(404).json({ error: "Role not found" });

//       const user = await prisma.user.findUnique({ where: { userId } });
//       if (!user) return res.status(404).json({ error: "User not found" });

//       const orderId = `plisio-${Date.now()}-${Math.random()
//         .toString(36)
//         .substr(2, 9)}`;

//       // Convert IDR to USD (approximate rate, you might want to use a real-time API)
//       const usdRate = 0.000065; // 1 IDR = 0.000065 USD (approximate)
//       const amountUSD = Math.round(role.price * usdRate * 100) / 100; // Round to 2 decimal places

//       // Plisio will handle the cryptocurrency conversion automatically
//       // We don't need to calculate crypto amounts here as Plisio API will do it

//       // Create payment record (PENDING)
//       const payment = await prisma.payment.create({
//         data: {
//           orderId,
//           userId,
//           role: role.name,
//           amount: role.price, // Original IDR amount
//           adminFee: 0,
//           totalAmount: role.price,
//           status: "PENDING",
//           paymentMethod: "crypto",
//           paymentType: "plisio",
//         },
//       });

//       // Prepare invoice data for Plisio
//       // Ensure URLs are properly defined
//       const { backendUrl, frontendUrl } = getUrls();

//       // Debug logging
//       console.log("Backend URL:", backendUrl);
//       console.log("Frontend URL:", frontendUrl);
//       console.log("PLISIO_API_KEY exists:", !!PLISIO_API_KEY);
//       console.log("Order ID:", orderId);

//       const invoiceData = {
//         api_key: PLISIO_API_KEY,
//         order_name: `Role Purchase: ${role.name}`,
//         order_number: orderId,
//         source_currency: "USD",
//         source_amount: amountUSD,
//         currency: currency,
//         // Callback URLs with json=true parameter for JSON responses
//         callback_url: `${backendUrl}/api/plisio/callback?json=true`,
//         success_callback_url: `${backendUrl}/api/plisio/success?json=true`,
//         fail_callback_url: `${backendUrl}/api/plisio/fail?json=true`,
//         // Frontend redirect URLs
//         success_invoice_url: `${frontendUrl}/crypto-success/${orderId}`,
//         fail_invoice_url: `${frontendUrl}/buy-role`,
//         email: user.email,
//         description: `Purchase ${role.name} role for ${user.username}`,
//         expire_min: 60, // Invoice expires in 60 minutes
//       };

//       console.log("Invoice data:", JSON.stringify(invoiceData, null, 2));
//       console.log("Success URL:", invoiceData.success_invoice_url);

//       // Create invoice with Plisio using GET method
//       const queryParams = new URLSearchParams(invoiceData).toString();
//       const response = await axios.get(
//         `${PLISIO_BASE_URL}/invoices/new?${queryParams}`,
//         {
//           headers: {
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       const result = response.data;
//       console.log("Plisio API Response:", JSON.stringify(result, null, 2));

//       if (result.status !== "success") {
//         console.error("Plisio API Error:", result);
//         if (result.data?.message) {
//           throw new Error(result.data.message);
//         } else if (result.message) {
//           throw new Error(result.message);
//         } else {
//           throw new Error("Failed to create Plisio invoice");
//         }
//       }

//       // Update payment with Plisio response
//       await prisma.payment.update({
//         where: { orderId },
//         data: {
//           midtransTransactionId: result.data.txn_id,
//           status: mapPlisioStatusToPrisma(result.data.status),
//           midtransResponse: JSON.stringify(result.data),
//           snapRedirectUrl: result.data.invoice_url || result.data.hosted_url, // Plisio invoice URL
//         },
//       });

//       // Send to frontend
//       res.json({
//         success: true,
//         data: {
//           paymentId: payment.id,
//           orderId,
//           amount: role.price,
//           amountUSD: amountUSD,
//           currency: currency,
//           paymentMethod: "crypto",
//           hostedUrl: result.data.invoice_url || result.data.hosted_url,
//           status: result.data.status,
//           txnId: result.data.txn_id,
//         },
//       });
//     } catch (error) {
//       console.error("Create Plisio payment error:", error);
//       res.status(500).json({
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   }

//   // Get payment status from Plisio
//   static async getPaymentStatus(req, res) {
//     try {
//       const { orderId } = req.params;
//       const payment = await prisma.payment.findUnique({
//         where: { orderId: orderId },
//         include: {
//           user: true,
//           roleModel: true,
//         },
//       });

//       if (!payment) {
//         return res.status(404).json({ error: "Payment not found" });
//       }

//       // Get status from Plisio
//       const response = await axios.get(`${PLISIO_BASE_URL}/operations`, {
//         params: {
//           api_key: PLISIO_API_KEY,
//           txn_id: payment.midtransTransactionId,
//         },
//       });

//       const result = response.data;

//       if (result.status !== "success") {
//         throw new Error(result.message || "Failed to get payment status");
//       }

//       const plisioData = result.data[0]; // Get first transaction

//       // Update payment status
//       let paymentUpdate = {
//         status: mapPlisioStatusToPrisma(plisioData.status),
//         transactionStatus: plisioData.status,
//         midtransResponse: JSON.stringify(plisioData),
//         updatedAt: new Date(),
//       };

//       if (plisioData.paid_at) {
//         paymentUpdate.paidAt = new Date(plisioData.paid_at * 1000); // Convert timestamp to Date
//       }

//       // If payment is successful, update user role and send notification
//       if (
//         mapPlisioStatusToPrisma(plisioData.status) === "SUCCESS" &&
//         payment.userId
//       ) {
//         // Update user role if it's a role payment
//         if (payment.role && (payment.type === "role" || !payment.type)) {
//           await prisma.user.update({
//             where: { userId: payment.userId },
//             data: { role: payment.role },
//           });

//           // Send role purchase notification
//           const notificationController = require("./notificationController");
//           const notificationResult =
//             await notificationController.createRolePurchaseNotification(
//               payment.userId,
//               payment.user?.username || "User",
//               payment.role,
//               payment.amount,
//               payment.orderId
//             );

//           if (notificationResult.success) {
//             console.log(
//               `Plisio payment success notification sent for order ${payment.orderId}, user ${payment.userId}, role ${payment.role}`
//             );
//           } else {
//             console.log(
//               `Plisio payment notification skipped for order ${payment.orderId}: ${notificationResult.message}`
//             );
//           }

//           // Send email to admin
//           try {
//             await sendAdminPaymentSuccessEmail({
//               to: "afrizaahmad18@gmail.com",
//               type: "role",
//               username: payment.user?.username || "User",
//               email: payment.user?.email || "No email",
//               role: payment.role,
//               amount: payment.amount,
//               orderId: payment.orderId,
//               paymentMethod: "Crypto (Plisio)",
//             });
//           } catch (err) {
//             console.error("Failed to send email to admin:", err);
//           }
//         }
//       }

//       const updatedPayment = await prisma.payment.update({
//         where: { orderId: orderId },
//         data: paymentUpdate,
//         include: { user: true, roleModel: true },
//       });

//       res.json({
//         success: true,
//         data: {
//           ...updatedPayment,
//           status: plisioData.status,
//           plisioData: plisioData,
//         },
//       });
//     } catch (error) {
//       console.error("Get Plisio payment status error:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }

//   // Unified callback handler for all Plisio payment status updates
//   static async handleCallback(req, res) {
//     try {
//       console.log("Received Plisio callback");

//       let callbackData;

//       // Handle different content types
//       if (req.is("application/json")) {
//         callbackData = JSON.parse(req.body.toString());
//       } else {
//         // Handle form-encoded data
//         const formData = new URLSearchParams(req.body.toString());
//         callbackData = Object.fromEntries(formData);
//       }

//       console.log("Callback data received:", callbackData);

//       // Verify the callback data integrity
//       if (!verifyPlisioCallback(callbackData, PLISIO_API_KEY)) {
//         console.error("Callback data verification failed");
//         return res.status(422).json({
//           status: "error",
//           message: "Data verification failed",
//         });
//       }

//       console.log("Callback data verified successfully");

//       // Process the payment update
//       await processPaymentUpdate(callbackData);

//       // Respond to Plisio that callback was processed successfully
//       res.status(200).json({
//         status: "success",
//         message: "Callback processed successfully",
//       });
//     } catch (error) {
//       console.error("Error processing Plisio callback:", error);
//       res.status(500).json({
//         status: "error",
//         message: "Internal server error",
//       });
//     }
//   }

//   // Unified payment status checker for frontend
//   static async checkPaymentStatus(req, res) {
//     try {
//       const { orderId, userEmail } = req.body;
//       const userId = req.user.userId;

//       console.log(
//         `🔍 Checking payment status for orderId: ${orderId}, userEmail: ${userEmail}`
//       );

//       if (!orderId || !userEmail) {
//         return res.status(400).json({
//           success: false,
//           error: "Missing orderId or userEmail",
//         });
//       }

//       // Find payment by orderId
//       let payment = await prisma.payment.findFirst({
//         where: {
//           orderId: orderId,
//           paymentType: "plisio",
//         },
//         include: {
//           user: true,
//           roleModel: true,
//         },
//       });

//       if (!payment) {
//         console.error(`❌ Payment not found for orderId: ${orderId}`);
//         return res.status(404).json({
//           success: false,
//           error: "Payment not found",
//         });
//       }

//       // Verify that the payment belongs to the authenticated user
//       if (payment.userId !== userId) {
//         console.error(
//           `❌ Payment user mismatch: ${payment.userId} vs ${userId}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Payment does not belong to this user",
//         });
//       }

//       // Verify email matches
//       if (payment.user?.email !== userEmail) {
//         console.error(
//           `❌ Email mismatch: ${payment.user?.email} vs ${userEmail}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Email verification failed",
//         });
//       }

//       console.log(
//         `✅ Payment found: ${payment.orderId}, Current status: ${payment.status}`
//       );

//       // If payment is already successful, return the data immediately
//       if (payment.status === "SUCCESS") {
//         console.log(`✅ Payment already successful: ${payment.orderId}`);
//         return res.json({
//           success: true,
//           data: payment,
//           message: "Payment already verified and processed",
//           status: "SUCCESS",
//           shouldStopPolling: true,
//         });
//       }

//       // Check Plisio API for latest status
//       if (payment.midtransTransactionId) {
//         try {
//           console.log(
//             `🔄 Checking Plisio status for transaction: ${payment.midtransTransactionId}`
//           );

//           const response = await axios.get(`${PLISIO_BASE_URL}/operations`, {
//             params: {
//               api_key: PLISIO_API_KEY,
//               txn_id: payment.midtransTransactionId,
//             },
//           });

//           const result = response.data;

//           if (result.status === "success" && result.data.length > 0) {
//             const plisioData = result.data[0];
//             console.log(
//               `📊 Plisio status for ${payment.orderId}: ${plisioData.status}`
//             );

//             // Map Plisio status to our system
//             const mappedStatus = mapPlisioStatusToPrisma(plisioData.status);
//             console.log(
//               `🔄 Status mapping: ${plisioData.status} -> ${mappedStatus}`
//             );

//             // Update payment status
//             let paymentUpdate = {
//               status: mappedStatus,
//               transactionStatus: plisioData.status,
//               midtransResponse: JSON.stringify(plisioData),
//               updatedAt: new Date(),
//             };

//             if (plisioData.paid_at) {
//               paymentUpdate.paidAt = new Date(plisioData.paid_at * 1000);
//             }

//             // If payment is successful, update user role/star and send notifications
//             if (mappedStatus === "SUCCESS" && payment.userId) {
//               console.log(
//                 `🎉 Processing successful payment for user: ${payment.userId}`
//               );

//               const notificationController = require("./notificationController");

//               // Handle star payment
//               if (payment.type === "star" && payment.star) {
//                 console.log(
//                   `⭐ Updating user ${payment.userId} star to ${payment.star}`
//                 );

//                 await prisma.user.update({
//                   where: { userId: payment.userId },
//                   data: { star: payment.star },
//                 });

//                 // Send star upgrade notification
//                 const notificationResult =
//                   await notificationController.createStarUpgradeNotification(
//                     payment.userId,
//                     payment.user?.username || "User",
//                     payment.star,
//                     payment.amount,
//                     payment.orderId
//                   );

//                 if (notificationResult.success) {
//                   console.log(
//                     `✅ Star upgrade notification sent for order ${payment.orderId}`
//                   );
//                 } else {
//                   console.log(
//                     `⚠️ Star notification skipped: ${notificationResult.message}`
//                   );
//                 }

//                 // Send email to admin
//                 try {
//                   await sendAdminPaymentSuccessEmail({
//                     to: "afrizaahmad18@gmail.com",
//                     type: "star",
//                     username: payment.user?.username || "User",
//                     email: payment.user?.email || "No email",
//                     star: payment.star,
//                     amount: payment.amount,
//                     orderId: payment.orderId,
//                     paymentMethod: "Crypto (Plisio)",
//                     txnId: plisioData.txn_id,
//                     currency: plisioData.currency,
//                     amountReceived: plisioData.amount,
//                   });
//                 } catch (err) {
//                   console.error("❌ Failed to send email to admin:", err);
//                 }
//               }
//               // Handle role payment
//               else if (
//                 payment.role &&
//                 (payment.type === "role" || !payment.type)
//               ) {
//                 console.log(
//                   `👑 Updating user ${payment.userId} role to ${payment.role}`
//                 );

//                 await prisma.user.update({
//                   where: { userId: payment.userId },
//                   data: { role: payment.role },
//                 });

//                 // Send role purchase notification
//                 const notificationResult =
//                   await notificationController.createRolePurchaseNotification(
//                     payment.userId,
//                     payment.user?.username || "User",
//                     payment.role,
//                     payment.amount,
//                     payment.orderId
//                   );

//                 if (notificationResult.success) {
//                   console.log(
//                     `✅ Role purchase notification sent for order ${payment.orderId}`
//                   );
//                 } else {
//                   console.log(
//                     `⚠️ Role notification skipped: ${notificationResult.message}`
//                   );
//                 }

//                 // Send email to admin
//                 try {
//                   await sendAdminPaymentSuccessEmail({
//                     to: "afrizaahmad18@gmail.com",
//                     type: "role",
//                     username: payment.user?.username || "User",
//                     email: payment.user?.email || "No email",
//                     role: payment.role,
//                     amount: payment.amount,
//                     orderId: payment.orderId,
//                     paymentMethod: "Crypto (Plisio)",
//                     txnId: plisioData.txn_id,
//                     currency: plisioData.currency,
//                     amountReceived: plisioData.amount,
//                   });
//                 } catch (err) {
//                   console.error("❌ Failed to send email to admin:", err);
//                 }
//               }
//             }

//             // Update payment in database
//             const updatedPayment = await prisma.payment.update({
//               where: { id: payment.id },
//               data: paymentUpdate,
//               include: { user: true, roleModel: true },
//             });

//             console.log(
//               `✅ Payment ${updatedPayment.orderId} status updated to: ${updatedPayment.status}`
//             );

//             return res.json({
//               success: true,
//               data: updatedPayment,
//               message: `Payment status: ${mappedStatus}`,
//               status: mappedStatus,
//               shouldStopPolling:
//                 mappedStatus === "SUCCESS" ||
//                 mappedStatus === "FAILED" ||
//                 mappedStatus === "CANCELLED" ||
//                 mappedStatus === "EXPIRED",
//             });
//           } else {
//             console.log(
//               `⚠️ Plisio API returned no data for transaction: ${payment.midtransTransactionId}`
//             );
//           }
//         } catch (error) {
//           console.error("❌ Error fetching from Plisio API:", error);
//           console.error(
//             "❌ Error details:",
//             error.response?.data || error.message
//           );
//         }
//       } else {
//         console.log(
//           `⚠️ No midtransTransactionId found for payment: ${payment.orderId}`
//         );
//       }

//       // Return current payment status if no update was made
//       console.log(`📋 Returning current payment status: ${payment.status}`);
//       return res.json({
//         success: true,
//         data: payment,
//         message: `Current payment status: ${payment.status}`,
//         status: payment.status,
//         shouldStopPolling: false, // Continue polling for pending status
//       });
//     } catch (error) {
//       console.error("❌ Error in payment status check:", error);
//       res.status(500).json({
//         success: false,
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   }

//   // Test endpoint to verify your callback URL is working
//   static async testCallback(req, res) {
//     res.json({
//       status: "success",
//       message: "Plisio callback endpoint is working",
//       timestamp: new Date().toISOString(),
//     });
//   }

//   // Get all payments for user
//   static async getUserPayments(req, res) {
//     try {
//       const { userId } = req.params;

//       const payments = await prisma.payment.findMany({
//         where: {
//           userId: userId,
//           paymentType: "plisio", // Only Plisio payments
//         },
//         include: {
//           roleModel: {
//             select: {
//               name: true,
//               image: true,
//               benefit: true,
//             },
//           },
//         },
//         orderBy: { createdAt: "desc" },
//       });

//       res.json({
//         success: true,
//         data: payments,
//       });
//     } catch (error) {
//       console.error("Get user Plisio payments error:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }

//   // Get pending payment by user
//   static async getPendingPaymentByUser(req, res) {
//     try {
//       const userId = req.user.userId;
//       const pendingPayment = await prisma.payment.findFirst({
//         where: {
//           userId,
//           status: "PENDING",
//           paymentType: "plisio", // Only Plisio payments
//         },
//         orderBy: { createdAt: "desc" },
//         select: {
//           id: true,
//           orderId: true,
//           userId: true,
//           role: true,
//           amount: true,
//           type: true,
//           star: true,
//           snapRedirectUrl: true,
//           midtransResponse: true,
//           createdAt: true,
//           updatedAt: true,
//           roleModel: {
//             select: {
//               id: true,
//               name: true,
//               image: true,
//               benefit: true,
//               price: true,
//             },
//           },
//         },
//       });

//       if (pendingPayment) {
//         return res.json({ success: true, data: pendingPayment });
//       }
//       return res.json({ success: true, data: null });
//     } catch (err) {
//       return res.status(500).json({ success: false, error: "Server error" });
//     }
//   }

//   // Cancel payment
//   static async cancelPayment(req, res) {
//     try {
//       const userId = req.user.userId;
//       const { orderId } = req.params;
//       const payment = await prisma.payment.findFirst({
//         where: {
//           orderId,
//           userId,
//           status: "PENDING",
//           paymentType: "plisio", // Only Plisio payments
//         },
//       });

//       if (!payment) {
//         return res.status(404).json({
//           success: false,
//           error: "Payment not found or not cancellable",
//         });
//       }

//       await prisma.payment.update({
//         where: { id: payment.id },
//         data: { status: "CANCELLED" },
//       });

//       return res.json({ success: true, message: "Payment cancelled" });
//     } catch (err) {
//       return res.status(500).json({ success: false, error: "Server error" });
//     }
//   }
//   // New crypto callback handler for frontend verification
//   static async handleCryptoCallback(req, res) {
//     try {
//       const { orderId, userEmail } = req.body;
//       const userId = req.user.userId;

//       console.log(
//         `🔍 Crypto callback verification for orderId: ${orderId}, userEmail: ${userEmail}`
//       );

//       if (!orderId || !userEmail) {
//         return res.status(400).json({
//           success: false,
//           error: "Missing orderId or userEmail",
//         });
//       }

//       // Find payment by orderId
//       let payment = await prisma.payment.findFirst({
//         where: {
//           orderId: orderId,
//           paymentType: "plisio", // Only Plisio payments
//         },
//         include: {
//           user: true,
//           roleModel: true,
//         },
//       });

//       if (!payment) {
//         console.error(`❌ Payment not found for orderId: ${orderId}`);
//         return res.status(404).json({
//           success: false,
//           error: "Payment not found",
//         });
//       }

//       // Verify that the payment belongs to the authenticated user
//       if (payment.userId !== userId) {
//         console.error(
//           `❌ Payment user mismatch: ${payment.userId} vs ${userId}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Payment does not belong to this user",
//         });
//       }

//       // Verify email matches (additional security check)
//       if (payment.user?.email !== userEmail) {
//         console.error(
//           `❌ Email mismatch: ${payment.user?.email} vs ${userEmail}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Email verification failed",
//         });
//       }

//       console.log(
//         `✅ Payment found: ${payment.orderId}, Current status: ${payment.status}`
//       );

//       // If payment is already successful, return the data
//       if (payment.status === "SUCCESS") {
//         console.log(`✅ Payment already successful: ${payment.orderId}`);
//         return res.json({
//           success: true,
//           data: payment,
//           message: "Payment already verified",
//         });
//       }

//       // Check if we have a transaction ID to verify with Plisio
//       if (payment.midtransTransactionId) {
//         try {
//           // Get latest status from Plisio
//           const response = await axios.get(`${PLISIO_BASE_URL}/operations`, {
//             params: {
//               api_key: PLISIO_API_KEY,
//               txn_id: payment.midtransTransactionId,
//             },
//           });

//           const result = response.data;

//           if (result.status === "success" && result.data.length > 0) {
//             const plisioData = result.data[0];
//             console.log(
//               `📊 Plisio status for ${payment.orderId}: ${plisioData.status}`
//             );

//             // Map Plisio status to our system
//             const mappedStatus = mapPlisioStatusToPrisma(plisioData.status);

//             // Update payment status
//             let paymentUpdate = {
//               status: mappedStatus,
//               transactionStatus: plisioData.status,
//               midtransResponse: JSON.stringify(plisioData),
//               updatedAt: new Date(),
//             };

//             if (plisioData.paid_at) {
//               paymentUpdate.paidAt = new Date(plisioData.paid_at * 1000);
//             }

//             // If payment is successful, update user role/star and send notifications
//             if (mappedStatus === "SUCCESS" && payment.userId) {
//               console.log(
//                 `🎉 Processing successful payment for user: ${payment.userId}`
//               );

//               const notificationController = require("./notificationController");
//               // Handle role payment
//               else if (
//                 payment.role &&
//                 (payment.type === "role" || !payment.type)
//               ) {
//                 console.log(
//                   `👑 Updating user ${payment.userId} role to ${payment.role}`
//                 );

//                 await prisma.user.update({
//                   where: { userId: payment.userId },
//                   data: { role: payment.role },
//                 });

//                 // Send role purchase notification
//                 const notificationResult =
//                   await notificationController.createRolePurchaseNotification(
//                     payment.userId,
//                     payment.user?.username || "User",
//                     payment.role,
//                     payment.amount,
//                     payment.orderId
//                   );

//                 if (notificationResult.success) {
//                   console.log(
//                     `✅ Role purchase notification sent for order ${payment.orderId}`
//                   );
//                 } else {
//                   console.log(
//                     `⚠️ Role notification skipped: ${notificationResult.message}`
//                   );
//                 }

//                 // Send email to admin
//                 try {
//                   await sendAdminPaymentSuccessEmail({
//                     to: "afrizaahmad18@gmail.com",
//                     type: "role",
//                     username: payment.user?.username || "User",
//                     email: payment.user?.email || "No email",
//                     role: payment.role,
//                     amount: payment.amount,
//                     orderId: payment.orderId,
//                     paymentMethod: "Crypto (Plisio)",
//                     txnId: plisioData.txn_id,
//                     currency: plisioData.currency,
//                     amountReceived: plisioData.amount,
//                   });
//                 } catch (err) {
//                   console.error("❌ Failed to send email to admin:", err);
//                 }
//               }
//             }

//             // Update payment in database
//             const updatedPayment = await prisma.payment.update({
//               where: { id: payment.id },
//               data: paymentUpdate,
//               include: { user: true, roleModel: true },
//             });

//             console.log(
//               `✅ Payment ${updatedPayment.orderId} status updated to: ${updatedPayment.status}`
//             );

//             return res.json({
//               success: true,
//               data: updatedPayment,
//               message: `Payment status: ${mappedStatus}`,
//             });
//           } else {
//             console.log(
//               `⚠️ Plisio API returned no data for transaction: ${payment.midtransTransactionId}`
//             );
//           }
//         } catch (error) {
//           console.error("❌ Error fetching from Plisio API:", error);
//           // Continue with current payment status if Plisio API fails
//         }
//       }

//       // If no transaction ID or Plisio API failed, return current payment status
//       console.log(`📋 Returning current payment status: ${payment.status}`);
//       return res.json({
//         success: true,
//         data: payment,
//         message: `Current payment status: ${payment.status}`,
//       });
//     } catch (error) {
//       console.error("❌ Error in crypto callback:", error);
//       res.status(500).json({
//         success: false,
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   }

//   // Auto-success processor for crypto-success page redirect
//   static async handleAutoSuccess(req, res) {
//     try {
//       const { orderId, userEmail } = req.body;
//       const userId = req.user.userId;

//       console.log(
//         `🎉 Auto-success processing for orderId: ${orderId}, userEmail: ${userEmail}`
//       );

//       if (!orderId || !userEmail) {
//         return res.status(400).json({
//           success: false,
//           error: "Missing orderId or userEmail",
//         });
//       }

//       // Find payment by orderId
//       let payment = await prisma.payment.findFirst({
//         where: {
//           orderId: orderId,
//           paymentType: "plisio",
//         },
//         include: {
//           user: true,
//           roleModel: true,
//         },
//       });

//       if (!payment) {
//         console.error(`❌ Payment not found for orderId: ${orderId}`);
//         return res.status(404).json({
//           success: false,
//           error: "Payment not found",
//         });
//       }

//       // Verify that the payment belongs to the authenticated user
//       if (payment.userId !== userId) {
//         console.error(
//           `❌ Payment user mismatch: ${payment.userId} vs ${userId}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Payment does not belong to this user",
//         });
//       }

//       // Verify email matches
//       if (payment.user?.email !== userEmail) {
//         console.error(
//           `❌ Email mismatch: ${payment.user?.email} vs ${userEmail}`
//         );
//         return res.status(403).json({
//           success: false,
//           error: "Email verification failed",
//         });
//       }

//       console.log(
//         `✅ Payment found: ${payment.orderId}, Current status: ${payment.status}`
//       );

//       // If payment is already successful, return the data immediately
//       if (payment.status === "SUCCESS") {
//         console.log(`✅ Payment already successful: ${payment.orderId}`);
//         return res.json({
//           success: true,
//           data: payment,
//           message: "Payment already verified and processed",
//           status: "SUCCESS",
//           shouldStopPolling: true,
//         });
//       }

//       // Automatically set payment to SUCCESS and update user role/star
//       console.log(`🎉 Setting payment ${payment.orderId} to SUCCESS`);

//       // Update payment status to SUCCESS
//       let paymentUpdate = {
//         status: "SUCCESS",
//         transactionStatus: "completed",
//         updatedAt: new Date(),
//         paidAt: new Date(),
//       };

//       // If we have Plisio transaction data, include it
//       if (payment.midtransTransactionId) {
//         paymentUpdate.midtransResponse = JSON.stringify({
//           txn_id: payment.midtransTransactionId,
//           status: "completed",
//           paid_at: Math.floor(Date.now() / 1000),
//         });
//       }

//       // Update user role/star immediately
//       if (payment.userId) {
//         console.log(
//           `🎉 Processing successful payment for user: ${payment.userId}`
//         );

//         const notificationController = require("./notificationController");

//         // Handle star payment
//         if (payment.type === "star" && payment.star) {
//           console.log(
//             `⭐ Updating user ${payment.userId} star to ${payment.star}`
//           );

//           await prisma.user.update({
//             where: { userId: payment.userId },
//             data: { star: payment.star },
//           });

//           // Send star upgrade notification
//           const notificationResult =
//             await notificationController.createStarUpgradeNotification(
//               payment.userId,
//               payment.user?.username || "User",
//               payment.star,
//               payment.amount,
//               payment.orderId
//             );

//           if (notificationResult.success) {
//             console.log(
//               `✅ Star upgrade notification sent for order ${payment.orderId}`
//             );
//           } else {
//             console.log(
//               `⚠️ Star notification skipped: ${notificationResult.message}`
//             );
//           }

//           // Send email to admin
//           try {
//             await sendAdminPaymentSuccessEmail({
//               to: "afrizaahmad18@gmail.com",
//               type: "star",
//               username: payment.user?.username || "User",
//               email: payment.user?.email || "No email",
//               star: payment.star,
//               amount: payment.amount,
//               orderId: payment.orderId,
//               paymentMethod: "Crypto (Plisio)",
//               txnId: payment.midtransTransactionId || "Auto-success",
//               currency: "AUTO",
//               amountReceived: payment.amount,
//             });
//           } catch (err) {
//             console.error("❌ Failed to send email to admin:", err);
//           }
//         }
//         // Handle role payment
//         else if (payment.role && (payment.type === "role" || !payment.type)) {
//           console.log(
//             `👑 Updating user ${payment.userId} role to ${payment.role}`
//           );

//           await prisma.user.update({
//             where: { userId: payment.userId },
//             data: { role: payment.role },
//           });

//           // Send role purchase notification
//           const notificationResult =
//             await notificationController.createRolePurchaseNotification(
//               payment.userId,
//               payment.user?.username || "User",
//               payment.role,
//               payment.amount,
//               payment.orderId
//             );

//           if (notificationResult.success) {
//             console.log(
//               `✅ Role purchase notification sent for order ${payment.orderId}`
//             );
//           } else {
//             console.log(
//               `⚠️ Role notification skipped: ${notificationResult.message}`
//             );
//           }

//           // Send email to admin
//           try {
//             await sendAdminPaymentSuccessEmail({
//               to: "afrizaahmad18@gmail.com",
//               type: "role",
//               username: payment.user?.username || "User",
//               email: payment.user?.email || "No email",
//               role: payment.role,
//               amount: payment.amount,
//               orderId: payment.orderId,
//               paymentMethod: "Crypto (Plisio)",
//               txnId: payment.midtransTransactionId || "Auto-success",
//               currency: "AUTO",
//               amountReceived: payment.amount,
//             });
//           } catch (err) {
//             console.error("❌ Failed to send email to admin:", err);
//           }
//         }
//       }

//       // Update payment in database
//       const updatedPayment = await prisma.payment.update({
//         where: { id: payment.id },
//         data: paymentUpdate,
//         include: { user: true, roleModel: true },
//       });

//       console.log(
//         `✅ Payment ${updatedPayment.orderId} status updated to: ${updatedPayment.status}`
//       );

//       return res.json({
//         success: true,
//         data: updatedPayment,
//         message: "Payment automatically set to SUCCESS",
//         status: "SUCCESS",
//         shouldStopPolling: true,
//       });
//     } catch (error) {
//       console.error("❌ Error in auto-success:", error);
//       res.status(500).json({
//         success: false,
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   }
// }

// module.exports = PlisioController;
