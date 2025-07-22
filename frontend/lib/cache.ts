import { Redis } from 'ioredis';

// Singleton Redis client
const getRedisSingleton = (() => {
  let client: Redis | null = null;

  return () => {
    if (!client) {
      client = new Redis(process.env.REDIS_URL!, {
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
      this.redisClient = getRedisSingleton();
      this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    }
  }

  private async getRedisClient(): Promise<Redis> {
    if (!this.redisClient) {
      this.redisClient = getRedisSingleton();
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
      try {
        return value ? JSON.parse(value) : null;
      } catch (e) {
        console.error("Error parsing value from cache", e);
        throw e;
      }
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
      try {
        await client.set(key, JSON.stringify(value));
      } catch (e) {
        console.error("Error setting entry in cache", e);
        throw e;
      }
    } else {
      this.memoryCache.set(key, { value, expiresAt: null });
    }
  }

  async remove(key: string): Promise<void> {
    if (this.useRedis) {
      const client = await this.getRedisClient();
      try {
        await client.del(key);
      } catch (e) {
        console.error("Error deleting entry from cache", e);
        throw e;
      }
    } else {
      this.memoryCache.delete(key);
    }
  }
}

export const cache = new CacheManager();

export const PROJECT_API_KEY_CACHE_KEY = "project_api_key";
export const PROJECT_EVALUATORS_BY_PATH_CACHE_KEY = "project_evaluators_by_path";
