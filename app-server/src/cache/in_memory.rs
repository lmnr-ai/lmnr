use serde::{Deserialize, Serialize};
use std::result::Result;

use async_trait::async_trait;

use super::{CacheError, CacheTrait};

const DEFAULT_CACHE_SIZE: u64 = 100;
pub struct InMemoryCache {
    cache: moka::future::Cache<String, Vec<u8>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
        }
    }
}

#[async_trait]
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
}
