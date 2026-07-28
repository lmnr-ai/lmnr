//! Thin per-trace state backing the cross-batch signal trigger conditions
//! (LAM-2020).
//!
//! Two conditions can't be answered from a single ingest batch: "status is / is
//! not error" (an error span may have arrived in an earlier batch) and "total
//! tokens <op> N" (a running sum). `user_id` and `trace_type` are here for a
//! related reason — not conditions, but per-user sampling and the DEFAULT-only
//! signals gate read them, and both were set-once/sticky on the Postgres row
//! this replaced while `TraceAggregation` is batch-local for every field.
//!
//! ONE KEY PER FIELD, never a shared JSON object: each write then needs only a
//! primitive that commutes, so two consumers flushing different batches of the
//! same trace can't clobber each other. A shared object would need a
//! read-modify-write and would race.
//!
//! | field         | write            | semantics                     |
//! |---------------|------------------|-------------------------------|
//! | `total_tokens`| `increment`       | pure accumulator, never reconciled |
//! | `seen_error`  | `increment` (0 or 1) | monotone counter, `> 0` = latched |
//! | `user_id`     | `insert` (String) | set-once, first id wins       |
//! | `trace_type`  | `insert` (u8)     | first-NON-ZERO wins           |
//!
//! The token total is deliberately NEVER reconciled against `traces_agg` — see
//! `update_and_read` for why that would double-count under concurrency. Only
//! the monotone error latch reads back, and only when its key is absent.
//!
//! **Every key is REWRITTEN on every batch, never only on the batch that first
//! resolved its value.** The tokens key is re-stamped unconditionally (INCRBY
//! drops its TTL), so a key left to age out on its own expires while tokens
//! stays warm — and `read_back` recovers only the error flag, so an expired
//! `user_id` or `trace_type` is gone for the rest of the trace. A cached-hit
//! branch that returns a value without writing it back is the bug shape here.

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

/// Fold this batch's contribution into the per-trace state and return the
/// resulting cumulative state per trace id.
///
/// Ordering matters: the cache is updated with this batch's contribution BEFORE
/// the returned state is used for evaluation, so a trigger sees totals that
/// include the batch that triggered it.
///
/// Cache errors degrade to this batch's own values rather than failing the
/// flush — a delayed trigger is better than stalled ingestion. Every key's TTL
/// is refreshed on every batch so their windows can't drift apart.
pub async fn update_and_read(
    aggregations: &[TraceAggregation],
    cache: Arc<Cache>,
    clickhouse: &clickhouse::Client,
) -> HashMap<Uuid, TraceTriggerState> {
    let mut states = HashMap::with_capacity(aggregations.len());

    for agg in aggregations {
        let tokens_key = total_tokens_key(agg.project_id, agg.trace_id);
        let error_key = seen_error_key(agg.project_id, agg.trace_id);

        // Read the latch BEFORE anything else. A clean batch PERSISTS its
        // "clean" answer rather than leaving the key absent: the state has to be
        // tri-state (known-errored / known-clean / unknown) or "clean" is
        // indistinguishable from "expired", and since most traces never error
        // that would fire a ClickHouse read-back on every batch of every trace
        // — one round-trip per aggregation on the hot ingest path.
        //
        // Stored as a COUNTER, not a bool, so the write commutes: `increment(0)`
        // for a clean batch and `increment(1)` for an errored one, with
        // `> 0` meaning latched. A `SET false` would be a read-modify-write
        // spanning this whole loop body — a clean batch that read the key before
        // a concurrent errored batch wrote it would clobber the latch on the way
        // out, and nothing recovers it because the read-back only fires when the
        // key is ABSENT. A counter can only ever grow, so no interleaving of
        // clean and errored batches can unset it.
        //
        // Still tri-state: `None` (absent) vs `Some(0)` (known clean) vs
        // `Some(n > 0)` (latched). The absent case is what gates the read-back.
        let cached_error = cache.get::<i64>(&error_key).await.unwrap_or(None);
        let mut seen_error = cached_error.is_some_and(|count| count > 0);

        // The token total is a PURE ACCUMULATOR: every batch adds its own delta
        // with an atomic INCRBY and nothing ever reconciles the key against
        // `traces_agg`. Reconciling is unsound here — the `traces_agg` partial
        // is inserted earlier in the same flush, BEFORE this increment, so a
        // concurrent worker reading the aggregate sees deltas whose owners have
        // not incremented Redis yet. Topping the key up to that aggregate would
        // count those deltas twice (permanently, until the key expires), and
        // firing a `total_token_count > N` trigger EARLY is worse than firing it
        // late: early means a signal run the user didn't ask for. There is no
        // primitive that fixes this short of holding a lock across both the CH
        // insert and the Redis update, which the ingest path can't afford.
        //
        // The accepted trade-off is a bounded UNDER-count in one case: a key
        // that expires mid-trace restarts from the next batch, so a threshold
        // trigger fires later than it could. The TTL is refreshed on every batch
        // (below), so expiry needs 30 minutes of silence on a trace that then
        // resumes — and a late fire is still a fire, since the trigger lock caps
        // it at once per trace either way.
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

        // The error latch DOES read back, and unlike the token total it's sound
        // to: `seen_error` is monotone, so OR-ing in a possibly-stale aggregate
        // is idempotent — a concurrent worker can only ever confirm the same
        // `true`. Gated on the key being genuinely ABSENT (`is_none()`, not
        // `!seen_error`): a persisted `false` is a known-clean answer, and since
        // most traces never error, gating on the value would put a ClickHouse
        // round-trip on every batch of nearly every trace.
        if cached_error.is_none()
            && let Some(errored) = read_back(clickhouse, agg.project_id, agg.trace_id).await
        {
            seen_error |= errored;
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
        // Written on EVERY batch that has a value, not just the one that first
        // resolved it: that write is the TTL refresh. The tokens key is
        // re-stamped unconditionally below, so a key left to age out on its own
        // expires while tokens stays warm — and `read_back` returns only the
        // error flag, so an expired user id is gone for the rest of the trace
        // and sampling silently reverts to the empty-user factor.
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
        // INCRBY creates a key without a TTL, so both need an explicit refresh.
        //
        // The latch is bumped by 1 when THIS batch resolved an error and by 0
        // otherwise — the zero-bump still creates the key (so "known clean"
        // stays distinguishable from "absent" and keeps clean traces off the
        // read-back path) without ever being able to lower it. Deliberately
        // driven by `seen_error` rather than only this batch's own status, so a
        // latch recovered from the read-back is re-persisted too.
        if let Err(e) = cache.set_ttl(&tokens_key, TTL_SECONDS).await {
            log::warn!("Failed to set TTL on {}: {:?}", tokens_key, e);
        }
        match cache.increment(&error_key, i64::from(seen_error)).await {
            Ok(_) => {
                if let Err(e) = cache.set_ttl(&error_key, TTL_SECONDS).await {
                    log::warn!("Failed to set TTL on {}: {:?}", error_key, e);
                }
            }
            Err(e) => log::warn!(
                "Failed to record trace error state for {}: {:?}",
                agg.trace_id,
                e
            ),
        }

        // `trace_type` is FIRST-NON-ZERO across batches, mirroring the PG
        // upsert's `CASE WHEN COALESCE(traces.type, 0) = 0 THEN EXCLUDED.type
        // ELSE traces.type END`. Signals only evaluate DEFAULT (0) traces, and
        // `TraceAggregation::trace_type` is batch-local — so without this a
        // batch of an evaluation trace that carried no EVALUATION span would
        // read back as DEFAULT and fire signals on an eval trace.
        let type_key = trace_type_key(agg.project_id, agg.trace_id);
        let cached_type = cache.get::<u8>(&type_key).await.unwrap_or(None).unwrap_or(0);
        // A non-zero cached type is authoritative and never revised; otherwise
        // this batch's type takes effect.
        let trace_type = if cached_type != 0 {
            cached_type
        } else {
            agg.trace_type
        };
        // NEVER write a zero. An absent key already means DEFAULT, so a
        // DEFAULT trace needs no key at all — whereas writing `0` is a `SET` of
        // a locally-computed value and can clobber a non-zero type a concurrent
        // worker just wrote (A reads absent → resolves 0; B writes 1; A writes 0
        // → the eval trace is DEFAULT again for the rest of its life, and
        // `read_back` recovers only the error flag, never the type).
        //
        // Writing only non-zero values keeps this monotone: a typed trace's key
        // is (re)written on every batch that resolves a type — including one
        // that inherited it from the cache, which is what refreshes the TTL so
        // the key can't age out while the tokens key stays warm. Two concurrent
        // batches carrying DIFFERENT non-zero types can still race, but both
        // outcomes are non-DEFAULT so the signals gate behaves identically, and
        // "first non-zero wins" was already arbitrary between them.
        if trace_type != 0
            && let Err(e) = cache
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

/// Whether ANY span of the trace has reported an error, straight from
/// `traces_agg`. `None` on error, or when the trace has no rows yet.
///
/// Only the error flag is recovered: the token total is a pure accumulator that
/// must never be reconciled against the aggregate (see `update_and_read`), and
/// user id / trace type have their own keys.
async fn read_back(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Option<bool> {
    match traces_agg::fetch_trace_states(clickhouse, project_id, &[trace_id]).await {
        Ok(states) => states.first().map(|state| state.status == "error"),
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

        for expected in 2..=4 {
            let s = update_and_read(&[agg(pid, tid, 5, Some("error"))], cache.clone(), &ch).await;
            assert!(s[&tid].seen_error);
            assert_eq!(
                cache.get::<i64>(&seen_error_key(pid, tid)).await.unwrap(),
                Some(expected),
                "every errored batch must bump the latch counter, so its TTL \
                 tracks the tokens key"
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
        // a zero counter for the latch.
        update_and_read(&[agg(pid, tid, 10, None)], cache.clone(), &ch).await;
        assert_eq!(
            cache.get::<i64>(&seen_error_key(pid, tid)).await.unwrap(),
            Some(0),
            "a clean batch must persist 0, not leave the key absent"
        );

        // Subsequent clean batches must be answered entirely from cache. If the
        // gate regressed to `!seen_error` these would each re-read ClickHouse.
        for i in 0..3 {
            let s = update_and_read(&[agg(pid, tid, 5, None)], cache.clone(), &ch).await;
            assert!(!s[&tid].seen_error);
            assert_eq!(s[&tid].total_tokens, 15 + i * 5);
            assert_eq!(
                cache.get::<i64>(&seen_error_key(pid, tid)).await.unwrap(),
                Some(0),
                "clean batches must keep the latch counter at 0"
            );
        }
    }

    /// A clean batch must not be able to unset a latch a concurrent errored
    /// batch has already written.
    ///
    /// Reproduces the interleaving deterministically (the in-memory cache is
    /// single-threaded, so real concurrency can't be staged): the clean worker
    /// reads the latch as absent, an errored worker then latches it, and the
    /// clean worker finally writes its own resolved state. With a `SET false`
    /// that last write clobbers the latch and nothing recovers it — the
    /// read-back only fires when the key is ABSENT, and it is now present-and-
    /// false. `increment(0)` can't lower a counter, so the latch survives.
    #[tokio::test]
    async fn a_clean_batch_cannot_unset_a_concurrent_latch() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let key = seen_error_key(pid, tid);

        // Clean worker A has read the latch as absent (nothing cached yet).
        assert_eq!(cache.get::<i64>(&key).await.unwrap(), None);

        // Errored worker B completes its whole pass and latches the trace.
        let b = update_and_read(&[agg(pid, tid, 5, Some("error"))], cache.clone(), &ch).await;
        assert!(b[&tid].seen_error);

        // A now finishes and writes the state it resolved BEFORE B's error.
        let a = update_and_read(&[agg(pid, tid, 5, None)], cache.clone(), &ch).await;

        // A's own return value may miss B's error (it read first) — but the
        // PERSISTED latch must not regress, so every later batch still sees it.
        let next = update_and_read(&[agg(pid, tid, 5, None)], cache.clone(), &ch).await;
        assert!(
            next[&tid].seen_error,
            "a clean batch must not clobber a latch set by a concurrent errored \
             batch (A saw {}, follow-up saw {})",
            a[&tid].seen_error,
            next[&tid].seen_error
        );
        assert!(cache.get::<i64>(&key).await.unwrap().unwrap() > 0);
    }

    /// A DEFAULT resolution must write NOTHING for the trace type.
    ///
    /// This is the invariant that makes the type safe under concurrency: absence
    /// already means DEFAULT, so a DEFAULT batch has nothing to persist. Writing
    /// `0` would be a `SET` of a locally-computed value and could reset a typed
    /// trace — A reads the key as absent and resolves 0, B writes 1, A writes 0,
    /// and the evaluation trace then passes the DEFAULT-only signals gate for
    /// the rest of its life (`read_back` recovers only the error flag, never the
    /// type). The write-skip is what removes that interleaving entirely; the
    /// interleaving itself isn't stageable here (the in-memory cache is
    /// single-threaded, and sequential calls read each other's cached type).
    #[tokio::test]
    async fn a_typed_trace_survives_later_untyped_batches() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        let key = trace_type_key(pid, tid);

        let b = update_and_read(&[agg_with_type(pid, tid, 1)], cache.clone(), &ch).await;
        assert_eq!(b[&tid].trace_type, 1);

        for _ in 0..3 {
            let next = update_and_read(&[agg_with_type(pid, tid, 0)], cache.clone(), &ch).await;
            assert_eq!(
                next[&tid].trace_type, 1,
                "an untyped batch must not reset a typed trace"
            );
            assert_eq!(cache.get::<u8>(&key).await.unwrap(), Some(1));
        }
    }

    /// A genuinely DEFAULT trace writes no type key at all — absence IS DEFAULT,
    /// so there is nothing to keep warm and one less write per batch.
    #[tokio::test]
    async fn default_traces_do_not_write_a_type_key() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        let s = update_and_read(&[agg_with_type(pid, tid, 0)], cache.clone(), &ch).await;
        assert_eq!(s[&tid].trace_type, 0);
        assert_eq!(cache.get::<u8>(&trace_type_key(pid, tid)).await.unwrap(), None);
    }

    /// The token total must NEVER be reconciled against `traces_agg`.
    ///
    /// The aggregate partial is inserted earlier in the same flush, before this
    /// increment, so a concurrent worker reading it sees deltas whose owners
    /// haven't incremented Redis yet. Topping the key up to the aggregate would
    /// count those twice and fire a `total_token_count > N` trigger EARLY — a
    /// signal run the user never asked for.
    ///
    /// Asserted structurally: seed the key to a value far BELOW what a live
    /// `traces_agg` would report for the same trace, then confirm the batch adds
    /// exactly its own delta and never jumps to some aggregate-derived number.
    #[tokio::test]
    async fn token_total_is_never_reconciled_against_the_aggregate() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let ch = clickhouse::Client::default().with_url("http://127.0.0.1:1");
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();

        // Pretend a peer already accumulated 40 for this trace.
        cache
            .insert_with_ttl(&total_tokens_key(pid, tid), 40i64, TTL_SECONDS)
            .await
            .unwrap();

        let s = update_and_read(&[agg(pid, tid, 60, None)], cache.clone(), &ch).await;
        assert_eq!(
            s[&tid].total_tokens, 100,
            "must be peer's 40 + this batch's 60, with no aggregate top-up"
        );

        // Every later batch keeps adding exactly its delta.
        let s2 = update_and_read(&[agg(pid, tid, 5, None)], cache.clone(), &ch).await;
        assert_eq!(s2[&tid].total_tokens, 105);
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
