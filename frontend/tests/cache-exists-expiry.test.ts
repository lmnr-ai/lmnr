import assert from "node:assert/strict";
import { test } from "node:test";

import { CacheManager } from "@/lib/cache";

// Build an instance with no Redis configured so we exercise the in-memory fallback.
const savedRedisUrl = process.env.REDIS_URL;
delete process.env.REDIS_URL;
const memoryCache = new CacheManager();
process.env.REDIS_URL = savedRedisUrl; // restore so other test files are not affected

test("exists() returns false for an expired entry in the in-memory cache", async () => {
  await memoryCache.set("expired-key", 1, { expireAt: new Date(Date.now() - 1000) });

  // Must agree with get(), which treats the entry as gone.
  assert.equal(await memoryCache.exists("expired-key"), false);
  assert.equal(await memoryCache.get("expired-key"), null);
});

test("exists() returns true for a live entry in the in-memory cache", async () => {
  await memoryCache.set("live-key", 1, { expireAfterSeconds: 60 });

  assert.equal(await memoryCache.exists("live-key"), true);
});
