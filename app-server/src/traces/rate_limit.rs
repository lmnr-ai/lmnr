use std::{sync::Arc, time::Duration};

use actix_limitation::{Error as LimiterError, Limiter};
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::cache::{
    Cache, CacheTrait,
    keys::{INGESTION_RATE_LIMIT_CACHE_KEY, INGESTION_RATE_LIMIT_PERIOD_CACHE_KEY},
};

/// Per-project data-ingestion rate limiter, shared by the gRPC and HTTP OTLP
/// trace endpoints — both count the same `ingestion_ratelimit:{project_id}`
/// key so neither transport can bypass the other. A shared
/// `actix_limitation::Limiter` carries the global defaults
/// (`INGESTION_RATE_LIMIT` / `INGESTION_RATE_LIMIT_PERIOD_SECS`); per-project
/// overrides stored out-of-band in cache
/// (`ingestion_project_rate_limit:{project_id}` for N,
/// `ingestion_project_rate_limit_period:{project_id}` for the window seconds,
/// set via valkey-cli) swap in an ad-hoc limiter — either override can be set
/// independently, the other value falls back to the global default. Built in
/// main.rs when `Feature::IngestionRateLimiter` is enabled. Mirrors
/// `SqlRateLimiter`.
pub struct IngestionRateLimiter {
    default_limiter: Limiter,
    redis_url: String,
    default_limit: usize,
    default_period_secs: u64,
}

impl IngestionRateLimiter {
    pub fn new(
        default_limiter: Limiter,
        redis_url: String,
        default_limit: usize,
        default_period_secs: u64,
    ) -> Self {
        Self {
            default_limiter,
            redis_url,
            default_limit,
            default_period_secs,
        }
    }

    /// Fail-open: a cache read error counts as "no override".
    async fn read_override<T: DeserializeOwned>(
        cache: &Cache,
        key_prefix: &str,
        project_id: Uuid,
    ) -> Option<T> {
        match cache.get::<T>(&format!("{key_prefix}:{project_id}")).await {
            Ok(value) => value,
            Err(e) => {
                log::error!(
                    "Failed to read ingestion rate limit override ({key_prefix}), using default: {e:?}"
                );
                None
            }
        }
    }

    /// Fail-open: cache/builder errors fall back to the default limiter.
    async fn limiter_for_project(&self, cache: &Cache, project_id: Uuid) -> Limiter {
        let limit =
            Self::read_override::<usize>(cache, INGESTION_RATE_LIMIT_CACHE_KEY, project_id).await;
        let period_secs =
            Self::read_override::<u64>(cache, INGESTION_RATE_LIMIT_PERIOD_CACHE_KEY, project_id)
                .await;
        if limit.is_none() && period_secs.is_none() {
            return self.default_limiter.clone();
        }
        match Limiter::builder(&self.redis_url)
            .limit(limit.unwrap_or(self.default_limit))
            .period(Duration::from_secs(
                period_secs.unwrap_or(self.default_period_secs),
            ))
            .build()
        {
            Ok(limiter) => limiter,
            Err(e) => {
                log::error!(
                    "Failed to build override ingestion rate limiter, using default: {e:?}"
                );
                self.default_limiter.clone()
            }
        }
    }

    /// Returns `true` when the request is allowed. Fail-open on Redis errors, a Redis blip can't
    /// black-hole ingestion.
    pub async fn check(&self, cache: &Arc<Cache>, project_id: Uuid) -> bool {
        let limiter = self.limiter_for_project(cache.as_ref(), project_id).await;
        match limiter
            .count(format!("ingestion_ratelimit:{project_id}"))
            .await
        {
            Ok(_) => true,
            Err(LimiterError::LimitExceeded(_)) => false,
            Err(e) => {
                log::error!("Ingestion rate limiter error, allowing request: {e:?}");
                true
            }
        }
    }
}
