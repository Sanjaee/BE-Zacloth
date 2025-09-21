const express = require("express");
const router = express.Router();
const rajaOngkirController = require("../controllers/rajaOngkirController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { invalidateCache } = require("../middleware/redisCache");

// Protected routes (authentication required) - All RajaOngkir endpoints now require JWT
router.get(
  "/provinces",
  authenticateToken,
  rajaOngkirController.getProvinces.bind(rajaOngkirController)
);
router.get(
  "/cities",
  authenticateToken,
  rajaOngkirController.getCities.bind(rajaOngkirController)
);
// Support path param: /cities/:province
router.get(
  "/cities/:province",
  authenticateToken,
  rajaOngkirController.getCities.bind(rajaOngkirController)
);
router.get(
  "/couriers",
  authenticateToken,
  rajaOngkirController.getCouriers.bind(rajaOngkirController)
);

// Districts by city
router.get(
  "/districts/:cityId",
  authenticateToken,
  rajaOngkirController.getDistricts.bind(rajaOngkirController)
);

// Protected routes (authentication required)
router.post(
  "/cost",
  authenticateToken,
  rajaOngkirController.getCost.bind(rajaOngkirController)
);

// Address routes (authentication required)
router.get(
  "/addresses",
  authenticateToken,
  rajaOngkirController.getUserAddresses.bind(rajaOngkirController)
);
router.post(
  "/addresses",
  authenticateToken,
  invalidateCache((req) => [`rajaongkir:user:${req.user?.id}:addresses`]),
  rajaOngkirController.createUserAddress.bind(rajaOngkirController)
);
router.put(
  "/addresses/:id",
  authenticateToken,
  invalidateCache((req) => [`rajaongkir:user:${req.user?.id}:addresses`]),
  rajaOngkirController.updateUserAddress.bind(rajaOngkirController)
);
router.delete(
  "/addresses/:id",
  authenticateToken,
  invalidateCache((req) => [`rajaongkir:user:${req.user?.id}:addresses`]),
  rajaOngkirController.deleteUserAddress.bind(rajaOngkirController)
);

// Cache management routes (admin only)
router.delete(
  "/cache/clear",
  authenticateToken,
  requireAdmin,
  rajaOngkirController.clearRajaOngkirCache.bind(rajaOngkirController)
);
router.get(
  "/cache/stats",
  authenticateToken,
  requireAdmin,
  rajaOngkirController.getRajaOngkirCacheStats.bind(rajaOngkirController)
);

module.exports = router;
