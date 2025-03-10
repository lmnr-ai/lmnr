use async_trait::async_trait;
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

#[async_trait]
#[enum_dispatch(Cache)]
pub trait CacheTrait {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>;
    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send;
    async fn remove(&self, key: &str) -> Result<(), CacheError>;
    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError>;
}
