import { Redis } from 'ioredis';

// Singleton Redis client
const getRedisClient = (() => {
  let client: Redis | null = null;

  return () => {
    if (!client) {
      client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });
    }
    return client;
  };
})();

const redis = getRedisClient();

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

class CacheManager {
  private redisClient: Redis | null = null;
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private readonly useRedis: boolean;

  constructor() {
    this.useRedis = !!process.env.REDIS_URL;
    // Initialize Redis client immediately if we're using Redis
    if (this.useRedis) {
      this.redisClient = redis;
      this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    }
  }

  private async getRedisClient(): Promise<Redis> {
    if (!this.redisClient) {
      this.redisClient = redis;
    }
    if (['reconnecting', 'wait'].includes(this.redisClient.status)) {
      await this.redisClient.connect();
    }
    return this.redisClient;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis) {
      const client = await this.getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } else {
      const entry = this.memoryCache.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        this.memoryCache.delete(key);
        return null;
      }
      return entry.value;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.useRedis) {
      const client = await this.getRedisClient();
      await client.set(key, JSON.stringify(value));
    } else {
      this.memoryCache.set(key, { value, expiresAt: null });
    }
  }

  async remove(key: string): Promise<void> {
    if (this.useRedis) {
      const client = await this.getRedisClient();
      await client.del(key);
    } else {
      this.memoryCache.delete(key);
    }
  }
}

export const cache = new CacheManager();
