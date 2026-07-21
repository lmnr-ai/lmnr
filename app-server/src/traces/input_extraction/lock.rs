//! Winner arbitration state: the per-trace record that arbitrates which
//! LLM span's input owns the trace's user task, and which span's output
//! owns the trace output.
//!
//! Input arbitration is roster-based: the winner must be among the first
//! [`ROSTER_CAP`] spans (by start time) at the shallowest observed depth,
//! and among those the one with the most non-cached input tokens wins.
//! The first few shallow spans of a trace are often secondary helpers
//! (title generation, routing) — token mass is what singles out the real
//! main-agent call, while the roster cap stops later main-loop turns
//! (which grow monotonically in tokens) from overriding forever.

use std::sync::Arc;
use std::time::Duration;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::{TRACE_OUTPUT_LOCK_CACHE_KEY, USER_TASK_LOCK_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;

/// How many earliest-starting spans at the shallowest depth stay eligible
/// to own the user task.
pub const ROSTER_CAP: usize = 5;

pub fn lock_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{USER_TASK_LOCK_CACHE_KEY}:{project_id}:{trace_id}")
}

pub fn trace_output_lock_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{TRACE_OUTPUT_LOCK_CACHE_KEY}:{project_id}:{trace_id}")
}

/// Stats of a candidate span competing for the trace's user task. Doubles
/// as the published-winner record inside [`UserTaskLockState`] and as the
/// snapshot a queued extraction carries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WinnerState {
    /// Span path depth.
    #[serde(rename = "d")]
    pub depth: usize,
    /// Non-cached input tokens (`input_tokens.total() - cache_read`).
    /// Cache-read-heavy turns are later same-conversation turns; a fresh
    /// first call reads no cache, so this discriminates "big new context"
    /// from "big replayed context". Tokens (not cost) on purpose: cost is
    /// only derivable when the model resolves in the pricing tables.
    #[serde(rename = "k", default)]
    pub input_tokens: i64,
    /// Start time (ns since epoch); `i64::MAX` = unknown ("never wins on
    /// the time axis"). Also the default for legacy lock JSON without `t`.
    #[serde(rename = "t", default = "unknown_time_ns")]
    pub start_time_ns: i64,
    /// Simple-form span id — dedups roster re-registration on redelivery
    /// and breaks full ties deterministically.
    #[serde(rename = "id", default)]
    pub span_id: String,
}

fn unknown_time_ns() -> i64 {
    i64::MAX
}

impl WinnerState {
    /// Partial order over the EXACT axes [`agent_io_ver`] encodes:
    /// shallower depth, then more non-cached input tokens. Deliberately
    /// NO further tie-break (earlier start / span id were tried and
    /// removed): an axis the CH version can't encode would let the lock
    /// admit an override whose `trace_agent_input` row only TIES the
    /// value it replaced — an MQ redelivery of the older row could then
    /// win by arrival order. With the orders aligned, a lock-admitted
    /// override always carries a strictly greater ver; equal-strength
    /// candidates don't override, so the first published one stays.
    pub fn beats(&self, other: &Self) -> bool {
        if self.depth != other.depth {
            return self.depth < other.depth;
        }
        // Compare AS ENCODED: a negative count (garbage usage attrs)
        // clamps to 0 in the ver, so -5 vs -10 tokens must be a tie
        // here too, or the "beats ⇒ strictly greater ver" invariant
        // breaks at the clamp boundary.
        ver_minor(self.input_tokens) > ver_minor(other.input_tokens)
    }
}

/// One roster slot: a span registered at the lock's depth.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RosterEntry {
    #[serde(rename = "t", default = "unknown_time_ns")]
    pub start_time_ns: i64,
    #[serde(rename = "id", default)]
    pub span_id: String,
}

/// Per-trace arbitration state stored under `lock_cache_key`. Legacy
/// pre-roster lock JSON (`{c,d,s,t}`) decodes to `{depth, roster: [],
/// winner: None}` — the next candidate at that depth rebuilds the roster
/// and publishes, a graceful reset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserTaskLockState {
    /// Shallowest span-path depth seen for this trace.
    #[serde(rename = "d")]
    pub depth: usize,
    /// Up to [`ROSTER_CAP`] earliest-starting spans at `depth`. Closes
    /// the arbitration window: once full AND a winner is published,
    /// later-starting spans can't compete regardless of token count.
    /// While `winner` is `None` the window doesn't gate — registrations
    /// persist even when the effect fails, and a sealed-but-empty lock
    /// would otherwise block every later span for the whole TTL.
    #[serde(rename = "r", default)]
    pub roster: Vec<RosterEntry>,
    /// The candidate whose extraction effect last landed (metadata
    /// publish or queue enqueue). `None` until the first effect.
    #[serde(rename = "w", default)]
    pub winner: Option<WinnerState>,
}

impl UserTaskLockState {
    pub fn new(depth: usize) -> Self {
        UserTaskLockState {
            depth,
            roster: Vec::new(),
            winner: None,
        }
    }

    /// Upsert a span into the roster (dedup by span id), keep the
    /// [`ROSTER_CAP`] earliest by start time. Returns whether the span is
    /// in the window after THIS upsert — a point-in-time verdict only: a
    /// later registration can still evict it (equal-start ties break on
    /// span id), so callers registering several spans must re-check
    /// membership against the final roster, not collect return values.
    pub fn register(&mut self, entry: RosterEntry) -> bool {
        let span_id = entry.span_id.clone();
        self.roster.retain(|e| e.span_id != entry.span_id);
        self.roster.push(entry);
        self.roster
            .sort_by(|a, b| (a.start_time_ns, &a.span_id).cmp(&(b.start_time_ns, &b.span_id)));
        self.roster.truncate(ROSTER_CAP);
        self.roster.iter().any(|e| e.span_id == span_id)
    }

    /// CRDT-ish merge with a concurrently-written lock: shallower depth
    /// wins wholesale; at equal depth rosters union (earliest-N) and the
    /// stronger winner survives. Used by the guarded write-back so a
    /// get-then-set race degrades to a slightly stale roster, never to a
    /// rolled-back winner.
    pub fn merge_from(&mut self, other: &Self) {
        if other.depth > self.depth {
            return;
        }
        if other.depth < self.depth {
            *self = other.clone();
            return;
        }
        for entry in &other.roster {
            self.register(entry.clone());
        }
        match (&self.winner, &other.winner) {
            (Some(w), Some(ow)) if ow.beats(w) => self.winner = other.winner.clone(),
            (None, Some(_)) => self.winner = other.winner.clone(),
            _ => {}
        }
    }

    /// Does the current lock supersede a queued candidate's snapshot —
    /// i.e. should the queued extraction drop instead of publishing?
    /// Only a strictly stronger PUBLISHED winner supersedes — NEVER
    /// depth alone: a shallower batch resets the lock to `winner: None`
    /// and that reset persists even when its own publish/enqueue FAILED,
    /// so dropping the queued deeper extraction on depth would leave
    /// `lmnr_user_task` unset for the whole lock TTL. Publishing the
    /// deeper value is strictly better — a later shallow success
    /// overwrites it (same key, `no_winner_yet` keeps shallow candidates
    /// eligible). An equal winner is this candidate's own producer
    /// write; a weaker same-depth one is stale state the snapshot
    /// already overrode.
    pub fn supersedes(&self, snapshot: &WinnerState) -> bool {
        let Some(winner) = &self.winner else {
            return false;
        };
        if self.depth < snapshot.depth {
            return true;
        }
        if self.depth > snapshot.depth {
            return false;
        }
        winner != snapshot && winner.beats(snapshot)
    }
}

/// TTL of the short mutex serializing lock write-backs. Generous versus
/// the guarded section (one cache round-trip); only a crashed worker
/// ever runs it out.
const LOCK_WRITE_MUTEX_TTL_SECONDS: u64 = 5;
/// First retry delay for mutex acquisition (grows exponentially).
const LOCK_WRITE_MUTEX_INITIAL_BACKOFF_MS: u64 = 5;
/// Total time budget for mutex acquisition before failing open.
const LOCK_WRITE_MUTEX_MAX_ELAPSED_MS: u64 = 200;

/// Merge-guarded lock write-back, serialized under a short cache mutex:
/// re-read the lock and [`UserTaskLockState::merge_from`] the local state
/// into it (shallower depth wins wholesale; equal depth unions rosters
/// and keeps the stronger winner). The mutex closes the read-merge-write
/// TOCTOU — without it two concurrent writers can both read the same
/// stale snapshot and the weaker last write would drop the stronger
/// winner, letting a medium-strength candidate republish over the true
/// `lmnr_user_task` later. Acquisition retries with the conventional
/// `backoff` crate (like `generate.rs::call_llm`) under a short elapsed
/// budget, then FAILS OPEN (an unserialized merge beats losing the write
/// entirely — every field still folds monotonically); best-effort like
/// every lock write.
pub async fn write_lock_merged(
    cache: &Arc<Cache>,
    lock_key: &str,
    local: &UserTaskLockState,
    trace_id: Uuid,
) {
    let mutex_key = format!("{lock_key}:mx");
    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(LOCK_WRITE_MUTEX_INITIAL_BACKOFF_MS))
        .with_max_elapsed_time(Some(Duration::from_millis(LOCK_WRITE_MUTEX_MAX_ELAPSED_MS)))
        .build();
    let mutex_held = backoff::future::retry(backoff, || async {
        match cache
            .try_acquire_lock(&mutex_key, LOCK_WRITE_MUTEX_TTL_SECONDS)
            .await
        {
            Ok(true) => Ok(()),
            // Held by a concurrent writer: retry within the budget.
            Ok(false) => Err(backoff::Error::transient(anyhow::anyhow!(
                "lock write mutex held"
            ))),
            // Cache errors: don't spin, fall through to the open write.
            Err(e) => Err(backoff::Error::permanent(anyhow::anyhow!("{e:?}"))),
        }
    })
    .await
    .is_ok();

    let mut merged: UserTaskLockState = cache
        .get(lock_key)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| UserTaskLockState::new(local.depth));
    merged.merge_from(local);
    if let Err(e) = cache
        .insert_with_ttl(lock_key, &merged, USER_TASK_LOCK_TTL_SECONDS.get())
        .await
    {
        log::error!("user-task: lock state write failed for trace [{trace_id}]: {e:?}");
    }

    if mutex_held && let Err(e) = cache.release_lock(&mutex_key).await {
        log::error!("user-task: lock write mutex release failed for trace [{trace_id}]: {e:?}");
    }
}

/// Winning-output state for the trace-output lock: the agent's final
/// answer sits on the shallowest spine and is the LAST such message, so
/// strictly shallower wins; at equal depth, strictly later end wins —
/// at MILLISECOND granularity, matching what [`agent_io_ver`] encodes
/// (same aligned-orders rule as [`WinnerState::beats`]; sub-ms-apart
/// answers are equal strength and never override each other).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutputLockState {
    /// Span path depth of the winning span.
    #[serde(rename = "d")]
    pub depth: usize,
    /// End time (ns since epoch) of the winning span. Stored at full
    /// precision; compared at ver granularity.
    #[serde(rename = "t")]
    pub end_time_ns: i64,
}

impl OutputLockState {
    pub fn should_override(&self, candidate: &Self) -> bool {
        if candidate.depth < self.depth {
            return true;
        }
        // Compare AS ENCODED (millis, clamped): pre-epoch end times all
        // clamp to minor 0 in the ver, so -2ms vs -1ms must be a tie
        // here too — admitting it as an override would produce equal CH
        // vers and let a redelivered older row win by arrival order.
        candidate.depth == self.depth
            && ver_minor(candidate.end_time_ns / 1_000_000)
                > ver_minor(self.end_time_ns / 1_000_000)
    }
}

/// The ver's 56-bit minor: clamped to `[0, 2^56)`. Lock comparisons MUST
/// compare through this same clamp (see the aligned-orders rule on
/// [`agent_io_ver`]) — values that collapse to the same encoded minor
/// (negatives, the saturation ceiling) are ties everywhere, not just in
/// ClickHouse.
fn ver_minor(minor: i64) -> u64 {
    const MINOR_MASK: u64 = (1 << 56) - 1;
    (minor.max(0) as u64).min(MINOR_MASK)
}

/// Depth-major RMT version for the `trace_agent_input` /
/// `trace_agent_output` ClickHouse rows: inverted depth in the top byte
/// (shallower ⇒ larger ver), winner-strength minor in the low 56 bits —
/// non-cached input tokens for inputs, end-time millis for outputs
/// (millis fit 56 bits until year ~4254; pre-epoch times clamp to 0).
/// The lock orders ([`WinnerState::beats`],
/// [`OutputLockState::should_override`]) compare EXACTLY these axes
/// through the same [`ver_minor`] clamp, so a lock-admitted override
/// always carries a strictly greater ver and ReplacingMergeTree(ver)
/// converges to the lock's winner regardless of arrival order — blind
/// re-inserts of stale rows are harmless. Never add a lock tie-break (or
/// widen a lock comparison beyond) what this encoding expresses: the
/// lock would admit overrides whose CH rows only TIE, and a redelivered
/// older row could win by arrival order.
pub fn agent_io_ver(depth: usize, minor: i64) -> u64 {
    let inverted_depth = 255 - depth.min(255) as u64;
    (inverted_depth << 56) | ver_minor(minor)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(depth: usize, tokens: i64, t: i64, id: &str) -> WinnerState {
        WinnerState {
            depth,
            input_tokens: tokens,
            start_time_ns: t,
            span_id: id.to_string(),
        }
    }

    fn entry(t: i64, id: &str) -> RosterEntry {
        RosterEntry {
            start_time_ns: t,
            span_id: id.to_string(),
        }
    }

    #[test]
    fn lock_keys_scope_by_project_and_trace() {
        let p = Uuid::new_v4();
        let t = Uuid::new_v4();
        assert_eq!(lock_cache_key(p, t), format!("user_task_lock:{p}:{t}"));
        assert_eq!(
            trace_output_lock_cache_key(p, t),
            format!("trace_output_lock:{p}:{t}")
        );
    }

    #[test]
    fn beats_orders_by_depth_then_tokens_only() {
        // Shallower always beats, regardless of tokens.
        assert!(w(1, 10, 100, "a").beats(&w(2, 9000, 50, "b")));
        // Equal depth: more tokens beats.
        assert!(w(2, 500, 100, "a").beats(&w(2, 100, 50, "b")));
        // Equal depth+tokens: NEITHER beats — start/id are deliberately
        // not tie-breaks because `agent_io_ver` can't encode them; an
        // equal-strength pair must not override so the CH ver of a
        // lock-admitted override is always strictly greater.
        assert!(!w(2, 100, 50, "b").beats(&w(2, 100, 100, "a")));
        assert!(!w(2, 100, 100, "a").beats(&w(2, 100, 50, "b")));
        assert!(!w(2, 100, 50, "a").beats(&w(2, 100, 50, "a")));
        // The aligned-orders invariant itself: beats ⇒ strictly greater ver.
        let stronger = w(2, 500, 100, "a");
        let weaker = w(2, 100, 50, "b");
        assert!(stronger.beats(&weaker));
        assert!(
            agent_io_ver(stronger.depth, stronger.input_tokens)
                > agent_io_ver(weaker.depth, weaker.input_tokens)
        );
    }

    #[test]
    fn roster_keeps_earliest_n_and_dedups_by_span_id() {
        let mut lock = UserTaskLockState::new(2);
        for i in 0..ROSTER_CAP as i64 {
            assert!(lock.register(entry(i * 10, &format!("s{i}"))));
        }
        // A later-starting span no longer fits the window.
        assert!(!lock.register(entry(1000, "late")));
        assert_eq!(lock.roster.len(), ROSTER_CAP);
        // An earlier-starting span evicts the latest.
        assert!(lock.register(entry(5, "early")));
        assert!(lock.roster.iter().any(|e| e.span_id == "early"));
        assert!(!lock.roster.iter().any(|e| e.span_id == "s4"));
        // Re-registering an existing span (redelivery) is idempotent.
        assert!(lock.register(entry(5, "early")));
        assert_eq!(lock.roster.len(), ROSTER_CAP);
    }

    #[test]
    fn register_verdict_is_point_in_time_only() {
        // Fill the roster with equal-start spans; a later registration
        // with the same start but smaller span id evicts the largest-id
        // earlier acceptee — its earlier `true` verdict is stale, which
        // is why the producer derives eligibility from the FINAL roster.
        let mut lock = UserTaskLockState::new(2);
        for id in ["b", "c", "d", "e", "f"] {
            assert!(lock.register(entry(100, id)));
        }
        assert!(lock.register(entry(100, "a")));
        assert!(!lock.roster.iter().any(|e| e.span_id == "f"));
        assert_eq!(lock.roster.len(), ROSTER_CAP);
    }

    #[test]
    fn merge_prefers_shallower_then_unions_rosters_and_stronger_winner() {
        let mut a = UserTaskLockState::new(3);
        a.register(entry(10, "deep"));
        a.winner = Some(w(3, 100, 10, "deep"));
        // Shallower other replaces wholesale.
        let mut b = UserTaskLockState::new(2);
        b.register(entry(20, "shallow"));
        a.merge_from(&b);
        assert_eq!(a.depth, 2);
        assert!(a.winner.is_none());
        // Deeper other is ignored.
        let mut c = UserTaskLockState::new(5);
        c.winner = Some(w(5, 9000, 1, "x"));
        a.merge_from(&c);
        assert_eq!(a.depth, 2);
        assert!(a.winner.is_none());
        // Equal depth: rosters union, stronger winner survives.
        let mut d = UserTaskLockState::new(2);
        d.register(entry(5, "other"));
        d.winner = Some(w(2, 50, 5, "other"));
        a.merge_from(&d);
        assert_eq!(a.roster.len(), 2);
        assert_eq!(a.winner, Some(w(2, 50, 5, "other")));
        let mut e = UserTaskLockState::new(2);
        e.winner = Some(w(2, 500, 20, "shallow"));
        a.merge_from(&e);
        assert_eq!(a.winner, Some(w(2, 500, 20, "shallow")));
    }

    #[test]
    fn supersedes_requires_strictly_stronger_published_winner() {
        let snapshot = w(2, 100, 50, "self");
        // Shallower lock with a PUBLISHED winner supersedes.
        let mut shallow_published = UserTaskLockState::new(1);
        shallow_published.winner = Some(w(1, 10, 60, "main"));
        assert!(shallow_published.supersedes(&snapshot));
        // Shallower lock with NO published winner must NOT drop the
        // queued deeper extraction: a shallow batch resets the lock even
        // when its own effect FAILED, and depth-alone supersession would
        // leave lmnr_user_task unset for the whole TTL. The deeper value
        // publishes; a later shallow success overwrites it.
        assert!(!UserTaskLockState::new(1).supersedes(&snapshot));
        // Deeper lock never supersedes.
        let mut deep = UserTaskLockState::new(3);
        deep.winner = Some(w(3, 9000, 1, "x"));
        assert!(!deep.supersedes(&snapshot));
        // Equal depth, no published winner: publish.
        assert!(!UserTaskLockState::new(2).supersedes(&snapshot));
        // Own producer write (winner == snapshot): publish.
        let mut own = UserTaskLockState::new(2);
        own.winner = Some(snapshot.clone());
        assert!(!own.supersedes(&snapshot));
        // Stronger winner: drop.
        let mut stronger = UserTaskLockState::new(2);
        stronger.winner = Some(w(2, 500, 40, "big"));
        assert!(stronger.supersedes(&snapshot));
        // Weaker (stale) winner the snapshot overrode: publish.
        let mut weaker = UserTaskLockState::new(2);
        weaker.winner = Some(w(2, 10, 60, "small"));
        assert!(!weaker.supersedes(&snapshot));
    }

    #[test]
    fn legacy_lock_json_decodes_to_empty_roster() {
        // Pre-roster locks carry {c,d,s,t}; unknown keys are ignored and
        // the missing roster/winner default — the depth gate survives,
        // arbitration restarts cleanly.
        let back: UserTaskLockState =
            serde_json::from_str(r#"{"c":1.5,"d":3,"s":"plain","t":42}"#).unwrap();
        assert_eq!(back.depth, 3);
        assert!(back.roster.is_empty());
        assert!(back.winner.is_none());
    }

    #[test]
    fn lock_state_serializes_with_short_keys() {
        let mut lock = UserTaskLockState::new(2);
        lock.register(entry(10, "abc"));
        lock.winner = Some(w(2, 100, 10, "abc"));
        let json = serde_json::to_string(&lock).unwrap();
        assert_eq!(
            json,
            r#"{"d":2,"r":[{"t":10,"id":"abc"}],"w":{"d":2,"k":100,"t":10,"id":"abc"}}"#
        );
        let back: UserTaskLockState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, lock);
    }

    #[tokio::test]
    async fn write_lock_merged_serializes_and_keeps_stronger_winner() {
        use crate::cache::in_memory::InMemoryCache;
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let trace_id = Uuid::new_v4();
        let lock_key = format!("test_lock:{trace_id}");

        // Two writers race: strong lands first, weak second. The weak
        // write-back must fold INTO the stored state, not clobber it.
        let mut strong = UserTaskLockState::new(2);
        strong.register(entry(10, "strong"));
        strong.winner = Some(w(2, 500, 10, "strong"));
        write_lock_merged(&cache, &lock_key, &strong, trace_id).await;

        let mut weak = UserTaskLockState::new(2);
        weak.register(entry(20, "weak"));
        weak.winner = Some(w(2, 100, 20, "weak"));
        write_lock_merged(&cache, &lock_key, &weak, trace_id).await;

        let stored: UserTaskLockState = cache.get(&lock_key).await.unwrap().unwrap();
        assert_eq!(stored.winner, Some(w(2, 500, 10, "strong")));
        assert_eq!(stored.roster.len(), 2);

        // The write-back mutex is released on the happy path — the key
        // is immediately re-acquirable.
        let mutex_key = format!("{lock_key}:mx");
        assert!(cache.try_acquire_lock(&mutex_key, 5).await.unwrap());
    }

    #[test]
    fn legacy_winner_snapshot_decodes_with_defaults() {
        // A queued pre-roster message's winner_state ({c,d,s,t}) decodes:
        // d/t map, tokens default 0, span id default empty.
        let back: WinnerState =
            serde_json::from_str(r#"{"c":1.5,"d":3,"s":"plain","t":42}"#).unwrap();
        assert_eq!(back.depth, 3);
        assert_eq!(back.start_time_ns, 42);
        assert_eq!(back.input_tokens, 0);
        assert_eq!(back.span_id, "");
    }

    #[test]
    fn agent_io_ver_is_depth_major() {
        // Shallower depth always outranks, regardless of minor.
        assert!(agent_io_ver(1, 0) > agent_io_ver(2, i64::MAX));
        // Same depth: larger minor wins.
        assert!(agent_io_ver(2, 100) > agent_io_ver(2, 50));
        // Negative / oversized minors clamp instead of corrupting depth.
        assert_eq!(agent_io_ver(2, -5), agent_io_ver(2, 0));
        assert!(agent_io_ver(1, i64::MAX) < agent_io_ver(0, 0));
    }

    #[test]
    fn lock_comparisons_tie_where_the_ver_clamps() {
        // Negative token counts (garbage usage attrs) clamp to minor 0
        // in the ver — the lock must treat them as ties too, or an
        // admitted override would produce an equal CH ver.
        assert!(!w(2, -5, 0, "a").beats(&w(2, -10, 0, "b")));
        assert!(!w(2, -10, 0, "b").beats(&w(2, -5, 0, "a")));
        // But a positive count still beats a clamped negative one.
        assert!(w(2, 1, 0, "a").beats(&w(2, -10, 0, "b")));
        // Pre-epoch end times: -2ms vs -1ms both clamp to 0 — tie.
        let older = OutputLockState {
            depth: 3,
            end_time_ns: -2_000_000,
        };
        assert!(!older.should_override(&OutputLockState {
            depth: 3,
            end_time_ns: -1_000_000,
        }));
        // A post-epoch candidate still overrides a pre-epoch winner.
        assert!(older.should_override(&OutputLockState {
            depth: 3,
            end_time_ns: 1_000_000,
        }));
    }

    #[test]
    fn output_lock_shallower_wins_then_later_end_at_ms_granularity() {
        const MS: i64 = 1_000_000;
        let prev = OutputLockState {
            depth: 3,
            end_time_ns: 100 * MS,
        };
        // Strictly shallower always overrides.
        assert!(prev.should_override(&OutputLockState {
            depth: 2,
            end_time_ns: 50 * MS
        }));
        // Equal depth: only a strictly LATER end overrides.
        assert!(prev.should_override(&OutputLockState {
            depth: 3,
            end_time_ns: 200 * MS
        }));
        assert!(!prev.should_override(&OutputLockState {
            depth: 3,
            end_time_ns: 100 * MS
        }));
        // Sub-millisecond-later end: equal at ver granularity, no
        // override — `agent_io_ver` encodes millis, so a ns-level win
        // would produce a CH row that only ties the one it replaced.
        assert!(!prev.should_override(&OutputLockState {
            depth: 3,
            end_time_ns: 100 * MS + 999_999
        }));
        // Deeper never overrides.
        assert!(!prev.should_override(&OutputLockState {
            depth: 4,
            end_time_ns: 200 * MS
        }));
    }
}
