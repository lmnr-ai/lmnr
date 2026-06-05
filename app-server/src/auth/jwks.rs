use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow};
use jsonwebtoken::{DecodingKey, jwk::Jwk};
use sqlx::PgPool;
use tokio::sync::RwLock;

const FRESH_TTL: Duration = Duration::from_secs(5 * 60);

pub struct JwksCache {
    keys: HashMap<String, DecodingKey>,
    fetched_at: Instant,
}

impl JwksCache {
    fn is_fresh(&self) -> bool {
        self.fetched_at.elapsed() < FRESH_TTL
    }
}

fn cache_handle() -> &'static RwLock<Option<JwksCache>> {
    static HANDLE: OnceLock<RwLock<Option<JwksCache>>> = OnceLock::new();
    HANDLE.get_or_init(|| RwLock::new(None))
}

fn decoding_key_from_jwk_value(value: &serde_json::Value) -> Result<DecodingKey> {
    let jwk: Jwk = serde_json::from_value(value.clone()).context("parsing JWK")?;
    DecodingKey::from_jwk(&jwk).context("building DecodingKey from JWK")
}

/// Refresh the cache by reading every currently-valid signing key from Postgres.
async fn refresh_cache(db: &PgPool) -> Result<JwksCache> {
    let rows: Vec<(String, serde_json::Value)> = sqlx::query_as(
        "SELECT kid, public_jwk FROM oauth_signing_keys WHERE expires_at IS NULL OR expires_at > now()",
    )
    .fetch_all(db)
    .await
    .context("loading oauth_signing_keys")?;

    let mut keys = HashMap::new();
    for (kid, jwk_value) in rows {
        match decoding_key_from_jwk_value(&jwk_value) {
            Ok(k) => {
                keys.insert(kid, k);
            }
            Err(e) => {
                log::warn!("skipping malformed oauth_signing_keys row kid={kid}: {e:#}");
            }
        }
    }
    Ok(JwksCache {
        keys,
        fetched_at: Instant::now(),
    })
}

/// Resolve a `kid` to a `DecodingKey`. Reads directly from Postgres
/// (`oauth_signing_keys`) — the table the frontend writes to when it mints a
/// key — and memoises the map in-process for `FRESH_TTL`. On a fresh-cache
/// miss we always reload from the DB once, in case the key was just rotated
/// in.
pub async fn get_decoding_key(kid: &str, db: &PgPool) -> Result<DecodingKey> {
    // Fast path: fresh cache hit.
    {
        let guard = cache_handle().read().await;
        if let Some(cache) = guard.as_ref() {
            if cache.is_fresh() {
                if let Some(k) = cache.keys.get(kid) {
                    return Ok(k.clone());
                }
            }
        }
    }

    // Either stale or kid-miss — reload the full active key set. The DB is the
    // source of truth so we don't need a stale-fallback window.
    let new_cache = refresh_cache(db).await?;
    let result = new_cache.keys.get(kid).cloned();
    {
        let mut guard = cache_handle().write().await;
        *guard = Some(new_cache);
    }

    result.ok_or_else(|| anyhow!("kid {kid} not found in oauth_signing_keys"))
}

/// Test-only helper to seed the cache without touching Postgres. Used by the
/// JWT validator unit test in `auth::jwt::tests`.
#[cfg(test)]
pub async fn _seed_cache_from_set(set: &jsonwebtoken::jwk::JwkSet) {
    let mut keys = HashMap::new();
    for jwk in &set.keys {
        if let Some(kid) = jwk.common.key_id.clone() {
            if let Ok(key) = DecodingKey::from_jwk(jwk) {
                keys.insert(kid, key);
            }
        }
    }
    let mut guard = cache_handle().write().await;
    *guard = Some(JwksCache {
        keys,
        fetched_at: Instant::now(),
    });
}

