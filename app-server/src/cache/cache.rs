use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::fmt::Debug;
use std::result::Result;
use std::sync::Arc;

use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::FromRow;

#[derive(thiserror::Error, Debug)]
pub enum CacheError {
    #[error("{0}")]
    UnhandledError(#[from] anyhow::Error),
}

// Even though our Rust version supports async traits, we still need to use the async_trait macro
// because otherwise dyn CacheTrait is not treated as object safe
#[async_trait]
pub trait CacheTrait: Sync + Send {
    async fn get(&self, key: &str) -> Option<Box<dyn Any>>;
    async fn insert(&self, key: String, value: Box<dyn Any + Send>);
    async fn remove(&self, key: &str);
}

#[async_trait]
impl<T> CacheTrait for moka::future::Cache<String, T>
where
    T: for<'a> FromRow<'a, PgRow> + 'static + Send + Sync + Clone,
{
    async fn get(&self, key: &str) -> Option<Box<dyn Any>> {
        self.get(key)
            .await
            .map(|item| Box::new(item) as Box<dyn Any>)
    }

    async fn insert(&self, key: String, value: Box<dyn Any + Send>) {
        if let Ok(value) = value.downcast::<T>() {
            self.insert(key, *value).await;
        }
    }

    async fn remove(&self, key: &str) {
        self.remove(key).await;
    }
}

/// Write-through and/or cache-aside cache when doing read-write operations with the database
///
/// It has get operations where the keys are strings and the values are FromRow
pub struct Cache {
    caches: HashMap<TypeId, Arc<dyn CacheTrait>>,
}

impl Cache {
    pub fn new(caches: HashMap<TypeId, Arc<dyn CacheTrait>>) -> Self {
        Cache { caches }
    }

    pub async fn get<T: 'static + Send>(&self, key: &str) -> Result<Option<T>, CacheError> {
        let type_id = TypeId::of::<T>(); // evaluated at compile-time
        if let Some(cache) = self.caches.get(&type_id) {
            if let Some(boxed_any) = cache.get(key).await {
                if let Ok(boxed_t) = boxed_any.downcast::<T>() {
                    return Ok(Some(*boxed_t));
                }

                let e = anyhow::anyhow!("Could not downcast to type");
                log::error!("{}", e);
                return Err(CacheError::UnhandledError(e));
            }
            return Ok(None);
        }

        let e = anyhow::anyhow!("No cache found for this type");
        log::error!("{}", e);
        Err(CacheError::UnhandledError(e))
    }

    pub async fn insert<T: 'static + Send + Clone>(
        &self,
        key: String,
        value: &T,
    ) -> Result<(), CacheError> {
        let type_id = TypeId::of::<T>(); // evaluated at compile-time
        if let Some(cache) = self.caches.get(&type_id) {
            cache
                .insert(key, Box::new(value.clone()) as Box<dyn Any + Send>)
                .await;
            Ok(())
        } else {
            let e = anyhow::anyhow!("No cache found for this type");
            log::error!("{}", e);
            Err(CacheError::UnhandledError(e))
        }
    }

    pub async fn remove<T: 'static + Send>(&self, key: &str) -> Result<(), CacheError> {
        let type_id = TypeId::of::<T>(); // evaluated at compile-time
        if let Some(cache) = self.caches.get(&type_id) {
            cache.remove(key).await;
            Ok(())
        } else {
            let e = anyhow::anyhow!("No cache found for this type");
            log::error!("{}", e);
            Err(CacheError::UnhandledError(e))
        }
    }
}
