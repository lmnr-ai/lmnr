use std::sync::Arc;

use sqlx::PgPool;

use crate::project_api_keys::hash_api_key;
use crate::{
    cache::{keys::PROJECT_API_KEY_CACHE_KEY, Cache, CacheTrait},
    db::{self, project_api_keys::DBProjectApiKey},
};

pub async fn get_api_key_from_raw_value(
    pool: &PgPool,
    cache: Arc<Cache>,
    raw_api_key: String,
) -> anyhow::Result<DBProjectApiKey> {
    let api_key_hash = hash_api_key(&raw_api_key);
    let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{api_key_hash}");
    let cache_res = cache.get::<DBProjectApiKey>(&cache_key).await;
    match cache_res {
        Ok(Some(api_key)) => Ok(api_key),
        Ok(None) | Err(_) => {
            let api_key = db::project_api_keys::get_api_key(pool, &api_key_hash).await?;
            let _ = cache
                .insert::<DBProjectApiKey>(&cache_key, api_key.clone())
                .await;

            Ok(api_key)
        }
    }
}
