//! Tells the scheduler when span ingestion is behind. Producers record when
//! they last accepted spans, consumers record the intake time of the newest
//! spans they stored. The gap between the two is the backlog in seconds, and
//! it keeps growing if consumers stop altogether.

use std::sync::atomic::{AtomicI64, Ordering};

use chrono::Utc;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{SPANS_ACCEPTED_AT_CACHE_KEY, SPANS_STORED_UP_TO_CACHE_KEY},
    },
    env::metric_alerts::METRIC_ALERTS_INGESTION_LAG_SECONDS,
};

const ACCEPTED_TTL_SECONDS: u64 = 24 * 60 * 60;
// Outlives the accepted watermark, so an idle pipeline never reads as behind.
const STORED_TTL_SECONDS: u64 = 2 * ACCEPTED_TTL_SECONDS;
/// Each process writes a watermark at most this often.
const RECORD_INTERVAL_MS: i64 = 1000;

static ACCEPTED_RECORDED_AT_MS: AtomicI64 = AtomicI64::new(0);
static STORED_RECORDED_AT_MS: AtomicI64 = AtomicI64::new(0);

/// True when this process has not written the watermark for a second.
fn claim_write(recorded_at_ms: &AtomicI64, now_ms: i64) -> bool {
    let last = recorded_at_ms.load(Ordering::Relaxed);
    now_ms - last >= RECORD_INTERVAL_MS
        && recorded_at_ms
            .compare_exchange(last, now_ms, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
}

async fn write_watermark(cache: &Cache, key: &str, value_ms: i64, ttl_seconds: u64) {
    if let Err(e) = cache.insert_with_ttl(key, value_ms, ttl_seconds).await {
        log::warn!("[Metric alerts] Failed to record {key}: {e:?}");
    }
}

/// Called once a producer has queued spans it stamped with `accepted_at_ms`.
pub async fn record_accepted(cache: &Cache, accepted_at_ms: i64) {
    if claim_write(&ACCEPTED_RECORDED_AT_MS, Utc::now().timestamp_millis()) {
        write_watermark(
            cache,
            SPANS_ACCEPTED_AT_CACHE_KEY,
            accepted_at_ms,
            ACCEPTED_TTL_SECONDS,
        )
        .await;
    }
}

/// Called after a consumer stored a batch whose newest spans were accepted at
/// `accepted_at_ms`.
pub async fn record_stored(cache: &Cache, accepted_at_ms: i64) {
    if claim_write(&STORED_RECORDED_AT_MS, Utc::now().timestamp_millis()) {
        write_watermark(
            cache,
            SPANS_STORED_UP_TO_CACHE_KEY,
            accepted_at_ms,
            STORED_TTL_SECONDS,
        )
        .await;
    }
}

/// Whether stored spans trail accepted spans by more than the allowed lag.
pub async fn is_behind(cache: &Cache) -> bool {
    let accepted = cache.get::<i64>(SPANS_ACCEPTED_AT_CACHE_KEY).await;
    let stored = cache.get::<i64>(SPANS_STORED_UP_TO_CACHE_KEY).await;
    let allowed_ms = METRIC_ALERTS_INGESTION_LAG_SECONDS.get() * 1000;
    match (accepted, stored) {
        (Ok(Some(accepted)), Ok(Some(stored))) => accepted - stored > allowed_ms,
        // Spans were accepted and nothing is known to be stored.
        (Ok(Some(_)), Ok(None)) => true,
        (Ok(None), _) => false,
        (Err(e), _) | (_, Err(e)) => {
            log::warn!("[Metric alerts] Failed to read ingestion watermarks: {e:?}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::cache::in_memory::InMemoryCache;

    use super::*;

    #[tokio::test]
    async fn behind_when_stored_spans_trail_accepted_spans() {
        let cache = Cache::InMemory(InMemoryCache::new(None));
        let allowed_ms = METRIC_ALERTS_INGESTION_LAG_SECONDS.get() * 1000;
        let now_ms = Utc::now().timestamp_millis();
        assert!(!is_behind(&cache).await, "no traffic");

        cache
            .insert(SPANS_ACCEPTED_AT_CACHE_KEY, now_ms)
            .await
            .unwrap();
        assert!(is_behind(&cache).await, "accepted, nothing stored");

        let stored = now_ms - allowed_ms;
        cache
            .insert(SPANS_STORED_UP_TO_CACHE_KEY, stored)
            .await
            .unwrap();
        assert!(!is_behind(&cache).await, "within the allowed lag");

        cache
            .insert(SPANS_STORED_UP_TO_CACHE_KEY, stored - 1)
            .await
            .unwrap();
        assert!(is_behind(&cache).await, "past the allowed lag");
    }
}
