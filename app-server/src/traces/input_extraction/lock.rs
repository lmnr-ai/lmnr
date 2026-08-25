//! Winner arbitration state: the per-trace record that arbitrates which
//! LLM span's input owns the trace's user task.
//!
//! Two steps, applied in order:
//!   1. **earliest start per `agent_hash`** — that agent's representative;
//!   2. across agents, the representative with the **most total input
//!      tokens**.
//!
//! Why earliest, within an agent: a trace's task lives in the FIRST step of
//! its agent. Later loop steps grow monotonically in tokens while their last
//! turn is tool output, not the task — so "biggest step" reliably picks a
//! mid-loop turn and stores its tool result as the user's task.
//!
//! Why tokens, across agents: the real main-agent call carries system prompt
//! + tool schemas + history, while helpers (title generation, task
//! summarization, routing) carry little.
//!
//! **This must stay a two-step reduction.** "Earlier inside an agent, more
//! tokens across agents" as a SINGLE relation is not transitive —
//! {X,t=1,10tok} beats {X,t=2,100tok} beats {Y,t=0,50tok} beats the first —
//! so a fold over it would depend on iteration order and the published value
//! would flip-flop for as long as spans kept arriving. Reducing per agent
//! first, then across representatives, is well-defined and order-independent.
//!
//! **Span-path depth is deliberately NOT a factor.** A depth gate looks like
//! a clean main-agent-vs-subagent signal, but production traces routinely put
//! a small helper agent ("summarize the task", title generation) at a
//! SHALLOWER depth than the main agent, which a gate then keeps as the only
//! survivor — and no amount of later comparison recovers, because the main
//! agent never enters the map at all. Token mass handles helpers at any
//! depth. The accepted trade-off is a subagent whose FIRST call out-tokens
//! the main agent's first call; in practice the main agent carries the larger
//! context.
//!
//! `min(start_time)` is monotone, so a late-arriving earlier step just
//! corrects its agent's representative — no arbitration window is needed
//! (this replaced a "first N spans by start time" roster). The cost is that
//! the winner can move DOWN in tokens, so the publish gate compares the
//! derived winner's `content_hash` against the last published one rather than
//! requiring each challenger to beat its predecessor.
//!
//! Versioning is deliberately simple: the supplementary RMT tables version
//! on `updated_at = now64()`, so a later qualifying write wins. This cache
//! gate is the ONLY thing that decides which spans qualify — no manual
//! version encoding, no clamping, no write mutex.
//!
//! Trace-output arbitration (LAM-1953 rework) does NOT have its own
//! independent lock. Instead, whenever the input winner above is
//! established, its stripped path (ancestor names, own segment removed) is
//! cached under [`main_agent_path_cache_key`]. Every LLM span whose own
//! stripped path equals that cached prefix is treated as being on the
//! main-agent path and is eligible to update the trace output; the RMT
//! version (`updated_at` = the span's end time) is what makes "latest wins"
//! hold, so no separate depth/end-time gate is needed here.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::{MAIN_AGENT_PATH_CACHE_KEY, USER_TASK_LOCK_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;

/// How many distinct agents one trace may track. A trace normally has a
/// handful; the cap only bounds a pathological fan-out. Eviction drops the
/// lowest-token representative, which is the least likely main agent.
const MAX_AGENTS: usize = 8;

pub fn lock_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{USER_TASK_LOCK_CACHE_KEY}:{project_id}:{trace_id}")
}

/// Cache key for the current user-task input winner's stripped path
/// (ancestor names, own segment removed). Every LLM span whose own stripped
/// path equals this value is on the winning main-agent path and is a
/// trace-output candidate (LAM-1953 rework: replaces the independent
/// `OutputLockState` depth/end-time arbitration with reuse of the input
/// winner).
pub fn main_agent_path_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{MAIN_AGENT_PATH_CACHE_KEY}:{project_id}:{trace_id}")
}

/// Compact span-id key: the last 16 hex chars of a span UUID's simple form.
/// Span ids are 8-byte OTLP ids left-padded to 16 bytes, so the first 16
/// hex chars are almost always zeros — dropping them halves the stored key
/// while staying collision-free within a trace. Used only for equality
/// within one trace's state, so any consistent shortening is safe.
pub fn span_key(span_id: Uuid) -> String {
    let simple = span_id.simple().to_string();
    simple[simple.len().saturating_sub(16)..].to_string()
}

fn unknown_time_ns() -> i64 {
    i64::MAX
}

/// Stats of a candidate span competing for the trace's user task. Doubles as
/// an agent's representative inside [`UserTaskLockState`] and as the snapshot
/// a queued extraction carries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WinnerState {
    /// First-sentence hash of the span's system prompt — the agent identity
    /// this candidate represents. Empty for an LLM span with no system
    /// message: those can't be grouped, so they share one bucket.
    #[serde(rename = "a", default)]
    pub agent_hash: String,
    /// Total input tokens (cached + uncached). Total, NOT uncached: the true
    /// first span's system prompt is often cache-read from prior
    /// conversations while helper spans are too small to cache at all
    /// (~1024 token minimum), so subtracting cache-read ranks the helper
    /// higher. Tokens (not cost) on purpose: cost is only derivable when the
    /// model resolves in the pricing tables.
    #[serde(rename = "k", default)]
    pub input_tokens: i64,
    /// Start time (ns since epoch); `i64::MAX` = unknown. Also the default
    /// for legacy lock JSON without `t`. An unknown time sorts last, so a
    /// candidate with a real time represents its agent instead.
    #[serde(rename = "t", default = "unknown_time_ns")]
    pub start_time_ns: i64,
    /// Shortened span id ([`span_key`]) — dedups re-registration on
    /// redelivery and matches the derived winner back to this batch's
    /// contenders.
    #[serde(rename = "id", default)]
    pub span_id: String,
    /// Full hash of the joined last-turn user parts. This is the publish
    /// gate: the effect runs when the derived winner's content differs from
    /// what was last published, so a winner change that carries identical
    /// text is a no-op. Distinct from the structural `fingerprint` (the
    /// regex cache key).
    #[serde(rename = "h", default)]
    pub content_hash: String,
}

/// Per-trace arbitration state stored under `lock_cache_key`. Lock JSON from
/// before the per-agent model (`{d,r,w}`) decodes to `{agents: [], published:
/// None}` — the next candidate rebuilds the map and publishes, a graceful
/// reset.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct UserTaskLockState {
    /// One representative per agent: that agent's earliest-starting
    /// candidate. A `Vec` rather than a map because it holds a handful of
    /// entries and serializes compactly.
    #[serde(rename = "g", default)]
    pub agents: Vec<WinnerState>,
    /// `content_hash` of the last extraction whose effect landed (metadata
    /// publish or queue enqueue). `None` until the first effect.
    #[serde(rename = "p", default)]
    pub published: Option<String>,
}

impl UserTaskLockState {
    /// Fold a candidate into its agent's slot, keeping the earliest start.
    /// Equal starts break on span id so concurrent writers converge on the
    /// same representative. Idempotent under redelivery.
    pub fn register(&mut self, state: WinnerState) {
        match self
            .agents
            .iter_mut()
            .find(|e| e.agent_hash == state.agent_hash)
        {
            Some(existing) => {
                if (state.start_time_ns, &state.span_id)
                    < (existing.start_time_ns, &existing.span_id)
                {
                    *existing = state;
                }
            }
            None => self.agents.push(state),
        }
        while self.agents.len() > MAX_AGENTS {
            let Some(idx) = self
                .agents
                .iter()
                .enumerate()
                .min_by_key(|(_, e)| (e.input_tokens, e.start_time_ns))
                .map(|(i, _)| i)
            else {
                break;
            };
            self.agents.remove(idx);
        }
    }

    /// The trace's chosen candidate: the representative with the most total
    /// input tokens. Tie-breaks (earlier start, then span id) exist purely so
    /// two workers deriving from the same map agree.
    pub fn winner(&self) -> Option<&WinnerState> {
        self.agents.iter().max_by(|a, b| {
            a.input_tokens
                .cmp(&b.input_tokens)
                .then_with(|| b.start_time_ns.cmp(&a.start_time_ns))
                .then_with(|| b.span_id.cmp(&a.span_id))
        })
    }

    /// CRDT-ish merge with a concurrently-written lock: fold the other's
    /// representatives in. Earliest-per-agent is commutative, so the union
    /// converges regardless of write order.
    ///
    /// `published` takes the incoming value whenever `other` has one.
    /// Receiver-wins would FREEZE the field at its first value — no writer
    /// could ever advance it, leaving the effect gate comparing every later
    /// winner against a stale hash for the whole TTL.
    ///
    /// This puts an invariant on callers: **set `published` only after your
    /// own effect landed, never to the value you read.** Writing back a
    /// read-time hash would roll back a concurrent batch that published in
    /// between and reopen the gate. Both writers honour it — the producer
    /// takes the field out of the state it writes (`published_before` in
    /// `process_trace_inputs`) and the consumer builds a fresh state after a
    /// successful publish.
    pub fn merge_from(&mut self, other: &Self) {
        for entry in &other.agents {
            self.register(entry.clone());
        }
        if other.published.is_some() {
            self.published = other.published.clone();
        }
    }

    /// Should a queued extraction for `snapshot` drop instead of publishing?
    /// Yes when the trace's derived winner now carries different text —
    /// publishing would overwrite it. A winner change to the same text is not
    /// a supersession (the write is a no-op either way). No derivable winner
    /// fails open: a redundant publish beats a missing one.
    ///
    /// One exemption: a winner from the SAME agent that starts LATER than the
    /// snapshot means this state is BEHIND, not ahead — the snapshot is that
    /// agent's earlier representative, i.e. exactly the correction we want
    /// published. Dropping it would leave the later representative's text
    /// stored permanently. The producer persists its map before dispatching to
    /// keep that read fresh, but that write is best-effort, so the check
    /// doesn't rely on it. Cross-agent supersession is unaffected: a different
    /// agent outranking us legitimately owns the task.
    pub fn supersedes(&self, snapshot: &WinnerState) -> bool {
        self.winner().is_some_and(|w| {
            w.content_hash != snapshot.content_hash
                && !(w.agent_hash == snapshot.agent_hash
                    && snapshot.start_time_ns < w.start_time_ns)
        })
    }
}

/// Merge-guarded lock write-back: re-read the lock,
/// [`UserTaskLockState::merge_from`] the local state into it, and write.
/// Best-effort (logged). No mutex/retry — earliest-per-agent is commutative,
/// so a get-then-set race converges on the same map.
pub async fn write_lock_merged(
    cache: &Arc<Cache>,
    lock_key: &str,
    local: &UserTaskLockState,
    trace_id: Uuid,
) {
    let mut merged: UserTaskLockState =
        cache.get(lock_key).await.ok().flatten().unwrap_or_default();
    merged.merge_from(local);
    if let Err(e) = cache
        .insert_with_ttl(lock_key, &merged, USER_TASK_LOCK_TTL_SECONDS.get())
        .await
    {
        log::error!("user-task: lock state write failed for trace [{trace_id}]: {e:?}");
    }
}

/// Write (or refresh the TTL of) the main-agent path cache for a trace.
/// Called both when the input winner is (re-)established and, as a cheap
/// keep-alive, whenever an output candidate matches the cached prefix — so
/// a long-running trace's path cache doesn't expire mid-flight. Best-effort
/// (logged).
pub async fn write_main_agent_path(
    cache: &Arc<Cache>,
    project_id: Uuid,
    trace_id: Uuid,
    prefix: &[String],
) {
    let key = main_agent_path_cache_key(project_id, trace_id);
    if let Err(e) = cache
        .insert_with_ttl(&key, prefix, USER_TASK_LOCK_TTL_SECONDS.get())
        .await
    {
        log::error!("trace-output: main-agent path write failed for trace [{trace_id}]: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(agent: &str, tokens: i64, t: i64, id: &str) -> WinnerState {
        WinnerState {
            agent_hash: agent.to_string(),
            input_tokens: tokens,
            start_time_ns: t,
            span_id: id.to_string(),
            content_hash: format!("h_{id}"),
        }
    }

    #[test]
    fn lock_keys_scope_by_project_and_trace() {
        let p = Uuid::new_v4();
        let t = Uuid::new_v4();
        assert_eq!(lock_cache_key(p, t), format!("user_task_lock:{p}:{t}"));
        assert_eq!(
            main_agent_path_cache_key(p, t),
            format!("main_agent_path:{p}:{t}")
        );
    }

    #[test]
    fn span_key_takes_last_16_hex_chars() {
        // 8-byte OTLP span id left-padded to 16 bytes: leading 16 hex
        // chars are zeros and get dropped.
        let id = Uuid::parse_str("00000000-0000-0000-d2c3-61d0ea548a38").unwrap();
        assert_eq!(span_key(id), "d2c361d0ea548a38");
        // Full-entropy uuid still yields exactly 16 chars (its tail).
        let full = Uuid::new_v4();
        let key = span_key(full);
        assert_eq!(key.len(), 16);
        assert!(full.simple().to_string().ends_with(&key));
    }

    /// Within one agent the EARLIEST step represents it: later loop steps
    /// grow in tokens but their last turn is tool output, not the task.
    #[test]
    fn register_keeps_the_earliest_step_per_agent() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("main", 34_000, 10, "step1"));
        lock.register(w("main", 42_000, 20, "step4"));
        lock.register(w("main", 49_000, 30, "step8"));
        assert_eq!(lock.agents.len(), 1);
        assert_eq!(lock.agents[0].span_id, "step1");
        // A late-arriving EARLIER step corrects the representative — this is
        // what removes the need for an arbitration window.
        lock.register(w("main", 900, 5, "step0"));
        assert_eq!(lock.agents[0].span_id, "step0");
        // Redelivery is idempotent.
        lock.register(w("main", 900, 5, "step0"));
        assert_eq!(lock.agents.len(), 1);
        assert_eq!(lock.agents[0].span_id, "step0");
    }

    /// Across agents, token mass separates the real main agent from small
    /// helper calls. Mirrors the production trace this model was built for: a
    /// 918-token helper starting FIRST, and the main agent's 34k first step.
    #[test]
    fn winner_is_the_biggest_agents_earliest_step() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("helper", 918, 10, "helper1"));
        lock.register(w("main", 34_083, 20, "main1"));
        for (tok, t, id) in [(40_393, 30, "main2"), (42_889, 40, "main5")] {
            lock.register(w("main", tok, t, id));
        }
        assert_eq!(lock.winner().unwrap().span_id, "main1");
    }

    /// Depth is not a factor: a helper that both starts earlier AND sits
    /// shallower than the main agent must still lose on tokens. A depth gate
    /// would have kept only the helper and dropped the main agent entirely.
    #[test]
    fn a_shallower_earlier_helper_still_loses_to_the_main_agent() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("summarizer", 400, 1, "summarize"));
        lock.register(w("main", 30_000, 2, "main1"));
        assert_eq!(lock.winner().unwrap().span_id, "main1");
    }

    /// Learning an agent's EARLIER — hence lower-token — step demotes it, and
    /// that reorders the ranking without changing the promoted agent's
    /// representative. The producer can't publish the new winner when its
    /// representative came from a previous batch; see the KNOWN GAP note in
    /// `producer::process_trace_inputs`. Pinned so the reorder is visible here
    /// rather than only in prod.
    #[test]
    fn learning_an_earlier_step_can_promote_another_agent() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("main", 50_000, 70, "step7"));
        lock.register(w("helper", 5_000, 10, "helper1"));
        assert_eq!(lock.winner().unwrap().span_id, "step7");
        // A later batch supplies the main agent's first step: earlier start,
        // far fewer tokens, so `main` now ranks below `helper`.
        lock.register(w("main", 3_000, 20, "step1"));
        assert_eq!(lock.winner().unwrap().span_id, "helper1");
    }

    /// The mixed relation "earlier inside an agent, more tokens across
    /// agents" is not transitive (A>B>C>A), so the winner MUST come from a
    /// two-step reduction. Pinning it here: registration order must not
    /// change the outcome.
    #[test]
    fn winner_is_independent_of_registration_order() {
        let candidates = [w("x", 10, 1, "a"), w("x", 100, 2, "b"), w("y", 50, 0, "c")];
        let mut forward = UserTaskLockState::default();
        for c in &candidates {
            forward.register(c.clone());
        }
        let mut backward = UserTaskLockState::default();
        for c in candidates.iter().rev() {
            backward.register(c.clone());
        }
        // Agent x's representative is its earliest (10 tokens), so agent y
        // (50) wins — both orders agree.
        assert_eq!(forward.winner().unwrap().span_id, "c");
        assert_eq!(backward.winner().unwrap().span_id, "c");
    }

    #[test]
    fn agent_map_is_capped_by_dropping_the_smallest() {
        let mut lock = UserTaskLockState::default();
        for i in 0..(MAX_AGENTS as i64 + 3) {
            // Ascending tokens, so the earliest-registered are the smallest.
            lock.register(w(&format!("agent{i}"), 100 * (i + 1), i, &format!("s{i}")));
        }
        assert_eq!(lock.agents.len(), MAX_AGENTS);
        assert!(!lock.agents.iter().any(|e| e.agent_hash == "agent0"));
        // The biggest survives — it is the likely main agent.
        assert_eq!(lock.winner().unwrap().agent_hash, "agent10");
    }

    /// Spans with no system message can't be grouped, so they share the
    /// empty-hash bucket rather than each becoming their own "agent".
    #[test]
    fn missing_agent_hash_is_one_shared_bucket() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("", 100, 20, "b"));
        lock.register(w("", 500, 10, "a"));
        assert_eq!(lock.agents.len(), 1);
        assert_eq!(lock.agents[0].span_id, "a");
    }

    /// The merge must converge regardless of which side is folded into
    /// which — that is what makes the lock write-back safe without a mutex.
    #[test]
    fn merge_is_commutative() {
        let build = || {
            let mut l = UserTaskLockState::default();
            l.register(w("main", 300, 30, "late"));
            l
        };
        let mut other = UserTaskLockState::default();
        other.register(w("main", 100, 10, "early"));
        other.register(w("helper", 70, 7, "helper1"));

        let mut forward = build();
        forward.merge_from(&other);
        let mut backward = other.clone();
        backward.merge_from(&build());
        assert_eq!(forward.agents.len(), 2);
        assert_eq!(forward.winner(), backward.winner());
        assert_eq!(
            forward
                .agents
                .iter()
                .find(|e| e.agent_hash == "main")
                .unwrap()
                .span_id,
            "early"
        );
    }

    #[test]
    fn merging_advances_published_to_the_incoming_value() {
        let mut a = UserTaskLockState::default();
        let mut b = UserTaskLockState::default();
        b.published = Some("h_x".to_string());
        a.merge_from(&b);
        assert_eq!(a.published.as_deref(), Some("h_x"));
        // The incoming value wins on disagreement — only a writer whose
        // effect landed sets it. Receiver-wins would freeze the field here.
        let mut c = UserTaskLockState::default();
        c.published = Some("h_y".to_string());
        a.merge_from(&c);
        assert_eq!(a.published.as_deref(), Some("h_y"));
        // A merge from a writer that published nothing leaves it alone.
        a.merge_from(&UserTaskLockState::default());
        assert_eq!(a.published.as_deref(), Some("h_y"));
    }

    #[test]
    fn supersedes_only_when_the_winner_carries_different_text() {
        let snapshot = w("main", 100, 50, "self");
        // No derivable winner: fail open and publish.
        assert!(!UserTaskLockState::default().supersedes(&snapshot));
        // The snapshot IS the winner (its own producer write): publish.
        let mut own = UserTaskLockState::default();
        own.register(snapshot.clone());
        assert!(!own.supersedes(&snapshot));
        // A different winner with different text: drop, publishing would
        // overwrite the correct value.
        let mut other = UserTaskLockState::default();
        other.register(w("helper", 9000, 10, "big"));
        assert!(other.supersedes(&snapshot));
        // A different winner carrying the SAME text is not a supersession —
        // the write would be a no-op either way.
        let mut same_text = UserTaskLockState::default();
        let mut twin = w("helper", 9000, 10, "twin");
        twin.content_hash = snapshot.content_hash.clone();
        same_text.register(twin);
        assert!(!same_text.supersedes(&snapshot));
    }

    /// A stale read must not drop the correction. The snapshot is its agent's
    /// EARLIER representative, so a same-agent winner starting later means this
    /// state is behind — dropping would leave the mid-loop text stored for
    /// good.
    #[test]
    fn a_stale_same_agent_winner_does_not_supersede_an_earlier_snapshot() {
        let snapshot = w("main", 3_000, 20, "step1");
        let mut stale = UserTaskLockState::default();
        stale.register(w("main", 50_000, 70, "step7"));
        assert!(!stale.supersedes(&snapshot));

        // The reverse still supersedes: a LATER snapshot for the same agent is
        // the one that should yield to the stored earlier representative.
        let mut fresh = UserTaskLockState::default();
        fresh.register(w("main", 3_000, 20, "step1"));
        assert!(fresh.supersedes(&w("main", 50_000, 70, "step7")));

        // The exemption is same-agent only — another agent outranking us
        // legitimately owns the task.
        let mut other_agent = UserTaskLockState::default();
        other_agent.register(w("helper", 9_000, 70, "helper1"));
        assert!(other_agent.supersedes(&snapshot));
    }

    #[test]
    fn legacy_lock_json_decodes_to_an_empty_map() {
        // Pre-per-agent locks carry {d,r,w}; unknown keys are ignored and the
        // missing map/published default — arbitration restarts cleanly.
        let back: UserTaskLockState = serde_json::from_str(
            r#"{"d":3,"r":[{"t":10,"id":"abc"}],"w":{"d":3,"k":100,"t":10,"id":"abc","h":"x"}}"#,
        )
        .unwrap();
        assert!(back.agents.is_empty());
        assert!(back.published.is_none());
    }

    #[test]
    fn lock_state_serializes_with_short_keys() {
        let mut lock = UserTaskLockState::default();
        lock.register(w("ag", 100, 10, "abc"));
        lock.published = Some("h_abc".to_string());
        let json = serde_json::to_string(&lock).unwrap();
        assert_eq!(
            json,
            r#"{"g":[{"a":"ag","k":100,"t":10,"id":"abc","h":"h_abc"}],"p":"h_abc"}"#
        );
        let back: UserTaskLockState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, lock);
    }

    #[test]
    fn legacy_winner_snapshot_decodes_with_defaults() {
        // A queued pre-per-agent message's winner_state ({c,d,s,t}) decodes:
        // t maps, tokens default 0, agent hash + span id + content hash
        // default empty.
        let back: WinnerState =
            serde_json::from_str(r#"{"c":1.5,"d":3,"s":"plain","t":42}"#).unwrap();
        assert_eq!(back.start_time_ns, 42);
        assert_eq!(back.input_tokens, 0);
        assert_eq!(back.agent_hash, "");
        assert_eq!(back.span_id, "");
        assert_eq!(back.content_hash, "");
    }

    #[tokio::test]
    async fn write_lock_merged_folds_into_the_stored_map() {
        use crate::cache::in_memory::InMemoryCache;
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let trace_id = Uuid::new_v4();
        let lock_key = format!("test_lock:{trace_id}");

        // Two writers race; the second must fold into the stored state
        // rather than clobber it.
        let mut first = UserTaskLockState::default();
        first.register(w("main", 500, 30, "late"));
        first.published = Some("h_late".to_string());
        write_lock_merged(&cache, &lock_key, &first, trace_id).await;

        let mut second = UserTaskLockState::default();
        second.register(w("helper", 100, 20, "helper1"));
        write_lock_merged(&cache, &lock_key, &second, trace_id).await;

        let stored: UserTaskLockState = cache.get(&lock_key).await.unwrap().unwrap();
        assert_eq!(stored.agents.len(), 2);
        assert_eq!(stored.published.as_deref(), Some("h_late"));
        assert_eq!(stored.winner().unwrap().span_id, "late");
    }

    /// A later batch's publish must reach the cache. Receiver-wins froze
    /// `published` at its first value, so the effect gate compared every
    /// later winner against a stale hash and re-ran for the whole TTL.
    #[tokio::test]
    async fn write_lock_merged_advances_a_stored_published_hash() {
        use crate::cache::in_memory::InMemoryCache;
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let trace_id = Uuid::new_v4();
        let lock_key = format!("test_lock:{trace_id}");

        // Batch 1: a helper wins and its text publishes.
        let mut first = UserTaskLockState::default();
        first.register(w("helper", 900, 10, "helper1"));
        first.published = Some("h_helper".to_string());
        write_lock_merged(&cache, &lock_key, &first, trace_id).await;

        // Batch 2: the main agent outranks it and publishes different text.
        let mut second = UserTaskLockState::default();
        second.register(w("main", 34_000, 20, "main1"));
        second.published = Some("h_main".to_string());
        write_lock_merged(&cache, &lock_key, &second, trace_id).await;

        let stored: UserTaskLockState = cache.get(&lock_key).await.unwrap().unwrap();
        assert_eq!(stored.published.as_deref(), Some("h_main"));
        // The map still merges both agents.
        assert_eq!(stored.agents.len(), 2);
        assert_eq!(stored.winner().unwrap().span_id, "main1");
    }

    #[tokio::test]
    async fn write_main_agent_path_roundtrips() {
        use crate::cache::in_memory::InMemoryCache;
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let prefix = vec!["agent".to_string()];

        write_main_agent_path(&cache, project_id, trace_id, &prefix).await;

        let key = main_agent_path_cache_key(project_id, trace_id);
        let stored: Vec<String> = cache.get(&key).await.unwrap().unwrap();
        assert_eq!(stored, prefix);
    }
}
