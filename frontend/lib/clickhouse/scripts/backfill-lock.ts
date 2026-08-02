import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";

// Single-flight lock for the one-off traces_agg backfill (LAM-2018). Deliberately
// NOT in `lib/cache.ts`: nothing in production needs a fenced lock yet, so this
// stays scoped to the script. If a second consumer ever appears, move it there.
//
// Own Redis connection rather than `CacheManager`'s, because the two primitives
// this needs — an atomic claim and a compare-and-act release — aren't on that
// class, and a lock is the one place where "close enough" isn't.

const LOCK_KEY = "traces_agg_backfill_lock";
const LOCK_TTL_SECONDS = 15 * 60;
// Renew well inside the TTL so a slow batch can't let the lease lapse under us.
const LOCK_RENEW_INTERVAL_MS = 5 * 60 * 1000;

export interface BackfillLock {
  // False once the lease lapsed and someone else took over: the holder must stop
  // rather than keep writing under another replica's lock.
  lost: () => boolean;
  release: () => Promise<void>;
}

const redisUrl = (): string | undefined => process.env.REDIS_URL;

// Compare-and-act so a lapsed holder can't extend or delete the successor's lease.
// With a constant lock value both would silently succeed, and the delete is the
// dangerous one — it re-opens the gate while two runs are already in flight.
const RENEW_IF_HELD = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return 0
`;

const RELEASE_IF_HELD = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

// Returns null when another replica already holds the lock. `traces_agg` sums, so
// two replicas walking the same windows permanently inflate tokens/costs — and the
// destination anti-join can't prevent that, since both read the window before
// either insert lands. Hence `SET NX EX` (one atomic round trip) rather than
// exists-then-set.
export const acquireBackfillLock = async (): Promise<BackfillLock | null> => {
  const url = redisUrl();
  if (!url) {
    // No Redis means no shared state, so there is nothing to serialise on. A
    // single-replica self-hosted install (the common case) is fine; more than one
    // replica would double-count, so warn rather than silently proceed.
    console.warn(
      "[traces-agg-backfill] REDIS_URL is not set, so there is no cross-replica lock. " +
        "If you run MORE THAN ONE frontend replica, set REDIS_URL or run a single replica for the " +
        "first boot — concurrent replicas would double-count traces_agg tokens/costs."
    );
    return { lost: () => false, release: async () => {} };
  }

  const token = randomUUID();
  const client = new Redis(url, { maxRetriesPerRequest: 3 });
  client.on("error", (error) => console.error("[traces-agg-backfill] lock redis error", error));

  let acquired = false;
  try {
    acquired = (await client.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX")) === "OK";
  } catch (error) {
    console.error("[traces-agg-backfill] could not acquire the lock", error);
  }
  if (!acquired) {
    await client.quit().catch(() => {});
    return null;
  }

  let lost = false;
  const surrender = (reason: string) => {
    if (lost) return;
    lost = true;
    console.warn(
      `[traces-agg-backfill] ${reason}; stopping. Remaining history is migrated by whichever replica ` +
        "holds the lock now, or on the next boot."
    );
  };

  const renew = setInterval(() => {
    void client
      .eval(RENEW_IF_HELD, 1, LOCK_KEY, token, String(LOCK_TTL_SECONDS))
      // 0 means the key is gone or now holds another token — we no longer own it.
      .then((held) => {
        if (held !== 1) surrender("lock lease expired and was taken over");
      })
      // A FAILED renew must surrender too, not just a refused one. Swallowing the
      // error leaves `lost` false while the lease quietly runs out, so a Redis
      // outage lasting past the TTL lets this run keep writing after another
      // replica has legitimately claimed the lock — and concurrent runs double
      // traces_agg sums (verified: with the error swallowed, `lost()` stayed false
      // across an outage that outlived the lease). Surrendering on the first
      // failure is the safe direction: worst case we stop early and the next boot
      // resumes from the destination watermark.
      .catch((error) => surrender(`could not renew the lock lease (${String(error)})`));
  }, LOCK_RENEW_INTERVAL_MS);
  // Don't hold the event loop open on account of the renew timer.
  renew.unref?.();

  return {
    lost: () => lost,
    release: async () => {
      clearInterval(renew);
      await client.eval(RELEASE_IF_HELD, 1, LOCK_KEY, token).catch(() => {});
      await client.quit().catch(() => {});
    },
  };
};
