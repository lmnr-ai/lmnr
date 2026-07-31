use std::{sync::Arc, time::Duration};

use actix_limitation::{Error as LimiterError, Limiter};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::INGESTION_RATE_LIMIT_CACHE_KEY};

/// Per-project data-ingestion rate limiter, shared by the gRPC and HTTP OTLP
/// trace endpoints — both count the same `ingestion_ratelimit:{project_id}`
/// key so neither transport can bypass the other. A shared
/// `actix_limitation::Limiter` carries the global default N
/// (`INGESTION_RATE_LIMIT`); a per-project override N stored out-of-band in
/// cache (`ingestion_rate_limit:{project_id}`, set via valkey-cli) swaps in an
/// ad-hoc limiter with the same period. Only N is overridable; the period is
/// global (`INGESTION_RATE_LIMIT_PERIOD_SECS`). Built in main.rs when
/// `Feature::IngestionRateLimiter` is enabled. Mirrors `SqlRateLimiter`.
pub struct IngestionRateLimiter {
    default_limiter: Limiter,
    redis_url: String,
    period_secs: u64,
}

impl IngestionRateLimiter {
    pub fn new(default_limiter: Limiter, redis_url: String, period_secs: u64) -> Self {
        Self {
            default_limiter,
            redis_url,
            period_secs,
        }
    }

    /// Fail-open: cache/builder errors fall back to the default limiter.
    async fn limiter_for_project(&self, cache: &Cache, project_id: Uuid) -> Limiter {
        let limit = match cache
            .get::<usize>(&format!("{INGESTION_RATE_LIMIT_CACHE_KEY}:{project_id}"))
            .await
        {
            Ok(limit) => limit,
            Err(e) => {
                log::error!("Failed to read ingestion rate limit override, using default: {e:?}");
                None
            }
        };
        let Some(limit) = limit else {
            return self.default_limiter.clone();
        };
        match Limiter::builder(&self.redis_url)
            .limit(limit)
            .period(Duration::from_secs(self.period_secs))
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

    /// Returns `true` when the request is allowed. Fail-open on Redis errors —
    /// same posture as the bytes-limit check — so a Redis blip can't
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
