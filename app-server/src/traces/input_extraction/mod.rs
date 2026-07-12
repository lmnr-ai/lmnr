//! Ingestion-time user-task extraction (LAM-1880) plus trace-output and
//! subagent input/output extraction (LAM-1953).
//!
//! Extracts the user's task from a trace's winning LLM span at ingestion
//! time and stores it as trace metadata (`lmnr_user_task`). Key design
//! points:
//!   - operates on the whole last TURN (every user message after the
//!     latest assistant message), not just the last user message;
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
//!   - LAM-1953 adds inline trace-output extraction (latest toolless
//!     assistant text, shallowest-LLM-span-wins → `lmnr_trace_output`)
//!     and per-subagent input/output extraction keyed on the subagent's
//!     locator span id (`lmnr_subagent_input.<uuid>`,
//!     `lmnr_subagent_output.<uuid>`, `lmnr_subagent_path.<uuid>`),
//!     sharing the regex cache and generation queue with the main flow.
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
//!   - `output` — trace-output capture and inline processing;
//!   - `producer` — the ingestion-side hook (candidate capture, winner
//!     gate, inline apply, enqueue on miss, output / subagent passes);
//!   - `queue` / `consumer` — the regex-generation queue and its worker;
//!   - `self_tracing` — internal OTEL spans for the consumer's LLM work;
//!   - `subagent` — locator resolution and per-locator subagent
//!     input/output extraction.

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
pub mod subagent;

pub use output::{OutputCandidate, capture_output_candidate};
pub use producer::{
    UserTaskCandidate, UserTaskSpanContext, capture_user_task_candidate,
    process_user_task_candidates,
};
