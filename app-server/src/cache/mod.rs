use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};

use in_memory::InMemoryCache;
use redis::RedisCache;

pub mod autocomplete;
pub mod connection;
pub mod in_memory;
pub mod keys;
pub mod redis;

#[derive(thiserror::Error, Debug)]
pub enum CacheError {
    #[error("{0}")]
    InternalError(#[from] anyhow::Error),
    #[error("{{0}}")]
    SerDeError(#[from] serde_json::Error),
}

#[enum_dispatch]
pub enum Cache {
    InMemory(InMemoryCache),
    Redis(RedisCache),
}

/// Outcome of [`CacheTrait::try_acquire_lock_with_owner`].
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, PartialEq, Eq)]
pub enum LockClaim {
    /// This call took the claim.
    Acquired,
    /// Someone already held it. `Some` carries the owner they stored; `None` is a
    /// value that doesn't decode as an owner — e.g. a legacy ownerless
    /// [`CacheTrait::try_acquire_lock`] entry, which ages out with its TTL.
    Held(Option<String>),
}

#[enum_dispatch(Cache)]
pub trait CacheTrait {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>;
    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send;
    #[allow(dead_code)]
    async fn remove(&self, key: &str) -> Result<(), CacheError>;
    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError>;
    async fn insert_with_ttl<T>(&self, key: &str, value: T, seconds: u64) -> Result<(), CacheError>
    where
        T: Serialize + Send;
    /// Atomically increment a numeric value by the given amount.
    /// If the key doesn't exist, it will be created with value 0 before incrementing.
    /// Returns the new value after incrementing.
    /// Callers should use get() first if they need to distinguish between missing keys
    /// and existing keys (to trigger recomputation logic, for example).
    async fn increment(&self, key: &str, amount: i64) -> Result<i64, CacheError>;

    /// Try to acquire a lock. Returns true if lock was acquired, false if already locked.
    /// Lock expires after TTL seconds if not manually released.
    async fn try_acquire_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError>;

    /// Atomically claim `key` for `owner`, reporting who holds it when the claim
    /// fails — so a redelivered task can recognize its OWN claim and re-enter
    /// instead of waiting out the TTL.
    ///
    /// Differs from [`Self::try_acquire_lock`] in two ways that matter:
    /// - the stored value is the caller's identity, hence the `Held` payload;
    /// - the claim lives in the SAME keyspace as `insert_with_ttl`, so `get` /
    ///   `remove` / `set_ttl` all address it. (`try_acquire_lock` keeps in-memory
    ///   locks in a separate map that `get` cannot see.)
    ///
    /// Claim and owner-read are ONE atomic step, which is the whole point: use
    /// this rather than `get`-then-`insert` whenever concurrent callers contend
    /// for the same key, and don't decompose it back into a claim followed by a
    /// separate `get` — that reintroduces a window where the holder releases in
    /// between and the reader sees an empty holder for a lock that is now free.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    async fn try_acquire_lock_with_owner(
        &self,
        key: &str,
        owner: &str,
        ttl_seconds: u64,
    ) -> Result<LockClaim, CacheError>;

    /// Extend an already-held lock's expiry to `ttl_seconds` from now. Returns
    /// true if the lock still existed and was renewed, false if it had already
    /// expired (so the caller no longer owns it). Used by long-running holders
    /// to heartbeat a lock whose work outlives a single fixed TTL.
    async fn renew_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError>;

    /// Release a lock
    async fn release_lock(&self, key: &str) -> Result<(), CacheError>;

    /// Add a member to a sorted set with a given score
    /// Returns Ok(()) regardless of whether the member was added or already existed
    async fn zadd(&self, key: &str, score: f64, member: &str) -> Result<(), CacheError>;

    /// Bulk add multiple members to a sorted set
    /// Uses pipelining for Redis, sequential for InMemory
    async fn pipe_zadd(&self, key: &str, members: &[String]) -> Result<(), CacheError>;

    /// Check if a key exists in the cache
    async fn exists(&self, key: &str) -> Result<bool, CacheError>;

    /// Returns true when the underlying transport is healthy. The InMemory
    /// variant is always healthy; the Redis variant reflects the
    /// `ResilientRedisConnection`'s last-known PING outcome.
    fn is_healthy(&self) -> bool;
}
