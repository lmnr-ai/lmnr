//! Ingestion-time user-task extraction (LAM-1880) plus trace-output
//! extraction (LAM-1953).
//!
//! Extracts the user's task from a trace's winning LLM span at ingestion
//! time and stores it as trace metadata (`lmnr_user_task`), and the
//! trace's final output (`lmnr_trace_output`). Key design points:
//!   - operates on the last USER BLOCK (the latest run of consecutive
//!     user messages with real text — tool-result-only user messages are
//!     turn boundaries), so every span of an agentic trace re-finds the
//!     same original task;
//!   - joins parts with a signpost separator both when generating and
//!     when applying the regex, then re-joins the extraction on a plain
//!     user-facing separator;
//!   - fingerprints parts order-insensitively (multi-part messages
//!     arrive in unknown order);
//!   - a generation run that produces no usable pattern (call budget or
//!     LLM retries exhausted) falls back to the passthrough regex
//!     `(?s)(.*)` — the full reconstructed input beats a wrong `false`;
//!     `false` is written only when an applied regex says the input is
//!     scaffolding-only (or a cached regex stops extracting);
//!   - caches generated regexes per project + prompt hash + fingerprint
//!     (`USER_TASK_REGEX_CACHE_KEY`) so traces with the same scaffolding
//!     shape share one LLM call;
//!   - the trace output is the latest toolless assistant text from the
//!     shallowest LLM span — no LLM, no regex, published inline.
//!
//! Module layout:
//!   - `messages` — permissive parsing of LLM-span input/output messages;
//!   - `fingerprint` — structural fingerprinting of user messages;
//!   - `input` — last-user-block collection, signpost join/split,
//!     prepared input (`UserTaskInput`);
//!   - `regex` — regex application (`fancy-regex`) and the regex cache;
//!   - `generate` — the LLM call that generates an extraction regex;
//!   - `lock` — per-trace winner arbitration (roster-based
//!     `UserTaskLockState` for inputs, `OutputLockState` for outputs);
//!   - `metadata` — extraction outcome → trace-metadata patch;
//!   - `output` — trace-output capture and inline processing;
//!   - `producer` — the ingestion-side hook (candidate capture, roster
//!     arbitration, inline apply, enqueue on miss, output pass);
//!   - `queue` / `consumer` — the regex-generation queue and its worker;
//!   - `self_tracing` — internal OTEL spans for the consumer's LLM work.

pub mod consumer;
pub mod fingerprint;
pub mod generate;
pub mod input;
pub mod lock;
pub mod messages;
pub mod metadata;
pub mod output;
pub mod producer;
pub mod queue;
pub mod regex;
pub mod self_tracing;

pub use output::{OutputCandidate, capture_output_candidate};
pub use producer::{
    UserTaskCandidate, UserTaskSpanContext, capture_user_task_candidate,
    process_user_task_candidates,
};
