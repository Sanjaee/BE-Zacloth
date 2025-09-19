const express = require("express");
const router = express.Router();
const rajaOngkirController = require("../controllers/rajaOngkirController");
const { authenticateToken } = require("../middleware/auth");

// Public routes (no authentication required)
router.get(
  "/provinces",
  rajaOngkirController.getProvinces.bind(rajaOngkirController)
);
router.get(
  "/cities",
  rajaOngkirController.getCities.bind(rajaOngkirController)
);
// Support path param: /cities/:province
router.get(
  "/cities/:province",
  rajaOngkirController.getCities.bind(rajaOngkirController)
);
router.get(
  "/couriers",
  rajaOngkirController.getCouriers.bind(rajaOngkirController)
);

// Districts by city
router.get(
  "/districts/:cityId",
  rajaOngkirController.getDistricts.bind(rajaOngkirController)
);

// Protected routes (authentication required)
router.post(
  "/cost",
  authenticateToken,
  rajaOngkirController.getCost.bind(rajaOngkirController)
);

// Public route for guest users (temporary solution)
router.post(
  "/cost-guest",
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
  rajaOngkirController.createUserAddress.bind(rajaOngkirController)
);
router.put(
  "/addresses/:id",
  authenticateToken,
  rajaOngkirController.updateUserAddress.bind(rajaOngkirController)
);
router.delete(
  "/addresses/:id",
  authenticateToken,
  rajaOngkirController.deleteUserAddress.bind(rajaOngkirController)
);

module.exports = router;
