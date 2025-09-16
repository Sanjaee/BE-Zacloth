const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class RajaOngkirController {
  constructor() {
    this.baseURL = "https://rajaongkir.komerce.id/api/v1";
    this.apiKey =
      process.env.RAJAONGKIR_API_KEY || "S22uXwSr53c4e8701e04109bTXubL4zi";

    if (!this.apiKey) {
      console.warn("RAJAONGKIR_API_KEY not found in environment variables");
    }
  }

  // Get all provinces
  async getProvinces(req, res) {
    try {
      const url = `${this.baseURL}/destination/province`;

      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
          key: this.apiKey,
        },
      });

      res.json({
        success: true,
        data: response.data.data,
      });
    } catch (error) {
      console.error(
        "Error fetching provinces:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Failed to fetch provinces",
        error: error.response?.data || error.message,
      });
    }
  }

  // Get cities by province ID
  async getCities(req, res) {
    try {
      // Support both /cities?province=12 and /cities/12
      const province = req.params.province || req.query.province;

      if (!province) {
        return res.status(400).json({
          success: false,
          message: "Province ID is required",
        });
      }

      const url = `${this.baseURL}/destination/city/${province}`;

      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
          key: this.apiKey,
        },
      });

      res.json({
        success: true,
        data: response.data.data,
      });
    } catch (error) {
      console.error(
        "Error fetching cities:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Failed to fetch cities",
        error: error.response?.data || error.message,
      });
    }
  }

  // Get shipping cost
  async getCost(req, res) {
    try {
      const { origin, destination, weight, courier } = req.body;

      // Validation
      if (!origin || !destination || !weight || !courier) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required parameters: origin, destination, weight, courier",
        });
      }

      const params = new URLSearchParams();
      params.append("origin", origin);
      params.append("destination", destination);
      params.append("weight", String(weight));
      params.append("courier", courier);

      const response = await axios.post(
        `${this.baseURL}/calculate/district/domestic-cost`,
        params,
        {
          headers: {
            accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            key: this.apiKey,
          },
        }
      );

      res.json({
        success: true,
        data: response.data.data,
      });
    } catch (error) {
      console.error(
        "Error fetching shipping cost:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Failed to fetch shipping cost",
        error: error.response?.data || error.message,
      });
    }
  }

  // Get districts by city id
  async getDistricts(req, res) {
    try {
      const { cityId } = req.params;

      if (!cityId) {
        return res.status(400).json({
          success: false,
          message: "City ID is required",
        });
      }

      const url = `${this.baseURL}/destination/district/${cityId}`;
      const response = await axios.get(url, {
        headers: {
          accept: "application/json",
          key: this.apiKey,
        },
      });

      res.json({ success: true, data: response.data.data });
    } catch (error) {
      console.error(
        "Error fetching districts:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Failed to fetch districts",
        error: error.response?.data || error.message,
      });
    }
  }

  // Get available couriers
  async getCouriers(req, res) {
    try {
      // Based on Komerce API response format
      const couriers = [
        {
          code: "lion",
          name: "Lion Parcel",
          services: ["JAGOPACK"],
        },
        {
          code: "jnt",
          name: "J&T Express",
          services: ["EZ"],
        },
        {
          code: "jne",
          name: "Jalur Nugraha Ekakurir (JNE)",
          services: ["OKE", "REG", "SPS", "YES"],
        },
        {
          code: "pos",
          name: "POS Indonesia",
          services: [
            "Paket Kilat Khusus",
            "Express Next Day Barang",
            "Surat Kilat Khusus",
            "Express Next Day Surat",
          ],
        },
        {
          code: "tiki",
          name: "Citra Van Titipan Kilat (TIKI)",
          services: ["ECO", "REG", "ONS", "HDS"],
        },
      ];

      res.json({
        success: true,
        data: couriers,
      });
    } catch (error) {
      console.error("Error fetching couriers:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to fetch couriers",
        error: error.message,
      });
    }
  }

  // Simulate payment with shipping cost calculation
  async simulatePayment(req, res) {
    try {
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
      } = req.body;

      // Validation
      if (
        !userId ||
        !productId ||
        !addressId ||
        !origin ||
        !destination ||
        !weight ||
        !courier ||
        !service ||
        !productPrice
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required parameters",
        });
      }

      // Dummy shipping cost calculation (no external API)
      const baseRatePerKg = {
        lion: 11000,
        jnt: 9000,
        jne: 10000,
        pos: 8000,
        tiki: 8500,
      };
      const serviceMultiplier = {
        REG: 1,
        YES: 1.5,
        OKE: 0.85,
        SPS: 2.0,
        EZ: 1,
        JAGOPACK: 1,
      };

      const kg = Math.max(1, Math.ceil(Number(weight) / 1000));
      const rate = baseRatePerKg[courier] || 10000;
      const multiplier = serviceMultiplier[service] || 1;
      const shippingCost = Math.round(rate * kg * multiplier);

      const adminFee = Math.round(productPrice * 0.05);
      const totalAmount = productPrice + shippingCost + adminFee;

      // Persist to DB: create payment and shipment
      const orderId = `ORDER_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Basic existence checks (optional)
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

      const createdPayment = await prisma.payment.create({
        data: {
          orderId,
          userId,
          productId,
          role: "client",
          amount: productPrice,
          adminFee,
          totalAmount,
          paymentMethod: "bank_transfer",
          paymentType: "bank_transfer",
          status: "SUCCESS",
          paidAt: new Date(),
          transactionId: `TXN_${Date.now()}`,
          midtransTransactionId: `MID_${Date.now()}`,
          transactionStatus: "capture",
          fraudStatus: "accept",
          type: "role",
        },
      });

      const createdShipment = await prisma.shipment.create({
        data: {
          courier,
          service,
          description: `${courier.toUpperCase()} ${service}`,
          weight,
          cost: shippingCost,
          etd: "2-3 hari",
          note: "Dummy shipping cost",
          addressId,
          paymentId: createdPayment.id,
        },
      });

      res.json({
        success: true,
        message: "Payment simulation successful (dummy)",
        data: {
          payment: createdPayment,
          shipment: createdShipment,
          summary: {
            productPrice,
            shippingCost,
            adminFee,
            totalAmount,
          },
        },
      });
    } catch (error) {
      console.error(
        "Error in payment simulation:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Payment simulation failed",
        error: error.response?.data || error.message,
      });
    }
  }
}

module.exports = new RajaOngkirController();
