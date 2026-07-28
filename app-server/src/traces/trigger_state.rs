//! Thin per-trace state backing the cross-batch signal trigger conditions
//! (LAM-2020).
//!
//! Two conditions can't be answered from a single ingest batch: "status is /
//! is not error" (an error span may have arrived in an earlier batch) and
//! "total tokens <op> N" (a running sum). Rather than re-reading cumulative
//! trace state from ClickHouse on every batch, each is kept in its own
//! short-lived cache key, updated per batch and read back from `traces_agg`
//! only on a miss (roughly once per trace per TTL).
//!
//! One key per column is deliberate: `total_tokens` uses an atomic INCRBY and
//! `seen_error` is a set-once flag, so two batches for the same trace can't
//! clobber each other. A single JSON object would need a read-modify-write and
//! would race.

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::cache::{
    Cache, CacheTrait,
    keys::{TRACE_SEEN_ERROR_CACHE_KEY, TRACE_TOTAL_TOKENS_CACHE_KEY},
};
use crate::ch::{traces::TraceAggregation, traces_agg};
use crate::traces::trigger_conditions::TraceTriggerState;

/// Long enough to cover an agent trace's active window, short enough that a
/// stale key costs one extra read-back rather than lingering for a day. A miss
/// is always safe — the read-back reconstructs from `traces_agg`.
const TTL_SECONDS: u64 = 30 * 60;

fn seen_error_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{TRACE_SEEN_ERROR_CACHE_KEY}:{project_id}:{trace_id}")
}

fn total_tokens_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{TRACE_TOTAL_TOKENS_CACHE_KEY}:{project_id}:{trace_id}")
}

/// Fold this batch's deltas into the per-trace state and return the resulting
/// cumulative state per trace id.
///
/// Ordering matters: the cache is updated with this batch's contribution
/// BEFORE the returned state is used for evaluation, so a trigger sees totals
/// that include the batch that triggered it.
///
/// On a cache miss the trace's cumulative state is read back from `traces_agg`
/// and seeded, so a key that expired mid-trace (or a fresh replica) doesn't
/// silently restart the running total at this batch's delta. Cache errors
/// degrade to the batch-local delta — under-counting a running total can only
/// delay a trigger to the next batch, whereas failing the flush would stall
/// ingestion.
///
/// Both keys are re-stamped on every batch and a miss on EITHER one triggers
/// the read-back, so their TTL windows can't drift apart and drop the error
/// latch on a long-running trace.
pub async fn update_and_read(
    aggregations: &[TraceAggregation],
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
) -> HashMap<Uuid, TraceTriggerState> {
    let mut states = HashMap::with_capacity(aggregations.len());

    for agg in aggregations {
        let tokens_key = total_tokens_key(agg.project_id, agg.trace_id);
        let error_key = seen_error_key(agg.project_id, agg.trace_id);

        // Read the error flag BEFORE deciding whether to re-seed. The two keys
        // must share one lifetime: the tokens key is re-stamped on every batch
        // (INCRBY drops the TTL), but the error key is only rewritten by a
        // batch that itself errored — so a long-lived trace could keep a warm
        // tokens key while the error latch silently expired, and later clean
        // batches would see the trace as never having errored. Treating a miss
        // on EITHER key as "state unknown" re-seeds both from `traces_agg`, and
        // the unconditional `set_ttl` pair below keeps their windows aligned
        // from then on.
        let mut seen_error = cache
            .get::<bool>(&error_key)
            .await
            .unwrap_or(None)
            .unwrap_or(false);
        let tokens_known = cache.exists(&tokens_key).await.unwrap_or(false);

        if !tokens_known || !seen_error {
            // `seen_error == false` is ambiguous (never errored vs. latch
            // expired), so the read-back resolves it. Cheap: it only runs while
            // the trace is clean, and stops once an error is latched.
            if let Some(seed) = read_back(clickhouse, agg.project_id, agg.trace_id).await {
                if !tokens_known {
                    // Seed the PRIOR total only — this batch's delta is added by
                    // the increment below, and `traces_agg` already contains this
                    // batch's partial (inserted earlier in the same flush), so
                    // subtract it back out to avoid double-counting.
                    let prior = (seed.total_tokens - agg.total_tokens).max(0);
                    if let Err(e) = cache.insert_with_ttl(&tokens_key, prior, TTL_SECONDS).await {
                        log::warn!(
                            "Failed to seed trace token state for {}: {:?}",
                            agg.trace_id,
                            e
                        );
                    }
                }
                seen_error |= seed.seen_error;
            }
        }

        // This batch's own error latches too — `traces_agg` may not have merged
        // the partial into a readable `statuses` array yet.
        seen_error |= agg.status.as_deref() == Some("error");

        let total_tokens = match cache.increment(&tokens_key, agg.total_tokens).await {
            Ok(total) => total,
            Err(e) => {
                log::warn!(
                    "Failed to update trace token state for {}; falling back to this \
                     batch's delta: {:?}",
                    agg.trace_id,
                    e
                );
                agg.total_tokens
            }
        };

        // Re-stamp BOTH keys every batch, so their windows can never diverge.
        // INCRBY above creates the tokens key without a TTL; the error key is
        // rewritten (rather than just extended) because a `false` latch is not
        // persisted at all — only a `true` one is worth a key.
        if let Err(e) = cache.set_ttl(&tokens_key, TTL_SECONDS).await {
            log::warn!("Failed to set TTL on {}: {:?}", tokens_key, e);
        }
        if seen_error
            && let Err(e) = cache.insert_with_ttl(&error_key, true, TTL_SECONDS).await
        {
            log::warn!(
                "Failed to record trace error state for {}: {:?}",
                agg.trace_id,
                e
            );
        }

        states.insert(
            agg.trace_id,
            TraceTriggerState {
                seen_error,
                total_tokens,
            },
        );
    }

    states
}

/// Cumulative state for one trace straight from `traces_agg`. `None` on error
/// or when the trace has no rows yet.
async fn read_back(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Option<TraceTriggerState> {
    match traces_agg::fetch_trace_states(clickhouse, project_id, &[trace_id]).await {
        Ok(states) => states.first().map(|state| TraceTriggerState {
            seen_error: state.status == "error",
            total_tokens: state.total_tokens,
        }),
        Err(e) => {
            log::warn!(
                "Failed to read back trigger state for trace {} in project {}: {:?}",
                trace_id,
                project_id,
                e
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::cache::in_memory::InMemoryCache;

    use super::*;

    fn agg(project_id: Uuid, trace_id: Uuid, tokens: i64, status: Option<&str>) -> TraceAggregation {
        let mut a = TraceAggregation::empty_for_test(project_id, trace_id);
        a.total_tokens = tokens;
        a.status = status.map(String::from);
        a
    }

    /// The running total must accumulate across batches, and `seen_error` must
    /// stay true once any batch errored — the two facts a single batch can't
    /// answer on its own.
    #[tokio::test]
    async fn accumulates_tokens_and_latches_error_across_batches() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let s1 = update_and_read(&[agg(pid, tid, 400, None)], cache.clone(), &ch).await;
        assert_eq!(s1[&tid].total_tokens, 400);
        assert!(!s1[&tid].seen_error);

        let s2 = update_and_read(&[agg(pid, tid, 700, Some("error"))], cache.clone(), &ch).await;
        assert_eq!(s2[&tid].total_tokens, 1100, "must include batch 1");
        assert!(s2[&tid].seen_error);

        // A later clean batch must NOT clear the latched error.
        let s3 = update_and_read(&[agg(pid, tid, 1, Some("success"))], cache.clone(), &ch).await;
        assert_eq!(s3[&tid].total_tokens, 1101);
        assert!(s3[&tid].seen_error, "error must latch across batches");
    }

    /// A batch that inherits an already-latched error must re-persist the latch
    /// (that write is what re-stamps its TTL), not merely read it.
    ///
    /// Why this matters: the tokens key gets a fresh TTL on EVERY batch, because
    /// INCRBY drops it and `set_ttl` follows. The latch used to be written only
    /// by a batch that itself carried an error, so on a long-lived trace the two
    /// windows diverged — tokens stayed warm while the latch aged out, and later
    /// clean batches saw a trace that had never errored, flipping both
    /// `status = error` and `status != error` to the wrong answer.
    ///
    /// The assertion is on the WRITE, using a non-boolean sentinel that reads
    /// back as `None`: only a batch that writes `true` over it leaves the key
    /// deserializable as a bool. A real TTL expiry isn't observable here because
    /// the in-memory cache's `set_ttl` spawns an actual 30-minute sleep.
    #[tokio::test]
    async fn latch_is_repersisted_by_every_batch_that_resolves_it() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        update_and_read(&[agg(pid, tid, 100, Some("error"))], cache.clone(), &ch).await;

        for _ in 0..3 {
            cache
                .insert(&seen_error_key(pid, tid), "sentinel")
                .await
                .unwrap();
            let s = update_and_read(&[agg(pid, tid, 5, Some("error"))], cache.clone(), &ch).await;
            assert!(s[&tid].seen_error);
            assert_eq!(
                cache.get::<bool>(&seen_error_key(pid, tid)).await.unwrap(),
                Some(true),
                "every batch resolving seen_error=true must re-persist the key \
                 so its TTL tracks the tokens key"
            );
        }
    }

    /// A latch lost to eviction is recovered from `traces_agg` — the read-back
    /// now runs whenever the error flag is absent, not only when the tokens key
    /// is missing. With ClickHouse unreachable there is no source of truth, so
    /// the state degrades to "clean" rather than failing the flush.
    #[tokio::test]
    async fn evicted_latch_degrades_when_read_back_unavailable() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        update_and_read(&[agg(pid, tid, 100, Some("error"))], cache.clone(), &ch).await;
        cache.remove(&seen_error_key(pid, tid)).await.unwrap();

        let after = update_and_read(&[agg(pid, tid, 10, None)], cache.clone(), &ch).await;
        assert!(!after[&tid].seen_error);
        // The running total is unaffected — that key was never evicted.
        assert_eq!(after[&tid].total_tokens, 110);
    }

    /// Separate traces must not share state, and separate projects must not
    /// collide on the same trace id.
    #[tokio::test]
    async fn state_is_scoped_per_project_and_trace() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let p1 = Uuid::new_v4();
        let p2 = Uuid::new_v4();
        let shared_tid = Uuid::new_v4();

        update_and_read(&[agg(p1, shared_tid, 500, Some("error"))], cache.clone(), &ch).await;
        let other = update_and_read(&[agg(p2, shared_tid, 7, None)], cache.clone(), &ch).await;

        assert_eq!(other[&shared_tid].total_tokens, 7);
        assert!(!other[&shared_tid].seen_error);
    }

    /// A dead ClickHouse (read-back seed fails) must still fold the batch in
    /// rather than failing the flush.
    #[tokio::test]
    async fn degrades_when_read_back_is_unavailable() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let states = update_and_read(&[agg(pid, tid, 250, None)], cache, &ch).await;
        assert_eq!(states[&tid].total_tokens, 250);
    }
}
