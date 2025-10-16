use redis::{AsyncCommands, RedisResult, aio::MultiplexedConnection};
use serde::{Deserialize, Serialize};

use super::{CacheError, CacheTrait};

pub struct RedisCache {
    connection: MultiplexedConnection,
}

impl RedisCache {
    pub async fn new(redis_url: &str) -> Result<Self, CacheError> {
        let client = redis::Client::open(redis_url)
            .map_err(anyhow::Error::from)
            .map_err(CacheError::InternalError)?;

        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(anyhow::Error::from)
            .map_err(CacheError::InternalError)?;
        Ok(Self { connection })
    }
}

impl CacheTrait for RedisCache {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let result: RedisResult<Vec<u8>> = self.connection.clone().get(key).await;
        match result {
            Ok(bytes) => {
                if bytes.is_empty() {
                    return Ok(None);
                }
                match serde_json::from_slice::<T>(&bytes) {
                    Ok(value) => Ok(Some(value)),
                    Err(e) => {
                        log::error!("Deserialization error: {}", e);
                        Err(CacheError::SerDeError(e))
                    }
                }
            }
            Err(e) => {
                log::error!("Redis get error: {}", e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send,
    {
        let bytes = match serde_json::to_vec(&value) {
            Ok(bytes) => bytes,
            Err(e) => {
                log::error!("Serialization error: {}", e);
                return Err(CacheError::SerDeError(e));
            }
        };

        self.connection
            .clone()
            .set::<_, Vec<u8>, ()>(String::from(key), bytes)
            .await
            .map_err(|e| {
                log::error!("Redis set error: {}", e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;
        Ok(())
    }

    async fn remove(&self, key: &str) -> Result<(), CacheError> {
        self.connection
            .clone()
            .del::<_, ()>(String::from(key))
            .await
            .map_err(|e| {
                log::error!("Redis delete error: {}", e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        self.connection
            .clone()
            .expire::<_, ()>(String::from(key), seconds as i64)
            .await
            .map_err(|e| {
                log::error!("Redis set ttl error: {}", e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;
        Ok(())
    }

    async fn increment(&self, key: &str, amount: i64) -> Result<Option<i64>, CacheError> {
        // Use atomic INCRBY command
        // Note: Redis INCRBY will create the key if it doesn't exist, starting from 0
        // The caller should check with get() first if they want to handle missing keys differently
        let result: RedisResult<i64> = self.connection.clone().incr(key, amount).await;
        match result {
            Ok(new_value) => Ok(Some(new_value)),
            Err(e) => {
                log::error!("Redis increment error: {}", e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }
}
