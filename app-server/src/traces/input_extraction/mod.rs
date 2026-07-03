//! Ingestion-time user-task extraction (LAM-1880).
//!
//! Extracts the user's task from a trace's winning LLM span at ingestion
//! time and stores it as trace metadata (`lmnr_user_task`). Key design
//! points:
//!   - operates on the whole last TURN (every user message after the
//!     latest assistant message), not just the last user message;
//!   - joins parts with a signpost separator both when generating and
//!     when applying the regex, then re-joins the extraction on a plain
//!     user-facing separator;
//!   - prepends the system prompt (behind a boundary signpost) for
//!     additional safety — the rare task-in-system-prompt case — while
//!     keeping the fingerprint user-only (`prompt_hash` already keys
//!     system identity in the regex cache);
//!   - fingerprints parts order-insensitively (multi-part messages
//!     arrive in unknown order);
//!   - never falls back to raw text — a no-result run writes a boolean
//!     marker metadata key instead;
//!   - caches generated regexes per project + prompt hash + fingerprint
//!     (`USER_TASK_REGEX_CACHE_KEY`) so traces with the same scaffolding
//!     shape share one LLM call.
//!
//! Module layout:
//!   - `messages` — permissive parsing of LLM-span input messages;
//!   - `fingerprint` — structural fingerprinting of user messages;
//!   - `input` — last-turn collection, signpost join/split, prepared
//!     input (`UserTaskInput`);
//!   - `regex` — regex application (`fancy-regex`) and the regex cache;
//!   - `generate` — the LLM call that generates an extraction regex;
//!   - `lock` — per-trace winner arbitration (`UserTaskLockState`);
//!   - `metadata` — extraction outcome → trace-metadata patch;
//!   - `producer` — the ingestion-side hook (candidate capture, winner
//!     gate, inline apply, enqueue on miss);
//!   - `queue` / `consumer` — the regex-generation queue and its worker;
//!   - `self_tracing` — internal OTEL spans for the consumer's LLM work.

pub mod consumer;
pub mod fingerprint;
pub mod generate;
pub mod input;
pub mod lock;
pub mod messages;
pub mod metadata;
pub mod producer;
pub mod queue;
pub mod regex;
pub mod self_tracing;

pub use producer::{
    UserTaskCandidate, UserTaskSpanContext, capture_user_task_candidate,
    process_user_task_candidates, set_llm_client_available,
};
