use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};

use in_memory::InMemoryCache;
use redis::RedisCache;

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
}
