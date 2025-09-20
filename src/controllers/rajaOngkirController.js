const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const redisConfig = require("../config/redisConfig");
const prisma = new PrismaClient();

class RajaOngkirController {
  constructor() {
    this.baseURL = "https://rajaongkir.komerce.id/api/v1";
    this.apiKey =
      process.env.RAJAONGKIR_API_KEY || "f45c51babc67486d773514b6d4ba92f2";

    if (!this.apiKey) {
      console.warn("RAJAONGKIR_API_KEY not found in environment variables");
    }

    // Cache TTL settings (in seconds) - Optimized for API Hit Reduction
    this.cacheTTL = {
      // Global caches (shared across all users) - LONG TTL untuk hemat API
      provinces: 604800, // 7 days - provinces almost never change
      cities: 259200, // 3 days - cities rarely change
      districts: 259200, // 3 days - districts rarely change
      couriers: 86400, // 24 hours - couriers change occasionally

      // User-specific caches (isolated per user)
      userCost: 3600, // 1 hour - shipping costs per user
      userAddresses: 7200, // 2 hours - user addresses

      // Session caches (temporary)
      session: 1800, // 30 minutes - session data
    };
  }

  // Helper method to get cached data or fetch from API
  async getCachedData(cacheKey, fetchFunction, ttl = 3600) {
    try {
      // Try to get from cache first
      if (redisConfig.isRedisConnected()) {
        const cachedData = await redisConfig.get(cacheKey);
        if (cachedData) {
          console.log(`Cache HIT for RajaOngkir: ${cacheKey}`);
          return cachedData;
        }
      }

      console.log(`Cache MISS for RajaOngkir: ${cacheKey}`);

      // Fetch from API
      const data = await fetchFunction();

      // Cache the result
      if (redisConfig.isRedisConnected() && data) {
        await redisConfig.set(cacheKey, data, ttl);
        console.log(`Cached RajaOngkir data: ${cacheKey} for ${ttl} seconds`);
      }

      return data;
    } catch (error) {
      console.error(`Error in getCachedData for ${cacheKey}:`, error);
      // Fallback to direct API call if caching fails
      return await fetchFunction();
    }
  }

  // Helper method for user-specific caching (Enterprise Standard)
  async getUserCachedData(userId, cacheKey, fetchFunction, ttl = 3600) {
    const userCacheKey = `rajaongkir:user:${userId}:${cacheKey}`;
    return await this.getCachedData(userCacheKey, fetchFunction, ttl);
  }

  // Helper method for global caching (shared across users)
  async getGlobalCachedData(cacheKey, fetchFunction, ttl = 3600) {
    const globalCacheKey = `rajaongkir:global:${cacheKey}`;
    return await this.getCachedData(globalCacheKey, fetchFunction, ttl);
  }

  // Get all provinces (Global Cache - Enterprise Standard)
  async getProvinces(req, res) {
    try {
      const data = await this.getGlobalCachedData(
        "provinces",
        async () => {
          const url = `${this.baseURL}/destination/province`;
          const response = await axios.get(url, {
            headers: {
              accept: "application/json",
              key: this.apiKey,
            },
          });
          return response.data.data;
        },
        this.cacheTTL.provinces
      );

      res.json({
        success: true,
        data: data,
        cacheType: "global", // Indicate cache type
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

  // Get cities by province ID (Global Cache - Enterprise Standard)
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

      const data = await this.getGlobalCachedData(
        `cities:${province}`,
        async () => {
          const url = `${this.baseURL}/destination/city/${province}`;
          const response = await axios.get(url, {
            headers: {
              accept: "application/json",
              key: this.apiKey,
            },
          });
          return response.data.data;
        },
        this.cacheTTL.cities
      );

      res.json({
        success: true,
        data: data,
        cacheType: "global", // Indicate cache type
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

  // Get shipping cost (User-Specific Cache - Enterprise Standard)
  async getCost(req, res) {
    try {
      const { origin, destination, weight, courier } = req.body;
      const userId = req.user?.id || "anonymous"; // Support anonymous users

      // Validation
      if (!origin || !destination || !weight || !courier) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required parameters: origin, destination, weight, courier",
        });
      }

      // Create user-specific cache key
      const cacheKey = `cost:${origin}:${destination}:${weight}:${courier}`;

      const data = await this.getUserCachedData(
        userId,
        cacheKey,
        async () => {
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
          return response.data.data;
        },
        this.cacheTTL.userCost
      );

      res.json({
        success: true,
        data: data,
        cacheType: "user-specific", // Indicate cache type
        userId: userId,
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

      const cacheKey = `rajaongkir:districts:${cityId}`;

      const data = await this.getCachedData(
        cacheKey,
        async () => {
          const url = `${this.baseURL}/destination/district/${cityId}`;
          const response = await axios.get(url, {
            headers: {
              accept: "application/json",
              key: this.apiKey,
            },
          });
          return response.data.data;
        },
        this.cacheTTL.districts
      );

      res.json({ success: true, data: data });
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
      const cacheKey = "rajaongkir:couriers";

      const data = await this.getCachedData(
        cacheKey,
        async () => {
          // Based on Komerce API response format
          return [
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
        },
        this.cacheTTL.couriers
      );

      res.json({
        success: true,
        data: data,
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

  // Get user addresses (User-Specific Cache - Enterprise Standard)
  async getUserAddresses(req, res) {
    try {
      const userId = req.user.id;

      const addresses = await this.getUserCachedData(
        userId,
        "addresses",
        async () => {
          // Get user addresses from database
          return await prisma.userAddress.findMany({
            where: { userId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          });
        },
        this.cacheTTL.userAddresses
      );

      res.json({
        success: true,
        addresses,
        hasAddresses: addresses.length > 0,
        cacheType: "user-specific", // Indicate cache type
        userId: userId,
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

      // Invalidate user address cache
      if (redisConfig.isRedisConnected()) {
        await redisConfig.del(`rajaongkir:user:${userId}:addresses`);
        console.log(`Invalidated user address cache for user: ${userId}`);
      }

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

      // Invalidate user address cache
      if (redisConfig.isRedisConnected()) {
        await redisConfig.del(`rajaongkir:user:${userId}:addresses`);
        console.log(`Invalidated user address cache for user: ${userId}`);
      }

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

      // Invalidate user address cache
      if (redisConfig.isRedisConnected()) {
        await redisConfig.del(`rajaongkir:user:${userId}:addresses`);
        console.log(`Invalidated user address cache for user: ${userId}`);
      }

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

  // Clear RajaOngkir cache (admin only)
  async clearRajaOngkirCache(req, res) {
    try {
      if (!redisConfig.isRedisConnected()) {
        return res.status(503).json({
          success: false,
          message: "Redis is not connected",
        });
      }

      // Get all RajaOngkir cache keys (Enterprise Standard)
      const patterns = [
        "rajaongkir:global:*", // Global caches
        "rajaongkir:user:*", // User-specific caches
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        const deletedCount = await redisConfig.invalidatePattern(pattern);
        totalDeleted += deletedCount;
      }

      res.json({
        success: true,
        message: `Cleared ${totalDeleted} RajaOngkir cache entries`,
        deletedCount: totalDeleted,
      });
    } catch (error) {
      console.error("Error clearing RajaOngkir cache:", error);
      res.status(500).json({
        success: false,
        message: "Failed to clear RajaOngkir cache",
        error: error.message,
      });
    }
  }

  // Get RajaOngkir cache statistics
  async getRajaOngkirCacheStats(req, res) {
    try {
      if (!redisConfig.isRedisConnected()) {
        return res.status(503).json({
          success: false,
          message: "Redis is not connected",
        });
      }

      const patterns = [
        "rajaongkir:global:*", // Global caches
        "rajaongkir:user:*", // User-specific caches
      ];

      const stats = {};
      let totalKeys = 0;

      for (const pattern of patterns) {
        const keys = await redisConfig.keys(pattern);
        stats[pattern] = keys.length;
        totalKeys += keys.length;
      }

      res.json({
        success: true,
        cacheStats: {
          totalKeys,
          breakdown: stats,
          patterns: patterns,
        },
      });
    } catch (error) {
      console.error("Error getting RajaOngkir cache stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get RajaOngkir cache stats",
        error: error.message,
      });
    }
  }
}

module.exports = new RajaOngkirController();
