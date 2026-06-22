use std::sync::Arc;

use chrono::Utc;
use sqlx::PgPool;

use crate::project_api_keys::hash_api_key;
use crate::{
    cache::{Cache, CacheTrait, keys::PROJECT_API_KEY_CACHE_KEY},
    db::{self, project_api_keys::ProjectApiKey},
};

const PROJECT_API_KEY_TTL: u64 = 86400; // seconds == 1 day

pub async fn get_api_key_from_raw_value(
    pool: &PgPool,
    cache: Arc<Cache>,
    raw_api_key: String,
) -> anyhow::Result<ProjectApiKey> {
    let api_key_hash = hash_api_key(&raw_api_key);
    let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{api_key_hash}");
    let cache_res = cache.get::<ProjectApiKey>(&cache_key).await;
    let (api_key, from_cache) = match cache_res {
        Ok(Some(api_key)) => (api_key, true),
        Ok(None) | Err(_) => (
            db::project_api_keys::get_api_key(pool, &api_key_hash).await?,
            false,
        ),
    };

    // Lazy expiration: reject expired keys and purge them from cache + DB so a
    // revoked credential can't linger. Checked before caching a freshly-read key
    // so an expired key is never written to the cache only to be removed again.
    if let Some(expires_at) = api_key.expires_at
        && Utc::now() > expires_at
    {
        if from_cache {
            let _ = cache.remove(&cache_key).await;
        }
        let _ = db::project_api_keys::delete_api_key_by_hash(pool, &api_key_hash).await;
        return Err(anyhow::anyhow!("project API key expired"));
    }

    // Cache only non-expired keys read from the DB.
    if !from_cache {
        let _ = cache
            .insert_with_ttl::<ProjectApiKey>(&cache_key, api_key.clone(), PROJECT_API_KEY_TTL)
            .await;
    }

    Ok(api_key)
}
