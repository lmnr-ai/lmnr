use async_trait::async_trait;
use redis::{aio::MultiplexedConnection, AsyncCommands, RedisResult};
use serde::{Deserialize, Serialize};

use super::{CacheError, CacheTrait};

pub struct RedisCache {
    connection: MultiplexedConnection,
}

impl RedisCache {
    pub async fn new(redis_url: &str) -> Result<Self, CacheError> {
        let client = redis::Client::open(redis_url)
            .map_err(anyhow::Error::from)
            .map_err(CacheError::UnhandledError)?;

        let connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(anyhow::Error::from)
            .map_err(CacheError::UnhandledError)?;
        Ok(Self { connection })
    }
}

#[async_trait]
impl CacheTrait for RedisCache {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de> + Send + Sync + 'static,
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
                        Err(CacheError::UnhandledError(anyhow::Error::from(e)))
                    }
                }
            }
            Err(e) => {
                log::error!("Redis get error: {}", e);
                Err(CacheError::UnhandledError(anyhow::Error::from(e)))
            }
        }
    }

    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send + Sync + 'static,
    {
        let bytes = match serde_json::to_vec(&value) {
            Ok(bytes) => bytes,
            Err(e) => {
                log::error!("Serialization error: {}", e);
                return Err(CacheError::UnhandledError(anyhow::Error::from(e)));
            }
        };

        if let Err(e) = self
            .connection
            .clone()
            .set::<_, Vec<u8>, ()>(String::from(key), bytes)
            .await
        {
            log::error!("Redis set error: {}", e);
            Err(CacheError::UnhandledError(anyhow::Error::from(e)))
        } else {
            Ok(())
        }
    }

    async fn remove<T>(&self, key: &str) -> Result<(), CacheError>
    where
        T: Send + Sync + 'static,
    {
        if let Err(e) = self
            .connection
            .clone()
            .del::<_, ()>(String::from(key))
            .await
        {
            log::error!("Redis delete error: {}", e);
            Err(CacheError::UnhandledError(anyhow::Error::from(e)))
        } else {
            Ok(())
        }
    }
}
