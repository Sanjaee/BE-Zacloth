const redisConfig = require("../config/redisConfig");

/**
 * Redis Cache Middleware
 * Provides caching functionality for Express routes
 */

// Cache middleware for GET requests
const cacheMiddleware = (options = {}) => {
  const {
    ttl = 3600, // Time to live in seconds (default: 1 hour)
    keyGenerator = null, // Custom key generator function
    skipCache = false, // Skip cache condition function
    cacheCondition = null, // Condition to determine if response should be cached
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Skip cache if Redis is not connected
    if (!redisConfig.isRedisConnected()) {
      return next();
    }

    // Skip cache if skipCache function returns true
    if (skipCache && typeof skipCache === "function" && skipCache(req)) {
      return next();
    }

    try {
      // Generate cache key
      let cacheKey;
      if (keyGenerator && typeof keyGenerator === "function") {
        cacheKey = keyGenerator(req);
      } else {
        cacheKey = generateDefaultCacheKey(req);
      }

      // Try to get cached data
      const cachedData = await redisConfig.get(cacheKey);

      if (cachedData !== null) {
        console.log(`Cache HIT for key: ${cacheKey}`);
        return res.json(cachedData);
      }

      console.log(`Cache MISS for key: ${cacheKey}`);

      // Store original res.json method
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function (data) {
        // Check if response should be cached
        if (cacheCondition && typeof cacheCondition === "function") {
          if (!cacheCondition(req, res, data)) {
            return originalJson.call(this, data);
          }
        }

        // Cache the response
        redisConfig.set(cacheKey, data, ttl).catch((error) => {
          console.error("Failed to cache response:", error);
        });

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error);
      next();
    }
  };
};

// Generate default cache key based on request
const generateDefaultCacheKey = (req) => {
  const baseKey = `${req.method}:${req.originalUrl}`;
  const queryString = req.query ? JSON.stringify(req.query) : "";
  const userKey = req.user ? `:user:${req.user.id}` : "";
  return `cache:${baseKey}${userKey}:${Buffer.from(queryString).toString(
    "base64"
  )}`;
};

// Cache invalidation middleware
const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store original res.json method
    const originalJson = res.json;

    // Override res.json to invalidate cache after successful response
    res.json = function (data) {
      // Only invalidate cache for successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidateCachePatterns(patterns, req).catch((error) => {
          console.error("Failed to invalidate cache:", error);
        });
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

// Helper function to invalidate cache patterns
const invalidateCachePatterns = async (patterns, req) => {
  if (!redisConfig.isRedisConnected()) {
    return;
  }

  try {
    for (const pattern of patterns) {
      let cachePattern;

      if (typeof pattern === "function") {
        cachePattern = pattern(req);
      } else {
        cachePattern = pattern;
      }

      if (cachePattern) {
        const deletedCount = await redisConfig.invalidatePattern(cachePattern);
        console.log(
          `Invalidated ${deletedCount} cache entries for pattern: ${cachePattern}`
        );
      }
    }
  } catch (error) {
    console.error("Error invalidating cache patterns:", error);
  }
};

// Cache warming middleware
const warmCache = (keyGenerator, dataFetcher, ttl = 3600) => {
  return async (req, res, next) => {
    if (!redisConfig.isRedisConnected()) {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);
      const exists = await redisConfig.exists(cacheKey);

      if (!exists) {
        const data = await dataFetcher(req);
        if (data) {
          await redisConfig.set(cacheKey, data, ttl);
          console.log(`Cache warmed for key: ${cacheKey}`);
        }
      }
    } catch (error) {
      console.error("Cache warming error:", error);
    }

    next();
  };
};

// Cache statistics middleware
const cacheStats = () => {
  return async (req, res, next) => {
    if (!redisConfig.isRedisConnected()) {
      return next();
    }

    try {
      const stats = {
        connected: redisConfig.isRedisConnected(),
        ping: await redisConfig.ping(),
        timestamp: new Date().toISOString(),
      };

      // Add stats to response headers
      res.set("X-Cache-Status", stats.connected ? "connected" : "disconnected");
      res.set("X-Cache-Ping", stats.ping ? "ok" : "failed");
    } catch (error) {
      console.error("Cache stats error:", error);
    }

    next();
  };
};

// Product-specific cache patterns
const productCachePatterns = {
  // Invalidate all product-related caches
  invalidateAll: (req) => [
    "cache:GET:/api/products*",
    "cache:GET:/api/products/*",
    "cache:GET:/api/products/checkout/*",
  ],

  // Invalidate specific product cache
  invalidateProduct: (req) => [
    `cache:GET:/api/products/${req.params.id}*`,
    `cache:GET:/api/products/checkout/${req.params.id}*`,
  ],

  // Invalidate product list caches
  invalidateProductList: (req) => ["cache:GET:/api/products*"],
};

// User-specific cache patterns
const userCachePatterns = {
  // Invalidate user-specific caches
  invalidateUser: (req) => [`cache:*:user:${req.user?.id}*`],
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  warmCache,
  cacheStats,
  productCachePatterns,
  userCachePatterns,
  generateDefaultCacheKey,
};
