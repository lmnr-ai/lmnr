use redis::{AsyncCommands, RedisResult, aio::MultiplexedConnection};
use serde::{Deserialize, Serialize};

use super::{CacheError, CacheTrait};

pub struct RedisCache {
    connection: MultiplexedConnection,
}

impl RedisCache {
    pub async fn new(client: &redis::Client) -> Result<Self, CacheError> {
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

    async fn insert_with_ttl<T>(&self, key: &str, value: T, seconds: u64) -> Result<(), CacheError>
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
            .set_ex::<_, Vec<u8>, ()>(String::from(key), bytes, seconds)
            .await
            .map_err(|e| {
                log::error!("Redis set error: {}", e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;

        Ok(())
    }

    async fn increment(&self, key: &str, amount: i64) -> Result<i64, CacheError> {
        // Use atomic INCRBY command
        // Note: Redis INCRBY will create the key if it doesn't exist, starting from 0
        // The caller should check with get() first if they want to handle missing keys differently
        let result: RedisResult<i64> = self.connection.clone().incr(key, amount).await;
        match result {
            Ok(new_value) => Ok(new_value),
            Err(e) => {
                log::error!("Redis increment error: {}", e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn try_acquire_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        // Use SET with NX (only if not exists) and EX (expiry in seconds)
        let result: RedisResult<Option<String>> = redis::cmd("SET")
            .arg(key)
            .arg("locked")
            .arg("NX")
            .arg("EX")
            .arg(ttl_seconds)
            .query_async(&mut self.connection.clone())
            .await;

        match result {
            Ok(Some(_)) => Ok(true), // Lock acquired
            Ok(None) => Ok(false),   // Lock already held
            Err(e) => {
                log::error!("Redis try_acquire_lock error: {}", e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn release_lock(&self, key: &str) -> Result<(), CacheError> {
        let result: RedisResult<()> = self.connection.clone().del(key).await;
        result.map_err(|e| {
            log::error!("Redis release_lock error: {}", e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }

    async fn zadd(&self, key: &str, score: f64, member: &str) -> Result<(), CacheError> {
        let result: RedisResult<()> = redis::cmd("ZADD")
            .arg(key)
            .arg("NX")
            .arg(score)
            .arg(member)
            .query_async(&mut self.connection.clone())
            .await;

        result.map_err(|e| {
            log::error!("Redis ZADD error for key {}: {}", key, e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }

    async fn pipe_zadd(&self, key: &str, members: &[String]) -> Result<(), CacheError> {
        if members.is_empty() {
            return Ok(());
        }

        let mut pipe = redis::pipe();

        for member in members {
            pipe.cmd("ZADD").arg(key).arg("NX").arg(0.0).arg(member);
        }

        let _: () = pipe
            .query_async(&mut self.connection.clone())
            .await
            .map_err(|e| {
                log::error!("Redis pipeline zadd error: {}", e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;

        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CacheError> {
        let result: RedisResult<bool> = self.connection.clone().exists(key).await;
        result.map_err(|e| {
            log::error!("Redis EXISTS error for key {}: {}", key, e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }
}
