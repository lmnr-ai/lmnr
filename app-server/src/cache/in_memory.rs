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
        T: for<'de> Deserialize<'de> + Send + Sync + 'static,
    {
        let Some(bytes) = self.cache.get(key).await else {
            return Ok(None);
        };

        let value = serde_json::from_slice(&bytes)
            .map_err(|e| CacheError::UnhandledError(anyhow::Error::from(e)))?;
        Ok(Some(value))
    }

    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send + Sync + 'static,
    {
        let bytes = serde_json::to_vec(&value)
            .map_err(|e| CacheError::UnhandledError(anyhow::Error::from(e)))?;
        self.cache.insert(String::from(key), bytes).await;
        Ok(())
    }

    async fn remove<T>(&self, key: &str) -> Result<(), CacheError>
    where
        T: Send + Sync + 'static,
    {
        self.cache.remove(key).await;
        Ok(())
    }
}
