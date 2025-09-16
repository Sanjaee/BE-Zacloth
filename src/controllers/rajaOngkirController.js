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
}

module.exports = new RajaOngkirController();
