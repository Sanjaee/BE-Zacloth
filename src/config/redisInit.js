const redisConfig = require("./redisConfig");

/**
 * Initialize Redis connection
 * This should be called when the application starts
 */
const initializeRedis = async () => {
  try {
    console.log("Initializing Redis connection...");
    await redisConfig.connect();
    console.log("Redis connection initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Redis connection:", error);
    console.log("Application will continue without Redis caching");
    return false;
  }
};

/**
 * Gracefully close Redis connection
 * This should be called when the application shuts down
 */
const closeRedis = async () => {
  try {
    console.log("Closing Redis connection...");
    await redisConfig.disconnect();
    console.log("Redis connection closed successfully");
  } catch (error) {
    console.error("Error closing Redis connection:", error);
  }
};

/**
 * Health check for Redis
 */
const checkRedisHealth = async () => {
  try {
    if (!redisConfig.isRedisConnected()) {
      return { status: "disconnected", message: "Redis is not connected" };
    }

    const pingResult = await redisConfig.ping();
    if (pingResult) {
      return {
        status: "healthy",
        message: "Redis is connected and responding",
      };
    } else {
      return {
        status: "unhealthy",
        message: "Redis is connected but not responding to ping",
      };
    }
  } catch (error) {
    return { status: "error", message: error.message };
  }
};

module.exports = {
  initializeRedis,
  closeRedis,
  checkRedisHealth,
};
