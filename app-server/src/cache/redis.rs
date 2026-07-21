use std::sync::Arc;

use redis::{AsyncCommands, RedisResult};
use serde::{Deserialize, Serialize};

use super::{CacheError, CacheTrait, connection::ResilientRedisConnection};

pub struct RedisCache {
    connection: Arc<ResilientRedisConnection>,
}

impl RedisCache {
    pub fn new(connection: Arc<ResilientRedisConnection>) -> Self {
        Self { connection }
    }

    fn on_error(&self, op: &str, err: &redis::RedisError) {
        log::error!("Redis {} error: {}", op, err);
        self.connection.notify_error();
    }
}

impl CacheTrait for RedisCache {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let result: RedisResult<Vec<u8>> = self.connection.current_clone().get(key).await;
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
                self.on_error("get", &e);
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
            .current_clone()
            .set::<_, Vec<u8>, ()>(String::from(key), bytes)
            .await
            .map_err(|e| {
                self.on_error("set", &e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;
        Ok(())
    }

    async fn remove(&self, key: &str) -> Result<(), CacheError> {
        self.connection
            .current_clone()
            .del::<_, ()>(String::from(key))
            .await
            .map_err(|e| {
                self.on_error("delete", &e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        self.connection
            .current_clone()
            .expire::<_, ()>(String::from(key), seconds as i64)
            .await
            .map_err(|e| {
                self.on_error("expire", &e);
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
            .current_clone()
            .set_ex::<_, Vec<u8>, ()>(String::from(key), bytes, seconds)
            .await
            .map_err(|e| {
                self.on_error("set_ex", &e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;

        Ok(())
    }

    async fn increment(&self, key: &str, amount: i64) -> Result<i64, CacheError> {
        // Redis INCRBY creates the key (starting from 0) if it doesn't exist.
        // Callers needing miss-vs-hit semantics should get() first.
        let result: RedisResult<i64> = self.connection.current_clone().incr(key, amount).await;
        match result {
            Ok(new_value) => Ok(new_value),
            Err(e) => {
                self.on_error("increment", &e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn try_acquire_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        let result: RedisResult<Option<String>> = redis::cmd("SET")
            .arg(key)
            .arg("locked")
            .arg("NX")
            .arg("EX")
            .arg(ttl_seconds)
            .query_async(&mut self.connection.current_clone())
            .await;

        match result {
            Ok(Some(_)) => Ok(true), // Lock acquired
            Ok(None) => Ok(false),   // Lock already held
            Err(e) => {
                self.on_error("try_acquire_lock", &e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn renew_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        // EXPIRE returns 1 when the timeout was set, 0 when the key no longer
        // exists (i.e. the lock already expired and we no longer own it).
        let result: RedisResult<bool> = self
            .connection
            .current_clone()
            .expire(key, ttl_seconds as i64)
            .await;

        match result {
            Ok(set) => Ok(set),
            Err(e) => {
                self.on_error("renew_lock", &e);
                Err(CacheError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn release_lock(&self, key: &str) -> Result<(), CacheError> {
        let result: RedisResult<()> = self.connection.current_clone().del(key).await;
        result.map_err(|e| {
            self.on_error("release_lock", &e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }

    async fn zadd(&self, key: &str, score: f64, member: &str) -> Result<(), CacheError> {
        let result: RedisResult<()> = redis::cmd("ZADD")
            .arg(key)
            .arg("NX")
            .arg(score)
            .arg(member)
            .query_async(&mut self.connection.current_clone())
            .await;

        result.map_err(|e| {
            self.on_error("zadd", &e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }

    async fn pipe_zadd(&self, key: &str, members: &[String]) -> Result<(), CacheError> {
        if members.is_empty() {
            return Ok(());
        }

        let mut pipe = redis::pipe();

        for member in members {
            // score is 0.0 because we need only unique members not sorted set
            pipe.cmd("ZADD").arg(key).arg("NX").arg(0.0).arg(member);
        }

        let _: () = pipe
            .query_async(&mut self.connection.current_clone())
            .await
            .map_err(|e| {
                self.on_error("pipe_zadd", &e);
                CacheError::InternalError(anyhow::Error::from(e))
            })?;

        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CacheError> {
        let result: RedisResult<bool> = self.connection.current_clone().exists(key).await;
        result.map_err(|e| {
            self.on_error("exists", &e);
            CacheError::InternalError(anyhow::Error::from(e))
        })
    }

    fn is_healthy(&self) -> bool {
        self.connection.is_connected()
    }
}
