require("dotenv").config();

const { createClient } = require("redis");

class RedisConfig {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  buildRedisUrl() {
    const host = process.env.REDIS_HOST || "localhost";
    const port = process.env.REDIS_PORT || 6379;
    const password = process.env.REDIS_PASSWORD;
    const db = process.env.REDIS_DB || 0;

    // Only include password if it's not empty
    if (password && password.trim() !== "") {
      return `redis://:${password}@${host}:${port}/${db}`;
    } else {
      return `redis://${host}:${port}/${db}`;
    }
  }

  async connect() {
    try {
      // Build Redis URL
      const redisUrl = this.buildRedisUrl();

      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error("Redis max retry attempts reached");
              return new Error("Max retries reached");
            }
            return Math.min(retries * 100, 3000);
          },
          connectTimeout: 10000,
          lazyConnect: true,
        },
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        console.log("Redis Client Connected");
        this.isConnected = true;
      });

      this.client.on("ready", () => {
        console.log("Redis Client Ready");
        this.isConnected = true;
      });

      this.client.on("end", () => {
        console.log("Redis Client Disconnected");
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  getClient() {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis client is not connected");
    }
    return this.client;
  }

  isRedisConnected() {
    return this.isConnected;
  }

  // Cache methods
  async set(key, value, expireInSeconds = 3600) {
    try {
      const client = this.getClient();
      const serializedValue = JSON.stringify(value);
      await client.setEx(key, expireInSeconds, serializedValue);
      return true;
    } catch (error) {
      console.error("Redis SET error:", error);
      return false;
    }
  }

  async get(key) {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("Redis GET error:", error);
      return null;
    }
  }

  async del(key) {
    try {
      const client = this.getClient();
      await client.del(key);
      return true;
    } catch (error) {
      console.error("Redis DEL error:", error);
      return false;
    }
  }

  async exists(key) {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error("Redis EXISTS error:", error);
      return false;
    }
  }

  async expire(key, seconds) {
    try {
      const client = this.getClient();
      await client.expire(key, seconds);
      return true;
    } catch (error) {
      console.error("Redis EXPIRE error:", error);
      return false;
    }
  }

  async keys(pattern) {
    try {
      const client = this.getClient();
      return await client.keys(pattern);
    } catch (error) {
      console.error("Redis KEYS error:", error);
      return [];
    }
  }

  async flushAll() {
    try {
      const client = this.getClient();
      await client.flushAll();
      return true;
    } catch (error) {
      console.error("Redis FLUSHALL error:", error);
      return false;
    }
  }

  // Hash operations
  async hset(key, field, value) {
    try {
      const client = this.getClient();
      const serializedValue = JSON.stringify(value);
      await client.hSet(key, field, serializedValue);
      return true;
    } catch (error) {
      console.error("Redis HSET error:", error);
      return false;
    }
  }

  async hget(key, field) {
    try {
      const client = this.getClient();
      const value = await client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("Redis HGET error:", error);
      return null;
    }
  }

  async hgetall(key) {
    try {
      const client = this.getClient();
      const hash = await client.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      console.error("Redis HGETALL error:", error);
      return {};
    }
  }

  async hdel(key, field) {
    try {
      const client = this.getClient();
      await client.hDel(key, field);
      return true;
    } catch (error) {
      console.error("Redis HDEL error:", error);
      return false;
    }
  }

  // List operations
  async lpush(key, ...values) {
    try {
      const client = this.getClient();
      const serializedValues = values.map((v) => JSON.stringify(v));
      await client.lPush(key, serializedValues);
      return true;
    } catch (error) {
      console.error("Redis LPUSH error:", error);
      return false;
    }
  }

  async rpush(key, ...values) {
    try {
      const client = this.getClient();
      const serializedValues = values.map((v) => JSON.stringify(v));
      await client.rPush(key, serializedValues);
      return true;
    } catch (error) {
      console.error("Redis RPUSH error:", error);
      return false;
    }
  }

  async lrange(key, start, stop) {
    try {
      const client = this.getClient();
      const values = await client.lRange(key, start, stop);
      return values.map((v) => JSON.parse(v));
    } catch (error) {
      console.error("Redis LRANGE error:", error);
      return [];
    }
  }

  async llen(key) {
    try {
      const client = this.getClient();
      return await client.lLen(key);
    } catch (error) {
      console.error("Redis LLEN error:", error);
      return 0;
    }
  }

  // Set operations
  async sadd(key, ...members) {
    try {
      const client = this.getClient();
      const serializedMembers = members.map((m) => JSON.stringify(m));
      await client.sAdd(key, serializedMembers);
      return true;
    } catch (error) {
      console.error("Redis SADD error:", error);
      return false;
    }
  }

  async smembers(key) {
    try {
      const client = this.getClient();
      const members = await client.sMembers(key);
      return members.map((m) => JSON.parse(m));
    } catch (error) {
      console.error("Redis SMEMBERS error:", error);
      return [];
    }
  }

  async srem(key, ...members) {
    try {
      const client = this.getClient();
      const serializedMembers = members.map((m) => JSON.stringify(m));
      await client.sRem(key, serializedMembers);
      return true;
    } catch (error) {
      console.error("Redis SREM error:", error);
      return false;
    }
  }

  // Utility methods for common caching patterns
  async cacheWithTTL(key, data, ttlSeconds = 3600) {
    return await this.set(key, data, ttlSeconds);
  }

  async getOrSet(key, fetchFunction, ttlSeconds = 3600) {
    try {
      let data = await this.get(key);
      if (data === null) {
        data = await fetchFunction();
        if (data !== null && data !== undefined) {
          await this.set(key, data, ttlSeconds);
        }
      }
      return data;
    } catch (error) {
      console.error("Redis getOrSet error:", error);
      // Fallback to fetch function if Redis fails
      return await fetchFunction();
    }
  }

  async invalidatePattern(pattern) {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        const client = this.getClient();
        await client.del(keys);
      }
      return keys.length;
    } catch (error) {
      console.error("Redis invalidatePattern error:", error);
      return 0;
    }
  }

  // Health check
  async ping() {
    try {
      const client = this.getClient();
      const result = await client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("Redis PING error:", error);
      return false;
    }
  }
}

// Create singleton instance
const redisConfig = new RedisConfig();

module.exports = redisConfig;
