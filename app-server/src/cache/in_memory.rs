use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

use super::{CacheError, CacheTrait};

const DEFAULT_CACHE_SIZE: u64 = 100;
pub struct InMemoryCache {
    cache: moka::future::Cache<String, Vec<u8>>,
    locks: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
    sorted_sets: Arc<RwLock<HashMap<String, HashSet<String>>>>,
    // Serializes counter read-modify-writes so concurrent increments can't
    // lose counts (Redis INCRBY is atomic; this mirrors that guarantee).
    counter_mutex: Mutex<()>,
    // Monotonic per-key generation for TTL invalidation tasks. `set_ttl` and
    // `remove` bump it; a spawned invalidate only fires if its generation is
    // still current, so a stale timer from a deleted/evicted key can't expire
    // a recreated one early. Entries are never removed (bounded by key
    // cardinality — fine for dev).
    ttl_generations: Arc<RwLock<HashMap<String, u64>>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
            locks: Arc::new(RwLock::new(HashMap::new())),
            sorted_sets: Arc::new(RwLock::new(HashMap::new())),
            counter_mutex: Mutex::new(()),
            ttl_generations: Arc::new(RwLock::new(HashMap::new())),
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
        // Bump the generation so any armed TTL task for this key becomes a
        // no-op — it must not expire a later recreation of the key.
        {
            let mut generations = self.ttl_generations.write().await;
            *generations.entry(String::from(key)).or_insert(0) += 1;
        }
        self.cache.remove(key).await;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        let key = String::from(key);
        let cache = self.cache.clone();
        let generations = self.ttl_generations.clone();
        let my_generation = {
            let mut generations = generations.write().await;
            let entry = generations.entry(key.clone()).or_insert(0);
            *entry += 1;
            *entry
        };
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(seconds)).await;
            // Only the latest armed TTL may invalidate; stale timers from a
            // removed or re-armed key are no-ops.
            let still_current = generations.read().await.get(&key).copied() == Some(my_generation);
            if still_current {
                cache.invalidate(&key).await;
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
        // The mutex covers the exists-check + increment, so concurrent calls
        // can't lose counts or double-arm the expiry. The spawned invalidation
        // task from creation time survives later inserts, so the key still
        // expires at the original window end.
        let _guard = self.counter_mutex.lock().await;
        let created = self.cache.get(key).await.is_none();
        let new_value = self.increment_unlocked(key, amount).await?;
        if created {
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
}
