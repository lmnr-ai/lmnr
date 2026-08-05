use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use super::{CacheError, CacheTrait, LockClaim};

const DEFAULT_CACHE_SIZE: u64 = 100;
pub struct InMemoryCache {
    cache: moka::future::Cache<String, Vec<u8>>,
    locks: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
    sorted_sets: Arc<RwLock<HashMap<String, HashSet<String>>>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
            locks: Arc::new(RwLock::new(HashMap::new())),
            sorted_sets: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl CacheTrait for InMemoryCache {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let Some(bytes) = self.cache.get(key).await else {
            return Ok(None);
        };

        let value = serde_json::from_slice(&bytes).map_err(|e| CacheError::SerDeError(e))?;
        Ok(Some(value))
    }

    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send,
    {
        let bytes = serde_json::to_vec(&value).map_err(|e| CacheError::SerDeError(e))?;
        self.cache.insert(String::from(key), bytes).await;
        Ok(())
    }

    async fn remove(&self, key: &str) -> Result<(), CacheError> {
        self.cache.remove(key).await;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        let key = String::from(key);
        let cache = self.cache.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(seconds)).await;
            cache.invalidate(&key).await;
        });
        Ok(())
    }

    async fn insert_with_ttl<T>(&self, key: &str, value: T, seconds: u64) -> Result<(), CacheError>
    where
        T: Serialize + Send,
    {
        self.insert(key, value).await?;
        self.set_ttl(key, seconds).await?;
        Ok(())
    }

    async fn increment(&self, key: &str, amount: i64) -> Result<i64, CacheError> {
        // Note: This is not truly atomic for in-memory cache, but should be fine for dev/testing.
        // Production should use Redis where increment is atomic.
        // Like Redis INCRBY, this creates the key with value=0 if it doesn't exist
        let current_value: i64 = match self.cache.get(key).await {
            Some(bytes) => serde_json::from_slice(&bytes).map_err(|e| CacheError::SerDeError(e))?,
            None => 0,
        };

        let new_value = current_value + amount;
        let new_bytes = serde_json::to_vec(&new_value).map_err(|e| CacheError::SerDeError(e))?;

        self.cache.insert(String::from(key), new_bytes).await;
        Ok(new_value)
    }

    async fn try_acquire_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        let mut locks = self.locks.write().await;
        let now = tokio::time::Instant::now();
        let expiry = now + Duration::from_secs(ttl_seconds);

        // Clean up expired locks
        locks.retain(|_, &mut expires_at| expires_at > now);

        // Try to acquire lock
        if locks.contains_key(key) {
            Ok(false)
        } else {
            locks.insert(key.to_string(), expiry);
            Ok(true)
        }
    }

    async fn try_acquire_lock_with_owner(
        &self,
        key: &str,
        owner: &str,
        ttl_seconds: u64,
    ) -> Result<LockClaim, CacheError> {
        let bytes = serde_json::to_vec(owner).map_err(|e| CacheError::SerDeError(e))?;

        // moka runs at most one initializer per key, so exactly one of N
        // concurrent callers sees a fresh entry — the analogue of Redis SET NX.
        // Deliberately the main cache, not `locks`: `get` must be able to read
        // the owner back.
        let entry = self
            .cache
            .entry(String::from(key))
            .or_insert_with(async move { bytes })
            .await;

        if entry.is_fresh() {
            self.set_ttl(key, ttl_seconds).await?;
            return Ok(LockClaim::Acquired);
        }

        // A stale entry already carries the holder's value, so the owner comes
        // back without a second lookup.
        Ok(LockClaim::Held(
            serde_json::from_slice(&entry.into_value()).ok(),
        ))
    }

    async fn renew_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        let mut locks = self.locks.write().await;
        let now = tokio::time::Instant::now();
        // Drop expired locks first so a stale entry can't be "renewed".
        locks.retain(|_, &mut expires_at| expires_at > now);
        match locks.get_mut(key) {
            Some(expiry) => {
                *expiry = now + Duration::from_secs(ttl_seconds);
                Ok(true)
            }
            None => Ok(false),
        }
    }

    async fn release_lock(&self, key: &str) -> Result<(), CacheError> {
        let mut locks = self.locks.write().await;
        locks.remove(key);
        Ok(())
    }

    async fn zadd(&self, key: &str, _score: f64, member: &str) -> Result<(), CacheError> {
        let mut sets = self.sorted_sets.write().await;
        sets.entry(key.to_string())
            .or_insert_with(HashSet::new)
            .insert(member.to_string());
        Ok(())
    }

    async fn pipe_zadd(&self, key: &str, members: &[String]) -> Result<(), CacheError> {
        for member in members {
            self.zadd(key, 0.0, member).await?;
        }
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CacheError> {
        // Check both regular cache and sorted sets
        let in_cache = self.cache.get(key).await.is_some();
        let in_sorted_sets = self.sorted_sets.read().await.contains_key(key);
        Ok(in_cache || in_sorted_sets)
    }

    fn is_healthy(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Barrier;

    /// `try_acquire_lock_with_owner` must admit exactly ONE of N simultaneous
    /// claimants. Callers rely on this to serialize work (see the signals
    /// per-trace exclusive claim); a `get`-then-`insert` implementation lets
    /// every claimant observe an empty key and all of them proceed.
    ///
    /// Needs a multi-thread runtime plus a barrier: on a single-threaded runtime
    /// each future runs to completion before the next is polled, so the race
    /// never opens and a non-atomic implementation passes. Repeated over many
    /// rounds because one round can get lucky.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn try_acquire_lock_with_owner_admits_exactly_one_concurrent_claimant() {
        const CLAIMANTS: usize = 8;
        const ROUNDS: usize = 200;

        let cache = Arc::new(InMemoryCache::new(Some(ROUNDS as u64 * 2)));

        for round in 0..ROUNDS {
            let key = format!("claim-race-{round}");
            let barrier = Arc::new(Barrier::new(CLAIMANTS));

            let claimants = (0..CLAIMANTS).map(|i| {
                let cache = cache.clone();
                let barrier = barrier.clone();
                let key = key.clone();
                tokio::spawn(async move {
                    // Line every task up so they contend for real.
                    barrier.wait().await;
                    cache
                        .try_acquire_lock_with_owner(&key, &format!("owner-{i}"), 60)
                        .await
                        .unwrap()
                })
            });

            let winners = futures_util::future::join_all(claimants)
                .await
                .into_iter()
                .filter(|claim| *claim.as_ref().unwrap() == LockClaim::Acquired)
                .count();

            assert_eq!(
                winners, 1,
                "round {round}: exactly one claimant may win, got {winners}"
            );
        }
    }

    /// The claim must be readable through `get` (callers refresh its TTL through
    /// the same keyspace) and clearable through `remove` — i.e. it lives in the
    /// main keyspace, not the separate `locks` map `try_acquire_lock` uses.
    #[tokio::test]
    async fn try_acquire_lock_with_owner_is_visible_to_get_and_remove() {
        let cache = InMemoryCache::new(None);

        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-a", 60)
                .await
                .unwrap(),
            LockClaim::Acquired
        );
        assert_eq!(
            cache.get::<String>("k").await.unwrap(),
            Some("owner-a".to_string()),
            "the owner must be readable back"
        );
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-b", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("owner-a".to_string())),
            "a held claim must not be reassignable, and must name its holder"
        );

        cache.remove("k").await.unwrap();
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-b", 60)
                .await
                .unwrap(),
            LockClaim::Acquired,
            "the claim must be retakeable once removed"
        );
    }

    /// A failed claim must report the holder in the SAME call — callers compare
    /// it against their own identity to tell a redelivery of their own work from
    /// a genuine competitor. Pins that contract; the race it exists to close (a
    /// separate `get` catching the holder mid-release and reporting nobody) needs
    /// an interleaving this test can't stage.
    #[tokio::test]
    async fn a_failed_claim_names_its_holder() {
        let cache = InMemoryCache::new(None);

        cache
            .try_acquire_lock_with_owner("k", "run-1", 60)
            .await
            .unwrap();

        // Same owner: a redelivery recognizing its own claim.
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-1", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("run-1".to_string()))
        );
        // Different owner: a competitor.
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-2", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("run-1".to_string()))
        );
    }

    /// A value that isn't an owner string at all — e.g. a key written by
    /// something other than this primitive — must read as held-by-unknown rather
    /// than erroring the claim. Callers can't treat it as their own, and it ages
    /// out with its TTL.
    #[tokio::test]
    async fn an_undecodable_holder_is_held_by_unknown() {
        let cache = InMemoryCache::new(None);

        cache.insert("k", 42u64).await.unwrap();

        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-1", 60)
                .await
                .unwrap(),
            LockClaim::Held(None)
        );
    }
}
