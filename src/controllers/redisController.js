const { checkRedisHealth } = require('../config/redisInit');
const redisConfig = require('../config/redisConfig');

/**
 * Redis Health Check Controller
 * Provides endpoints to monitor Redis status and performance
 */

// Health check endpoint
const healthCheck = async (req, res) => {
  try {
    const health = await checkRedisHealth();
    
    res.json({
      success: true,
      redis: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check Redis health',
      error: error.message
    });
  }
};

// Get Redis statistics
const getStats = async (req, res) => {
  try {
    if (!redisConfig.isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected'
      });
    }

    const client = redisConfig.getClient();
    
    // Get Redis info
    const info = await client.info();
    
    // Parse info into sections
    const infoSections = {};
    const lines = info.split('\r\n');
    let currentSection = '';
    
    for (const line of lines) {
      if (line.startsWith('#')) {
        currentSection = line.substring(2);
        infoSections[currentSection] = {};
      } else if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (currentSection) {
          infoSections[currentSection][key] = value;
        }
      }
    }

    // Get memory usage
    const memoryUsage = await client.memoryUsage();
    
    // Get database size
    const dbSize = await client.dbSize();

    res.json({
      success: true,
      stats: {
        connected: redisConfig.isRedisConnected(),
        dbSize,
        memoryUsage,
        info: infoSections
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get Redis statistics',
      error: error.message
    });
  }
};

// Clear all caches
const clearCache = async (req, res) => {
  try {
    if (!redisConfig.isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected'
      });
    }

    const result = await redisConfig.flushAll();
    
    if (result) {
      res.json({
        success: true,
        message: 'All caches cleared successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear caches'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear caches',
      error: error.message
    });
  }
};

// Clear specific cache pattern
const clearCachePattern = async (req, res) => {
  try {
    const { pattern } = req.params;
    
    if (!pattern) {
      return res.status(400).json({
        success: false,
        message: 'Cache pattern is required'
      });
    }

    if (!redisConfig.isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected'
      });
    }

    const deletedCount = await redisConfig.invalidatePattern(pattern);
    
    res.json({
      success: true,
      message: `Cleared ${deletedCount} cache entries matching pattern: ${pattern}`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache pattern',
      error: error.message
    });
  }
};

// Get cache keys by pattern
const getCacheKeys = async (req, res) => {
  try {
    const { pattern = '*' } = req.query;
    
    if (!redisConfig.isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected'
      });
    }

    const keys = await redisConfig.keys(pattern);
    
    res.json({
      success: true,
      keys,
      count: keys.length,
      pattern
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get cache keys',
      error: error.message
    });
  }
};

// Get cache value by key
const getCacheValue = async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Cache key is required'
      });
    }

    if (!redisConfig.isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected'
      });
    }

    const value = await redisConfig.get(key);
    
    if (value === null) {
      return res.status(404).json({
        success: false,
        message: 'Cache key not found'
      });
    }

    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get cache value',
      error: error.message
    });
  }
};

module.exports = {
  healthCheck,
  getStats,
  clearCache,
  clearCachePattern,
  getCacheKeys,
  getCacheValue
};
