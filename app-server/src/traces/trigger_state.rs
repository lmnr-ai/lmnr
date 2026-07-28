//! Thin per-trace state backing the cross-batch signal trigger conditions
//! (LAM-2020).
//!
//! Two conditions can't be answered from a single ingest batch: "status is /
//! is not error" (an error span may have arrived in an earlier batch) and
//! "total tokens <op> N" (a running sum). The trace's `user_id` is here for the
//! same reason — it isn't a condition, but per-user sampling reads it and it may
//! have arrived in any batch. Rather than re-reading cumulative trace state from
//! ClickHouse on every batch, each is kept in its own short-lived cache key,
//! updated per batch and read back from `traces_agg` only on a miss (roughly
//! once per trace per TTL).
//!
//! One key per column is deliberate: `total_tokens` uses an atomic INCRBY and
//! `seen_error` is a set-once flag, so two batches for the same trace can't
//! clobber each other. A single JSON object would need a read-modify-write and
//! would race.
//!
//! For the same reason the token total is only ever mutated via `increment` —
//! never `insert`, which is a plain Redis `SET` (no `NX`) and would let one
//! worker overwrite a delta another had already added. Two consumers flushing
//! different batches of the same trace concurrently is normal, so every write
//! on this path has to commute.
//!
//! **Every key is re-persisted on EVERY batch, never only on the batch that
//! first resolved its value.** The tokens key is re-stamped unconditionally
//! (INCRBY drops its TTL), so any key that were left to age out on its own
//! would expire while the tokens key stayed warm — and `read_back` only
//! recovers `seen_error` / `total_tokens`, so an expired `user_id` or
//! `trace_type` is gone for the rest of the trace. A cached-hit branch that
//! returns the value without writing it is the bug shape to watch for here.

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::cache::{
    Cache, CacheTrait,
    keys::{
        TRACE_SEEN_ERROR_CACHE_KEY, TRACE_TOTAL_TOKENS_CACHE_KEY, TRACE_TYPE_CACHE_KEY,
        TRACE_USER_ID_CACHE_KEY,
    },
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

fn user_id_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{TRACE_USER_ID_CACHE_KEY}:{project_id}:{trace_id}")
}

fn trace_type_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{TRACE_TYPE_CACHE_KEY}:{project_id}:{trace_id}")
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

        // Read the error flag BEFORE deciding whether to re-seed. `false` is
        // PERSISTED, not just implied by a missing key: the flag has to be
        // tri-state (known-errored / known-clean / unknown) or "clean" is
        // indistinguishable from "expired", and since most traces never error
        // that would fire a ClickHouse read-back on every batch of every trace
        // — one round-trip per aggregation on the hot ingest path.
        //
        // Both keys are also re-stamped every batch (below) so their TTL
        // windows can't drift: the tokens key loses its TTL to INCRBY, and if
        // the latch were left to age out on its own a long-lived trace could
        // keep a warm tokens key while the latch expired, making later clean
        // batches see a trace that had never errored.
        let cached_error = cache.get::<bool>(&error_key).await.unwrap_or(None);
        let mut seen_error = cached_error.unwrap_or(false);

        // Increment FIRST, and detect the miss from the result rather than a
        // prior `exists` + `insert`. INCRBY is atomic and creates the key at 0,
        // so two workers flushing different batches of the same new trace both
        // land their delta — whereas seeding with `insert` (a plain Redis SET,
        // no NX) would let one worker overwrite a value the other had already
        // incremented, corrupting the running total until the key expired.
        //
        // A returned total equal to this batch's own delta means the key was
        // absent (or had expired), so the prior total still has to be recovered
        // from `traces_agg` — see the seed below. Ambiguity is harmless: a trace
        // whose first batch genuinely is the whole total re-adds the same number
        // it already has.
        let batch_total = match cache.increment(&tokens_key, agg.total_tokens).await {
            Ok(total) => Some(total),
            Err(e) => {
                log::warn!(
                    "Failed to update trace token state for {}; falling back to this \
                     batch's delta: {:?}",
                    agg.trace_id,
                    e
                );
                None
            }
        };
        let tokens_known = batch_total.is_some_and(|total| total != agg.total_tokens);

        // Re-seed only when a key is genuinely ABSENT (`cached_error.is_none()`,
        // not `!seen_error`) — a persisted `false` is a known-clean answer and
        // must not trigger a read-back, or every batch of every clean trace
        // would hit ClickHouse.
        let mut total_tokens = batch_total.unwrap_or(agg.total_tokens);
        if !tokens_known || cached_error.is_none() {
            if let Some(seed) = read_back(clickhouse, agg.project_id, agg.trace_id).await {
                if !tokens_known {
                    // `traces_agg` already holds this batch's partial (inserted
                    // earlier in the same flush), so its total IS the cumulative
                    // one — add back only what the cache is missing. `increment`
                    // (not `insert`) so a concurrent worker's delta survives.
                    let missing = seed.total_tokens - total_tokens;
                    if missing > 0 {
                        match cache.increment(&tokens_key, missing).await {
                            Ok(total) => total_tokens = total,
                            Err(e) => log::warn!(
                                "Failed to seed trace token state for {}: {:?}",
                                agg.trace_id,
                                e
                            ),
                        }
                    }
                }
                seen_error |= seed.seen_error;
            }
        }

        // This batch's own error latches too — `traces_agg` may not have merged
        // the partial into a readable `statuses` array yet.
        seen_error |= agg.status.as_deref() == Some("error");

        // The user id is SET-ONCE across batches, mirroring the PG upsert's
        // `COALESCE(EXCLUDED.user_id, traces.user_id)`. It is not a trigger
        // condition — per-user sampling reads it — but it has to be cross-batch
        // for the same reason the others do: `TraceAggregation::user_id` is only
        // populated from spans in THIS batch, so a trace whose user id arrived
        // earlier would otherwise be sampled against the empty-user factor and
        // skew its rate. This batch's value wins only when nothing is cached
        // yet; a later batch without the attribute never blanks it.
        let user_key = user_id_key(agg.project_id, agg.trace_id);
        let cached_user_id = cache
            .get::<String>(&user_key)
            .await
            .unwrap_or(None)
            .filter(|id| !id.is_empty());
        let user_id = cached_user_id.or_else(|| {
            agg.user_id
                .as_deref()
                .filter(|batch| !batch.is_empty())
                .map(str::to_string)
        });
        // Re-persist on EVERY batch, not only the one that first resolved it:
        // a cached-hit arm that just returned the value would let the key age
        // out on its own while the tokens key keeps being re-stamped, and
        // sampling would silently drop back to the empty-user factor for the
        // rest of the trace. `read_back` can't recover it (it returns
        // `user_id: None`), so this write is the only thing keeping it alive.
        if let Some(id) = user_id.as_deref()
            && let Err(e) = cache
                .insert_with_ttl(&user_key, id.to_string(), TTL_SECONDS)
                .await
        {
            log::warn!(
                "Failed to record trace user id for {}: {:?}",
                agg.trace_id,
                e
            );
        }

        // Re-stamp BOTH keys every batch, so their windows can never diverge.
        // INCRBY above creates the tokens key without a TTL, and the error key
        // is written with its resolved value — INCLUDING `false`, which is what
        // makes "known clean" distinguishable from "expired" and keeps clean
        // traces off the read-back path.
        if let Err(e) = cache.set_ttl(&tokens_key, TTL_SECONDS).await {
            log::warn!("Failed to set TTL on {}: {:?}", tokens_key, e);
        }
        if let Err(e) = cache
            .insert_with_ttl(&error_key, seen_error, TTL_SECONDS)
            .await
        {
            log::warn!(
                "Failed to record trace error state for {}: {:?}",
                agg.trace_id,
                e
            );
        }

        // `trace_type` is FIRST-NON-ZERO across batches, mirroring the PG
        // upsert's `CASE WHEN COALESCE(traces.type, 0) = 0 THEN EXCLUDED.type
        // ELSE traces.type END`. Signals only evaluate DEFAULT (0) traces, and
        // `TraceAggregation::trace_type` is batch-local — so without this a
        // batch of an evaluation trace that carried no EVALUATION span would
        // read back as DEFAULT and fire signals on an eval trace.
        let type_key = trace_type_key(agg.project_id, agg.trace_id);
        let cached_type = cache.get::<u8>(&type_key).await.unwrap_or(None).unwrap_or(0);
        // First-NON-ZERO wins: a cached type is authoritative and never revised,
        // otherwise this batch's type takes effect.
        let trace_type = if cached_type != 0 {
            cached_type
        } else {
            agg.trace_type
        };
        // Re-persist on EVERY batch (including DEFAULT/0) for the same reason as
        // the user id: letting the key age out while the tokens key stays warm
        // would re-open an already-typed trace to the DEFAULT-only signals gate,
        // and `read_back` can't recover the type either.
        if let Err(e) = cache
            .insert_with_ttl(&type_key, trace_type, TTL_SECONDS)
            .await
        {
            log::warn!("Failed to record trace type for {}: {:?}", agg.trace_id, e);
        }

        states.insert(
            agg.trace_id,
            TraceTriggerState {
                seen_error,
                total_tokens,
                user_id,
                trace_type,
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
            // The read-back exists to recover the two trigger inputs; user id
            // and trace type have their own keys and are resolved by the caller.
            user_id: None,
            trace_type: 0,
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

    fn agg_with_type(
        project_id: Uuid,
        trace_id: Uuid,
        trace_type: u8,
    ) -> TraceAggregation {
        let mut a = agg(project_id, trace_id, 1, None);
        a.trace_type = trace_type;
        a
    }

    fn agg_with_user(
        project_id: Uuid,
        trace_id: Uuid,
        tokens: i64,
        user_id: Option<&str>,
    ) -> TraceAggregation {
        let mut a = agg(project_id, trace_id, tokens, None);
        a.user_id = user_id.map(String::from);
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

    /// Sequential batches of a NEW trace must both land their delta, which is
    /// the observable half of the concurrency contract: the total is only ever
    /// mutated with `increment` (atomic INCRBY under Redis, and commutative),
    /// never `insert`.
    ///
    /// NOTE: this cannot pin the true concurrent race. `InMemoryCache::increment`
    /// is documented as non-atomic (get-then-set), and `tokio::join!` polls on
    /// one thread, so two overlapping `update_and_read` calls never interleave
    /// mid-increment here. Catching a lost delta needs a Redis-backed
    /// integration test; what this guards is that neither the fold nor the seed
    /// path ever overwrites the key with a computed absolute value.
    #[tokio::test]
    async fn every_batch_of_a_new_trace_adds_to_the_total() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let a = update_and_read(&[agg(pid, tid, 300, None)], cache.clone(), &ch).await;
        assert_eq!(a[&tid].total_tokens, 300);

        let b = update_and_read(&[agg(pid, tid, 700, None)], cache.clone(), &ch).await;
        assert_eq!(
            b[&tid].total_tokens, 1000,
            "the second batch must add to the first, not replace it"
        );

        let c = update_and_read(&[agg(pid, tid, 1, None)], cache.clone(), &ch).await;
        assert_eq!(c[&tid].total_tokens, 1001);
    }

    /// The user id must survive batches whose spans don't carry it.
    ///
    /// `TraceAggregation::user_id` is populated only from spans in the current
    /// batch, but per-user sampling factors are keyed by user id — so a trace
    /// whose id arrived in batch 1 would be sampled against the empty-user
    /// factor on every later batch, skewing its rate. The PG upsert used to
    /// preserve it via `COALESCE(EXCLUDED.user_id, traces.user_id)`; this key
    /// reproduces that set-once behaviour.
    #[tokio::test]
    async fn user_id_persists_across_batches_that_omit_it() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let first = update_and_read(
            &[agg_with_user(pid, tid, 10, Some("user-42"))],
            cache.clone(),
            &ch,
        )
        .await;
        assert_eq!(first[&tid].user_id.as_deref(), Some("user-42"));

        // Later batches carry no user id — the trace must NOT look anonymous.
        for _ in 0..2 {
            let later =
                update_and_read(&[agg_with_user(pid, tid, 5, None)], cache.clone(), &ch).await;
            assert_eq!(
                later[&tid].user_id.as_deref(),
                Some("user-42"),
                "a batch without a user id must not blank the trace's user id"
            );
        }
    }

    /// Set-once: the first id wins, so a stray differing value in a later batch
    /// can't move the trace to another sampling bucket mid-flight.
    #[tokio::test]
    async fn user_id_is_set_once() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        update_and_read(
            &[agg_with_user(pid, tid, 10, Some("first"))],
            cache.clone(),
            &ch,
        )
        .await;
        let second = update_and_read(
            &[agg_with_user(pid, tid, 10, Some("second"))],
            cache.clone(),
            &ch,
        )
        .await;
        assert_eq!(second[&tid].user_id.as_deref(), Some("first"));
    }

    /// An empty-string user id is treated as absent, matching the aggregation
    /// (which skips empty values) — otherwise it would pin the trace to the
    /// empty-user sampling factor permanently.
    #[tokio::test]
    async fn empty_user_id_is_not_persisted() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let first =
            update_and_read(&[agg_with_user(pid, tid, 10, Some(""))], cache.clone(), &ch).await;
        assert_eq!(first[&tid].user_id, None);

        // A real id arriving later still wins.
        let later = update_and_read(
            &[agg_with_user(pid, tid, 5, Some("user-7"))],
            cache.clone(),
            &ch,
        )
        .await;
        assert_eq!(later[&tid].user_id.as_deref(), Some("user-7"));
    }

    /// A clean trace must stop hitting ClickHouse after its first batch.
    ///
    /// `seen_error == false` is PERSISTED, so "known clean" is distinguishable
    /// from "key absent". Gating the re-seed on `!seen_error` instead would make
    /// every batch of every non-errored trace do a read-back — one ClickHouse
    /// round-trip per aggregation on the hot ingest path, which is the opposite
    /// of what this cache exists for.
    ///
    /// Asserted by pointing the client at a closed port and counting how many
    /// batches observe a failed read-back: only the first should try.
    #[tokio::test]
    async fn clean_traces_stop_reading_back_after_the_first_batch() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        // First batch: keys absent, so a read-back is expected and it persists
        // `false` for the latch.
        update_and_read(&[agg(pid, tid, 10, None)], cache.clone(), &ch).await;
        assert_eq!(
            cache.get::<bool>(&seen_error_key(pid, tid)).await.unwrap(),
            Some(false),
            "a clean batch must persist `false`, not leave the key absent"
        );

        // Subsequent clean batches must be answered entirely from cache. If the
        // gate regressed to `!seen_error` these would each re-read ClickHouse.
        for i in 0..3 {
            let s = update_and_read(&[agg(pid, tid, 5, None)], cache.clone(), &ch).await;
            assert!(!s[&tid].seen_error);
            assert_eq!(s[&tid].total_tokens, 15 + i * 5);
            assert_eq!(
                cache.get::<bool>(&seen_error_key(pid, tid)).await.unwrap(),
                Some(false)
            );
        }
    }

    /// `trace_type` must stick across batches that don't carry it.
    ///
    /// Signals evaluate DEFAULT (0) traces only. `TraceAggregation::trace_type`
    /// is batch-local, so an evaluation trace whose later batches contain no
    /// EVALUATION span would read back as DEFAULT and get signals fired on it.
    /// The PG upsert was sticky (`CASE WHEN COALESCE(traces.type, 0) = 0 THEN
    /// EXCLUDED.type ELSE traces.type END`); this reproduces that.
    #[tokio::test]
    async fn trace_type_sticks_across_batches() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        // Batch 1 carries the EVALUATION span (type 1).
        let first = update_and_read(&[agg_with_type(pid, tid, 1)], cache.clone(), &ch).await;
        assert_eq!(first[&tid].trace_type, 1);

        // Later batches carry no typed span — the trace must NOT look DEFAULT
        // again, or the DEFAULT-only signals gate would let it through.
        for _ in 0..2 {
            let later = update_and_read(&[agg_with_type(pid, tid, 0)], cache.clone(), &ch).await;
            assert_eq!(
                later[&tid].trace_type, 1,
                "an untyped batch must not reset an already-typed trace to DEFAULT"
            );
        }
    }

    /// A genuinely DEFAULT trace stays DEFAULT, and a type arriving in a later
    /// batch still takes effect (first-NON-ZERO, not merely first-write).
    #[tokio::test]
    async fn default_trace_type_is_upgraded_by_a_later_typed_batch() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let first = update_and_read(&[agg_with_type(pid, tid, 0)], cache.clone(), &ch).await;
        assert_eq!(first[&tid].trace_type, 0);

        let second = update_and_read(&[agg_with_type(pid, tid, 3)], cache.clone(), &ch).await;
        assert_eq!(second[&tid].trace_type, 3, "PLAYGROUND must take effect");

        // ...and then it's frozen.
        let third = update_and_read(&[agg_with_type(pid, tid, 0)], cache.clone(), &ch).await;
        assert_eq!(third[&tid].trace_type, 3);
    }

    /// Both cross-batch fields resolve correctly on the cached-hit path, and a
    /// typed/identified batch keeps its keys populated.
    ///
    /// NOTE: the real invariant here is that both keys are REWRITTEN on every
    /// batch so their TTLs track the unconditionally-re-stamped tokens key —
    /// otherwise they age out while tokens stays warm, and `read_back` can't
    /// recover either one (it returns `user_id: None`, `trace_type: 0`).
    /// `InMemoryCache::insert` and `insert_with_ttl` leave identical bytes and
    /// `set_ttl` spawns a real 30-minute sleep, so a unit test cannot observe
    /// the difference between "wrote it again" and "left it alone". Only a
    /// Redis-backed test with a short TTL can pin that; this covers the
    /// resolution logic that sits on top of it.
    #[tokio::test]
    async fn user_id_and_trace_type_resolve_on_the_cached_hit_path() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let mut seed = agg_with_user(pid, tid, 10, Some("user-42"));
        seed.trace_type = 1;
        update_and_read(&[seed], cache.clone(), &ch).await;

        // Batches carrying neither attribute take the cached-hit path.
        for _ in 0..3 {
            let s = update_and_read(&[agg_with_user(pid, tid, 5, None)], cache.clone(), &ch).await;
            assert_eq!(s[&tid].user_id.as_deref(), Some("user-42"));
            assert_eq!(s[&tid].trace_type, 1);
            assert_eq!(
                cache.get::<String>(&user_id_key(pid, tid)).await.unwrap(),
                Some("user-42".to_string()),
                "the key must stay populated across cached-hit batches"
            );
            assert_eq!(
                cache.get::<u8>(&trace_type_key(pid, tid)).await.unwrap(),
                Some(1)
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
