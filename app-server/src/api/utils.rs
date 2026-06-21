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
    let api_key = match cache_res {
        Ok(Some(api_key)) => api_key,
        Ok(None) | Err(_) => {
            let api_key = db::project_api_keys::get_api_key(pool, &api_key_hash).await?;
            let _ = cache
                .insert_with_ttl::<ProjectApiKey>(&cache_key, api_key.clone(), PROJECT_API_KEY_TTL)
                .await;

            api_key
        }
    };

    // Lazy expiration: reject expired keys and purge them from cache + DB so a
    // revoked credential can't linger. Checked on both the cache-hit and DB-read
    // paths because the cached entry carries `expires_at`.
    if let Some(expires_at) = api_key.expires_at
        && Utc::now() > expires_at
    {
        let _ = cache.remove(&cache_key).await;
        let _ = db::project_api_keys::delete_api_key_by_hash(pool, &api_key_hash).await;
        return Err(anyhow::anyhow!("project API key expired"));
    }

    Ok(api_key)
}
