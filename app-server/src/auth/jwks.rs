use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow};
use jsonwebtoken::{DecodingKey, jwk::JwkSet};
use tokio::sync::RwLock;

const FRESH_TTL: Duration = Duration::from_secs(10 * 60);
const STALE_FALLBACK_TTL: Duration = Duration::from_secs(24 * 60 * 60);

pub struct JwksCache {
    keys: HashMap<String, DecodingKey>,
    fetched_at: Instant,
    last_force_refresh: Option<Instant>,
}

impl JwksCache {
    fn from_set(set: &JwkSet) -> Self {
        let mut keys = HashMap::new();
        for jwk in &set.keys {
            if let Some(kid) = jwk.common.key_id.clone() {
                if let Ok(key) = DecodingKey::from_jwk(jwk) {
                    keys.insert(kid, key);
                }
            }
        }
        Self {
            keys,
            fetched_at: Instant::now(),
            last_force_refresh: None,
        }
    }

    fn is_fresh(&self) -> bool {
        self.fetched_at.elapsed() < FRESH_TTL
    }

    fn is_too_stale(&self) -> bool {
        self.fetched_at.elapsed() > STALE_FALLBACK_TTL
    }
}

fn cache_handle() -> &'static RwLock<Option<JwksCache>> {
    static HANDLE: OnceLock<RwLock<Option<JwksCache>>> = OnceLock::new();
    HANDLE.get_or_init(|| RwLock::new(None))
}

pub fn jwks_url() -> String {
    if let Ok(explicit) = std::env::var("JWKS_URL") {
        return explicit;
    }
    let base =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3010".to_string());
    let trimmed = base.trim_end_matches('/');
    format!("{trimmed}/oauth/jwks")
}

async fn fetch_jwks(http: &reqwest::Client, url: &str) -> Result<JwkSet> {
    let resp = http
        .get(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .with_context(|| format!("fetching JWKS from {url}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!(
            "JWKS endpoint {} returned status {}",
            url,
            resp.status()
        ));
    }
    let set: JwkSet = resp.json().await.context("decoding JWKS")?;
    Ok(set)
}

async fn refresh_cache(http: &reqwest::Client, url: &str) -> Result<()> {
    let set = fetch_jwks(http, url).await?;
    let new_cache = JwksCache::from_set(&set);
    let mut guard = cache_handle().write().await;
    *guard = Some(new_cache);
    Ok(())
}

/// Resolve a `kid` to a `DecodingKey`, fetching / refreshing the cache as
/// needed. Best-effort: on a fetch failure with a still-stale-but-recent
/// cache we return the cached key (fail-open up to 24h).
pub async fn get_decoding_key(http: &reqwest::Client, kid: &str) -> Result<DecodingKey> {
    let url = jwks_url();

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

    // Refresh attempt. If anyone else just refreshed (race), we may end up
    // refreshing twice — harmless.
    let refresh_result = refresh_cache(http, &url).await;

    {
        let guard = cache_handle().read().await;
        if let Some(cache) = guard.as_ref() {
            if let Some(k) = cache.keys.get(kid) {
                return Ok(k.clone());
            }
            // kid missing — one more forced refresh (rotation race window),
            // throttled to once per minute per kid-miss to avoid pummeling
            // the issuer.
            let should_force = cache
                .last_force_refresh
                .map(|t| t.elapsed() > Duration::from_secs(60))
                .unwrap_or(true);
            drop(guard);
            if should_force {
                let _ = refresh_cache(http, &url).await;
                if let Some(cache) = cache_handle().write().await.as_mut() {
                    cache.last_force_refresh = Some(Instant::now());
                }
                let guard = cache_handle().read().await;
                if let Some(cache) = guard.as_ref() {
                    if let Some(k) = cache.keys.get(kid) {
                        return Ok(k.clone());
                    }
                }
            }
        }
    }

    // No cache available and refresh failed.
    if let Err(e) = refresh_result {
        let guard = cache_handle().read().await;
        if let Some(cache) = guard.as_ref() {
            if !cache.is_too_stale() {
                if let Some(k) = cache.keys.get(kid) {
                    return Ok(k.clone());
                }
            }
        }
        return Err(e);
    }

    Err(anyhow!("kid {kid} not found in JWKS"))
}

/// Test-only helper to seed the cache (e.g. for unit tests against a wiremock).
#[cfg(test)]
pub async fn _seed_cache_from_set(set: &JwkSet) {
    let mut guard = cache_handle().write().await;
    *guard = Some(JwksCache::from_set(set));
}
