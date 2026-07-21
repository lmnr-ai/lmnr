use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

use super::{CacheError, CacheTrait};

const DEFAULT_CACHE_SIZE: u64 = 100;

/// Per-key TTL bookkeeping: `generation` invalidates stale timer tasks,
/// `armed` records whether a live timer currently covers the key.
#[derive(Default, Clone, Copy)]
struct TtlState {
    generation: u64,
    armed: bool,
}

pub struct InMemoryCache {
    cache: moka::future::Cache<String, Vec<u8>>,
    locks: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
    sorted_sets: Arc<RwLock<HashMap<String, HashSet<String>>>>,
    // Serializes counter read-modify-writes so concurrent increments can't
    // lose counts (Redis INCRBY is atomic; this mirrors that guarantee).
    counter_mutex: Mutex<()>,
    // TTL invalidation-task state. `set_ttl` bumps the generation and arms;
    // `remove` bumps and disarms; a timer only fires while its generation is
    // still current, so a stale timer from a deleted key can't expire a
    // recreated one early. The `armed` flag lets counter code arm a TTL
    // whenever none is live (create or self-heal), mirroring the Redis Lua
    // `TTL < 0` check. Entries are never removed (bounded by key
    // cardinality — fine for dev).
    ttl_states: Arc<RwLock<HashMap<String, TtlState>>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
            locks: Arc::new(RwLock::new(HashMap::new())),
            sorted_sets: Arc::new(RwLock::new(HashMap::new())),
            counter_mutex: Mutex::new(()),
            ttl_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Read-modify-write increment; callers must hold `counter_mutex`.
    async fn increment_unlocked(&self, key: &str, amount: i64) -> Result<i64, CacheError> {
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
        // Bump the generation (and disarm) so any live TTL task for this key
        // becomes a no-op — it must not expire a later recreation of the key.
        {
            let mut states = self.ttl_states.write().await;
            let state = states.entry(String::from(key)).or_default();
            state.generation += 1;
            state.armed = false;
        }
        self.cache.remove(key).await;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        let key = String::from(key);
        let cache = self.cache.clone();
        let states = self.ttl_states.clone();
        let my_generation = {
            let mut states = states.write().await;
            let state = states.entry(key.clone()).or_default();
            state.generation += 1;
            state.armed = true;
            state.generation
        };
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(seconds)).await;
            // Only the latest armed TTL may invalidate; stale timers from a
            // removed or re-armed key are no-ops.
            let mut states = states.write().await;
            if let Some(state) = states.get_mut(&key) {
                if state.generation == my_generation {
                    state.armed = false;
                    cache.invalidate(&key).await;
                }
            }
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
        let _guard = self.counter_mutex.lock().await;
        self.increment_unlocked(key, amount).await
    }

    async fn increment_with_ttl_on_create(
        &self,
        key: &str,
        amount: i64,
        ttl_seconds: u64,
    ) -> Result<i64, CacheError> {
        // The mutex covers the increment + arm-check, so concurrent calls
        // can't lose counts or double-arm the expiry. Mirroring the Redis Lua
        // `TTL < 0` check, the TTL is armed whenever no live timer covers the
        // key (creation or self-heal after a concurrent `remove` disarmed it)
        // — not just when the key was absent — so the counter can never stay
        // TTL-less. An armed live window is never re-armed (fixed-window
        // semantics).
        let _guard = self.counter_mutex.lock().await;
        let new_value = self.increment_unlocked(key, amount).await?;
        let armed = self
            .ttl_states
            .read()
            .await
            .get(key)
            .is_some_and(|s| s.armed);
        if !armed {
            self.set_ttl(key, ttl_seconds).await?;
        }
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

    #[tokio::test]
    async fn concurrent_increments_lose_no_counts() {
        let cache = Arc::new(InMemoryCache::new(Some(1000)));
        let tasks: Vec<_> = (0..100)
            .map(|_| {
                let cache = cache.clone();
                tokio::spawn(async move {
                    cache
                        .increment_with_ttl_on_create("counter", 1, 60)
                        .await
                        .unwrap()
                })
            })
            .collect();
        let mut max_seen = 0;
        for task in tasks {
            max_seen = max_seen.max(task.await.unwrap());
        }
        assert_eq!(max_seen, 100);
        assert_eq!(cache.get::<i64>("counter").await.unwrap(), Some(100));
    }

    #[tokio::test(start_paused = true)]
    async fn stale_ttl_task_cannot_expire_recreated_key() {
        let cache = InMemoryCache::new(Some(1000));
        // Arm a 5s window, then reset it (ops `DEL`) and start a 60s window.
        cache
            .increment_with_ttl_on_create("counter", 1, 5)
            .await
            .unwrap();
        cache.remove("counter").await.unwrap();
        cache
            .increment_with_ttl_on_create("counter", 1, 60)
            .await
            .unwrap();

        // Past the stale 5s deadline: the old timer must not invalidate the
        // new window.
        tokio::time::sleep(Duration::from_secs(10)).await;
        tokio::task::yield_now().await;
        assert_eq!(cache.get::<i64>("counter").await.unwrap(), Some(1));

        // Past the new window's own 60s deadline: now it expires.
        tokio::time::sleep(Duration::from_secs(55)).await;
        tokio::task::yield_now().await;
        assert_eq!(cache.get::<i64>("counter").await.unwrap(), None);
    }

    #[tokio::test(start_paused = true)]
    async fn counter_recreated_after_remove_still_gets_ttl() {
        let cache = InMemoryCache::new(Some(1000));
        // Simulate the increment-sees-key-then-remove interleave: the second
        // increment lands on an existing key whose timer a `remove` then
        // disarms. The next increment must re-arm a TTL (self-heal), not
        // leave the counter permanent.
        cache
            .increment_with_ttl_on_create("counter", 1, 10)
            .await
            .unwrap();
        cache.remove("counter").await.unwrap();
        // Recreate via plain increment (no TTL arming at all) — this is the
        // worst case: key exists, no live timer.
        cache.increment("counter", 1).await.unwrap();
        // Self-heal: the next windowed increment arms a TTL on the existing key.
        cache
            .increment_with_ttl_on_create("counter", 1, 10)
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_secs(11)).await;
        tokio::task::yield_now().await;
        assert_eq!(cache.get::<i64>("counter").await.unwrap(), None);
    }
}
