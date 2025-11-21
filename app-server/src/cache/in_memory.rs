use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use super::{CacheError, CacheTrait};

const DEFAULT_CACHE_SIZE: u64 = 100;
pub struct InMemoryCache {
    cache: moka::future::Cache<String, Vec<u8>>,
    locks: Arc<RwLock<HashMap<String, tokio::time::Instant>>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
            locks: Arc::new(RwLock::new(HashMap::new())),
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
            Ok(false) // Lock already held
        } else {
            locks.insert(key.to_string(), expiry);
            Ok(true) // Lock acquired
        }
    }

    async fn release_lock(&self, key: &str) -> Result<(), CacheError> {
        let mut locks = self.locks.write().await;
        locks.remove(key);
        Ok(())
    }
}
