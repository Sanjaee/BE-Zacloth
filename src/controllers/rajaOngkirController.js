const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class RajaOngkirController {
  constructor() {
    this.baseURL = "https://rajaongkir.komerce.id/api/v1";
    this.apiKey =
      process.env.RAJAONGKIR_API_KEY || "f45c51babc67486d773514b6d4ba92f2";

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

      // Check if it's a specific RajaOngkir API error
      const errorData = error.response?.data;
      if (errorData?.meta?.code === 404) {
        res.status(400).json({
          success: false,
          message: "Shipping service not available for this route",
          error: "SHIPPING_SERVICE_UNAVAILABLE",
          details:
            errorData?.meta?.message ||
            "The selected courier service is not available for this destination",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to calculate shipping cost",
          error: "SHIPPING_CALCULATION_FAILED",
          details: error.response?.data || error.message,
        });
      }
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

  // Get user addresses (authenticated users only)
  async getUserAddresses(req, res) {
    try {
      const userId = req.user.id;

      // Get user addresses
      const addresses = await prisma.userAddress.findMany({
        where: { userId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
      });

      res.json({
        success: true,
        addresses,
        hasAddresses: addresses.length > 0,
      });
    } catch (error) {
      console.error("Error fetching user addresses:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user addresses",
        error: error.message,
      });
    }
  }

  // Create user address (authenticated users only)
  async createUserAddress(req, res) {
    try {
      const userId = req.user.id;
      const {
        recipientName,
        phoneNumber,
        provinceId,
        provinceName,
        cityId,
        cityName,
        subdistrictId,
        subdistrictName,
        postalCode,
        addressDetail,
        isPrimary = false,
      } = req.body;

      // Validation
      if (
        !recipientName ||
        !phoneNumber ||
        !provinceId ||
        !cityId ||
        !addressDetail
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: recipientName, phoneNumber, provinceId, cityId, addressDetail",
        });
      }

      // Check if user already has 1 address (maximum limit)
      const existingAddressesCount = await prisma.userAddress.count({
        where: { userId },
      });

      if (existingAddressesCount >= 1) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum of 1 address allowed. Please update your existing address instead.",
        });
      }

      // If this is set as primary, unset other primary addresses
      if (isPrimary) {
        await prisma.userAddress.updateMany({
          where: { userId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Create new address
      const newAddress = await prisma.userAddress.create({
        data: {
          userId,
          recipientName,
          phoneNumber,
          provinceId: parseInt(provinceId),
          provinceName,
          cityId: parseInt(cityId),
          cityName,
          subdistrictId: subdistrictId ? parseInt(subdistrictId) : null,
          subdistrictName,
          postalCode,
          addressDetail,
          isPrimary,
        },
      });

      res.json({
        success: true,
        message: "Address created successfully",
        address: newAddress,
      });
    } catch (error) {
      console.error("Error creating user address:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create address",
        error: error.message,
      });
    }
  }

  // Update user address (authenticated users only)
  async updateUserAddress(req, res) {
    try {
      const userId = req.user.id;
      const addressId = req.params.id;
      const {
        recipientName,
        phoneNumber,
        provinceId,
        provinceName,
        cityId,
        cityName,
        subdistrictId,
        subdistrictName,
        postalCode,
        addressDetail,
        isPrimary = false,
      } = req.body;

      // Validation
      if (
        !recipientName ||
        !phoneNumber ||
        !provinceId ||
        !cityId ||
        !addressDetail
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: recipientName, phoneNumber, provinceId, cityId, addressDetail",
        });
      }

      // Check if address exists and belongs to user
      const existingAddress = await prisma.userAddress.findFirst({
        where: { id: addressId, userId },
      });

      if (!existingAddress) {
        return res.status(400).json({
          success: false,
          message: "Address not found",
        });
      }

      // If this is set as primary, unset other primary addresses
      if (isPrimary) {
        await prisma.userAddress.updateMany({
          where: { userId, isPrimary: true, id: { not: addressId } },
          data: { isPrimary: false },
        });
      }

      // Update address
      const updatedAddress = await prisma.userAddress.update({
        where: { id: addressId },
        data: {
          recipientName,
          phoneNumber,
          provinceId: parseInt(provinceId),
          provinceName,
          cityId: parseInt(cityId),
          cityName,
          subdistrictId: subdistrictId ? parseInt(subdistrictId) : null,
          subdistrictName,
          postalCode,
          addressDetail,
          isPrimary,
        },
      });

      res.json({
        success: true,
        message: "Address updated successfully",
        address: updatedAddress,
      });
    } catch (error) {
      console.error("Error updating user address:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update address",
        error: error.message,
      });
    }
  }

  // Delete user address (authenticated users only)
  async deleteUserAddress(req, res) {
    try {
      const userId = req.user.id;
      const addressId = req.params.id;

      // Check if address exists and belongs to user
      const existingAddress = await prisma.userAddress.findFirst({
        where: { id: addressId, userId },
      });

      if (!existingAddress) {
        return res.status(400).json({
          success: false,
          message: "Address not found",
        });
      }

      // Delete address
      await prisma.userAddress.delete({
        where: { id: addressId },
      });

      res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting user address:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete address",
        error: error.message,
      });
    }
  }
}

module.exports = new RajaOngkirController();
