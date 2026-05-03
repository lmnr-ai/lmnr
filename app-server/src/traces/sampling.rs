#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::SAMPLING_FACTORS_CACHE_KEY};

/// Pre-computed per-user sampling base factors for a project.
/// Maps user_id -> base_factor.
/// Acceptance probability = min(1.0, sample_rate / 100.0 * base_factor).
pub type UserSamplingFactors = HashMap<String, f64>;

const SAMPLING_FACTORS_TTL_SECONDS: u64 = 3600; // 1 hour
const LOOKBACK_DAYS: i64 = 3;

/// Fetches pre-computed per-user sampling factors using a 3-day lookback
/// window ending at the start of the current hour, cached with 1h TTL.
///
/// On cache miss, queries ClickHouse for user trace counts and computes
/// base factors so subsequent calls skip all computation.
/// The hourly refresh means volume spikes are corrected within one hour.
pub async fn get_sampling_factors_cached(
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
) -> Result<UserSamplingFactors> {
    let now = Utc::now();
    let hour_key = now.format("%Y-%m-%dT%H").to_string();
    let cache_key = format!("{}:{}:{}", SAMPLING_FACTORS_CACHE_KEY, project_id, hour_key);

    match cache.get::<UserSamplingFactors>(&cache_key).await {
        Ok(Some(factors)) => return Ok(factors),
        Ok(None) => {}
        Err(e) => {
            log::warn!(
                "Failed to read sampling factors from cache for project {}: {:?}",
                project_id,
                e
            );
        }
    }

    let window_start = (now - chrono::Duration::days(LOOKBACK_DAYS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let window_end = now.format("%Y-%m-%d %H:00:00").to_string();

    let counts =
        fetch_user_trace_counts(clickhouse, project_id, &window_start, &window_end).await?;
    let factors = compute_sampling_factors(&counts);

    if let Err(e) = cache
        .insert_with_ttl::<UserSamplingFactors>(
            &cache_key,
            factors.clone(),
            SAMPLING_FACTORS_TTL_SECONDS,
        )
        .await
    {
        log::error!(
            "Failed to cache sampling factors for project {}: {:?}",
            project_id,
            e
        );
    }

    Ok(factors)
}

/// Compute per-user base factors from raw trace counts.
///
/// base_factor(user) = total_traces / (total_users * user_trace_count)
///
/// Unknown users (not in the map) get a factor of 1.0, meaning their
/// acceptance probability equals exactly sample_rate / 100.
fn compute_sampling_factors(counts: &HashMap<String, u64>) -> UserSamplingFactors {
    if counts.is_empty() {
        return HashMap::new();
    }

    let total_traces: u64 = counts.values().sum();
    let total_users = counts.len() as u64;

    if total_traces == 0 || total_users == 0 {
        return HashMap::new();
    }

    let denominator_base = total_users as f64;
    let numerator = total_traces as f64;

    counts
        .iter()
        .map(|(user_id, &count)| {
            let factor = numerator / (denominator_base * count as f64);
            (user_id.clone(), factor)
        })
        .collect()
}

/// Query ClickHouse for per-user trace counts within the given time window.
/// Boundaries are passed in to ensure consistency with the cache key.
async fn fetch_user_trace_counts(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    from: &str,
    to: &str,
) -> Result<HashMap<String, u64>> {
    #[derive(Debug, clickhouse::Row, serde::Deserialize)]
    struct UserCount {
        user_id: String,
        cnt: u64,
    }

    let rows = clickhouse
        .query(
            "SELECT user_id, count(1) as cnt \
             FROM traces_replacing FINAL \
             WHERE project_id = ? \
             AND start_time >= ? AND start_time < ? \
             GROUP BY user_id",
        )
        .bind(project_id)
        .bind(from)
        .bind(to)
        .fetch_all::<UserCount>()
        .await?;

    Ok(rows.into_iter().map(|r| (r.user_id, r.cnt)).collect())
}

/// Determines whether a trace should be processed based on per-user sampling.
///
/// Looks up the pre-computed base factor for the user and applies the
/// signal's sample_rate to get the acceptance probability:
///   p = min(1.0, sample_rate / 100.0 * base_factor)
///
/// Users not seen in the lookback window get a factor of 1.0.
/// Empty factors map (no historical data) also uses factor 1.0, applying
/// uniform sampling at exactly sample_rate / 100.
pub fn should_sample_trace(
    sample_rate: i16,
    user_id: &Option<String>,
    factors: &UserSamplingFactors,
) -> bool {
    let base_factor = if factors.is_empty() {
        1.0
    } else {
        let key = user_id.as_deref().unwrap_or("");
        factors.get(key).copied().unwrap_or(1.0)
    };

    let p = ((sample_rate as f64 / 100.0) * base_factor).min(1.0);

    rand::Rng::random::<f64>(&mut rand::rng()) < p
}
