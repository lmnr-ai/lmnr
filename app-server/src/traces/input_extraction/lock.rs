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
//!
//! Versioning is deliberately simple: the supplementary RMT tables version
//! on `updated_at = now64()`, so a later qualifying write wins. This cache
//! gate is the ONLY thing that decides which spans qualify — no manual
//! version encoding, no clamping, no write mutex.

use std::sync::Arc;

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

fn unknown_time_ns() -> i64 {
    i64::MAX
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
    /// Start time (ns since epoch); `i64::MAX` = unknown. Also the default
    /// for legacy lock JSON without `t`.
    #[serde(rename = "t", default = "unknown_time_ns")]
    pub start_time_ns: i64,
    /// Simple-form span id — dedups roster re-registration on redelivery
    /// and breaks full ties deterministically.
    #[serde(rename = "id", default)]
    pub span_id: String,
    /// Full hash of the joined last-turn user parts. Two spans with the
    /// same content already share an extraction, so a strictly-stronger
    /// challenger carrying identical content is a no-op (see the effect
    /// gate in `producer::process_trace_inputs`). Distinct from the
    /// structural `fingerprint` (the regex cache key).
    #[serde(rename = "h", default)]
    pub content_hash: String,
}

impl WinnerState {
    /// Partial order: shallower depth wins; at equal depth, more
    /// non-cached input tokens wins. Equal depth + tokens is a tie
    /// (neither beats) so the first published winner stays — start time /
    /// span id are deliberately NOT tie-breaks. Content is NOT part of
    /// this order; it gates whether the effect re-runs, not which
    /// candidate is stronger.
    pub fn beats(&self, other: &Self) -> bool {
        if self.depth != other.depth {
            return self.depth < other.depth;
        }
        self.input_tokens > other.input_tokens
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

    /// CRDT-ish merge with a concurrently-written lock: the shallower
    /// depth's roster wins wholesale (equal depth → rosters union,
    /// earliest-N), while the winner merges INDEPENDENTLY of depth — the
    /// stronger by [`WinnerState::beats`] survives from either side. The
    /// winner can sit deeper than `lock.depth` (a shallower span that
    /// carried identical content skipped the effect via
    /// `should_run_effect`, resetting `lock.depth` but leaving the deeper
    /// winner in place), so folding it under the depth axis would drop
    /// that winner on a shallow reset. Used by the guarded write-back so a
    /// get-then-set race degrades to a slightly stale roster, never to a
    /// rolled-back winner.
    pub fn merge_from(&mut self, other: &Self) {
        if other.depth < self.depth {
            self.depth = other.depth;
            self.roster = other.roster.clone();
        } else if other.depth == self.depth {
            for entry in &other.roster {
                self.register(entry.clone());
            }
        }
        match (&self.winner, &other.winner) {
            (Some(w), Some(ow)) if ow.beats(w) => self.winner = other.winner.clone(),
            (None, Some(_)) => self.winner = other.winner.clone(),
            _ => {}
        }
    }

    /// Does the current lock supersede a queued candidate's snapshot —
    /// i.e. should the queued extraction drop instead of publishing? Yes
    /// iff the published winner strictly beats the snapshot (shallower
    /// depth, else more tokens). `beats` is a strict order, so an equal
    /// winner (this candidate's own producer write) does not supersede,
    /// and a weaker one — stale state the snapshot already beat — does
    /// not either.
    pub fn supersedes(&self, snapshot: &WinnerState) -> bool {
        self.winner.as_ref().is_some_and(|w| w.beats(snapshot))
    }
}

/// Merge-guarded lock write-back: re-read the lock,
/// [`UserTaskLockState::merge_from`] the local state into it (shallower
/// depth wins wholesale; equal depth unions rosters and keeps the
/// stronger winner), and write. Best-effort (logged). No mutex/retry —
/// the RMT store versions on `updated_at`, so a slightly-stale roster
/// from a get-then-set race is harmless and `merge_from` already keeps
/// the stronger winner.
pub async fn write_lock_merged(
    cache: &Arc<Cache>,
    lock_key: &str,
    local: &UserTaskLockState,
    trace_id: Uuid,
) {
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
}

/// Winning-output state for the trace-output lock: the agent's final
/// answer sits on the shallowest spine and is the LAST such message, so
/// strictly shallower wins; at equal depth, strictly later end wins.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutputLockState {
    /// Span path depth of the winning span.
    #[serde(rename = "d")]
    pub depth: usize,
    /// End time (ns since epoch) of the winning span.
    #[serde(rename = "t")]
    pub end_time_ns: i64,
}

impl OutputLockState {
    pub fn should_override(&self, candidate: &Self) -> bool {
        if candidate.depth < self.depth {
            return true;
        }
        candidate.depth == self.depth && candidate.end_time_ns > self.end_time_ns
    }
}

/// Post-publish output-lock write: guarded (a stronger winner already in
/// the lock is never rolled back). The output path has no queued consumer
/// to re-assert a lock the producer failed to write, but the RMT row
/// versions on `updated_at`, so a missed lock write only risks a
/// redundant re-publish, not a wrong stored value. Best-effort (logged).
pub(super) async fn write_output_lock_guarded(
    cache: &Arc<Cache>,
    lock_key: &str,
    state: &OutputLockState,
    trace_id: Uuid,
) {
    let current: Option<OutputLockState> = cache.get(lock_key).await.ok().flatten();
    if current.is_some_and(|c| !c.should_override(state)) {
        // A newer winner took the lock mid-flight: nothing to write.
        return;
    }
    if let Err(e) = cache
        .insert_with_ttl(lock_key, state, USER_TASK_LOCK_TTL_SECONDS.get())
        .await
    {
        log::error!("trace-output: lock write failed for trace [{trace_id}]: {e:?}");
    }
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
            content_hash: String::new(),
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
        // Equal depth+tokens: NEITHER beats — start/id are not tie-breaks.
        assert!(!w(2, 100, 50, "b").beats(&w(2, 100, 100, "a")));
        assert!(!w(2, 100, 100, "a").beats(&w(2, 100, 50, "b")));
        assert!(!w(2, 100, 50, "a").beats(&w(2, 100, 50, "a")));
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
    fn merge_prefers_shallower_roster_and_keeps_stronger_winner_across_depths() {
        let mut a = UserTaskLockState::new(3);
        a.register(entry(10, "deep"));
        a.winner = Some(w(3, 100, 10, "deep"));
        // Shallower other replaces depth+roster but the winner axis is
        // depth-independent: a published deeper winner SURVIVES a
        // winner-less shallow reset.
        let mut b = UserTaskLockState::new(2);
        b.register(entry(20, "shallow"));
        a.merge_from(&b);
        assert_eq!(a.depth, 2);
        assert_eq!(a.roster.len(), 1);
        assert!(a.roster.iter().any(|e| e.span_id == "shallow"));
        assert_eq!(a.winner, Some(w(3, 100, 10, "deep")));
        // Deeper other's roster is ignored, but its stronger winner
        // still merges (depth-major beats).
        let mut c = UserTaskLockState::new(5);
        c.winner = Some(w(3, 9000, 1, "x"));
        a.merge_from(&c);
        assert_eq!(a.depth, 2);
        assert_eq!(a.winner, Some(w(3, 9000, 1, "x")));
        // Equal depth: rosters union; a shallower (stronger) winner
        // replaces the deeper one.
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
        // A shallower published winner supersedes (beats is depth-major).
        let mut shallow_published = UserTaskLockState::new(1);
        shallow_published.winner = Some(w(1, 10, 60, "main"));
        assert!(shallow_published.supersedes(&snapshot));
        // NO published winner never supersedes, regardless of the lock's
        // depth.
        assert!(!UserTaskLockState::new(1).supersedes(&snapshot));
        assert!(!UserTaskLockState::new(2).supersedes(&snapshot));
        // A deeper published winner never supersedes a shallower
        // snapshot — the shallower value must overwrite it.
        let mut deep_winner = UserTaskLockState::new(1);
        deep_winner.winner = Some(w(3, 9000, 1, "x"));
        assert!(!deep_winner.supersedes(&snapshot));
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
    fn winner_deeper_than_lock_depth_survives_and_is_overridable() {
        // A deeper winner can outlive a shallower `lock.depth`: a shallow
        // span carried identical content and skipped the effect (see
        // `should_run_effect`), resetting depth but leaving the earlier
        // deeper winner in place. `merge_from` must keep that winner.
        let mut lock = UserTaskLockState::new(1);
        lock.register(entry(10, "shallow"));
        let deeper = w(3, 500, 20, "subagent");
        let mut prior = UserTaskLockState::new(deeper.depth);
        prior.winner = Some(deeper.clone());
        lock.merge_from(&prior);
        assert_eq!(lock.depth, 1);
        assert_eq!(lock.winner, Some(deeper.clone()));
        // A shallower snapshot beats the deeper winner (depth-major), so
        // the deeper winner cannot supersede it.
        assert!(!lock.supersedes(&w(1, 10, 5, "main")));
        // But it does supersede weaker same/deeper candidates.
        assert!(lock.supersedes(&w(3, 100, 30, "other_subagent")));
    }

    #[test]
    fn lock_state_serializes_with_short_keys() {
        let mut lock = UserTaskLockState::new(2);
        lock.register(entry(10, "abc"));
        lock.winner = Some(w(2, 100, 10, "abc"));
        let json = serde_json::to_string(&lock).unwrap();
        assert_eq!(
            json,
            r#"{"d":2,"r":[{"t":10,"id":"abc"}],"w":{"d":2,"k":100,"t":10,"id":"abc","h":""}}"#
        );
        let back: UserTaskLockState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, lock);
    }

    #[tokio::test]
    async fn write_lock_merged_keeps_stronger_winner() {
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
    }

    #[tokio::test]
    async fn write_output_lock_guarded_keeps_stronger_winner() {
        use crate::cache::in_memory::InMemoryCache;
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let trace_id = Uuid::new_v4();
        let lock_key = format!("test_out_lock:{trace_id}");

        // Stronger (later-ending) state lands first; a weaker write-back
        // must not roll it back.
        let strong = OutputLockState {
            depth: 2,
            end_time_ns: 200_000_000,
        };
        write_output_lock_guarded(&cache, &lock_key, &strong, trace_id).await;
        let weak = OutputLockState {
            depth: 2,
            end_time_ns: 100_000_000,
        };
        write_output_lock_guarded(&cache, &lock_key, &weak, trace_id).await;
        let stored: OutputLockState = cache.get(&lock_key).await.unwrap().unwrap();
        assert_eq!(stored, strong);
    }

    #[test]
    fn legacy_winner_snapshot_decodes_with_defaults() {
        // A queued pre-roster message's winner_state ({c,d,s,t}) decodes:
        // d/t map, tokens default 0, span id + content hash default empty.
        let back: WinnerState =
            serde_json::from_str(r#"{"c":1.5,"d":3,"s":"plain","t":42}"#).unwrap();
        assert_eq!(back.depth, 3);
        assert_eq!(back.start_time_ns, 42);
        assert_eq!(back.input_tokens, 0);
        assert_eq!(back.span_id, "");
        assert_eq!(back.content_hash, "");
    }

    #[test]
    fn output_lock_shallower_wins_then_later_end() {
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
        // Deeper never overrides.
        assert!(!prev.should_override(&OutputLockState {
            depth: 4,
            end_time_ns: 200 * MS
        }));
    }
}
