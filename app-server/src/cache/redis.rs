use async_trait::async_trait;
use redis::{aio::MultiplexedConnection, AsyncCommands, RedisResult};
use serde::{de::DeserializeOwned, Serialize};
use std::any::Any;
use std::marker::PhantomData;

use super::cache::CacheTrait;

pub struct RedisCache<T> {
    connection: MultiplexedConnection,
    _phantom: PhantomData<T>,
}

impl<T> RedisCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
{
    pub async fn new(redis_url: &str) -> RedisResult<Self> {
        let client = redis::Client::open(redis_url)?;
        let connection = client.get_multiplexed_async_connection().await?;
        Ok(Self {
            connection,
            _phantom: PhantomData,
        })
    }
}

#[async_trait]
impl<T> CacheTrait for RedisCache<T>
where
    T: Serialize + DeserializeOwned + Send + Sync + Clone + 'static,
{
    async fn get(&self, key: &str) -> Option<Box<dyn Any>> {
        let result: RedisResult<Vec<u8>> = self.connection.clone().get(key).await;
        match result {
            Ok(bytes) => {
                if bytes.is_empty() {
                    return None;
                }
                match bincode::deserialize::<T>(&bytes) {
                    Ok(value) => Some(Box::new(value) as Box<dyn Any>),
                    Err(e) => {
                        log::error!("Deserialization error: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                log::error!("Redis get error: {}", e);
                None
            }
        }
    }

    async fn insert(&self, key: String, value: Box<dyn Any + Send>) {
        if let Ok(value) = value.downcast::<T>() {
            let bytes = match bincode::serialize(&*value) {
                Ok(bytes) => bytes,
                Err(e) => {
                    log::error!("Serialization error: {}", e);
                    return;
                }
            };

            if let Err(e) = self
                .connection
                .clone()
                .set::<_, Vec<u8>, ()>(&key, bytes)
                .await
            {
                log::error!("Redis set error: {}", e);
            }
        }
    }

    async fn remove(&self, key: &str) {
        if let Err(e) = self.connection.clone().del::<_, ()>(key).await {
            log::error!("Redis delete error: {}", e);
        }
    }
}
