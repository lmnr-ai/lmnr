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
        Ok(Some(api_key)) if !api_key.id.is_nil() => (api_key, true),
        Ok(_) | Err(_) => (
            db::project_api_keys::get_api_key(pool, &api_key_hash).await?,
            false,
        ),
    };

    if !from_cache {
        let _ = cache
            .insert_with_ttl::<ProjectApiKey>(&cache_key, api_key.clone(), PROJECT_API_KEY_TTL)
            .await;
    }

    // Expired keys are kept in DB and cache; expiry is enforced on every call.
    if let Some(expires_at) = api_key.expires_at
        && Utc::now() > expires_at
    {
        return Err(anyhow::anyhow!("project API key expired"));
    }

    Ok(api_key)
}
