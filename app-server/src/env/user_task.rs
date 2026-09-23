//! Tunables for ingestion-time user-task extraction (`traces/user_task`).

use super::NumEnv;

/// Per-trace user-task winner-lock TTL (90m). Bounds how long a winning
/// span's lock gates weaker candidates; after expiry the next candidate
/// re-extracts from scratch. Also used as the TTL for the output lock
/// (`TRACE_OUTPUT_LOCK_CACHE_KEY`).
pub const USER_TASK_LOCK_TTL_SECONDS: NumEnv<u64> = NumEnv::new("USER_TASK_LOCK_TTL_SECONDS", 5400);

/// Consecutive `NoMatch` applications that evict a cached user-task regex; any
/// hit resets the count. Below it the missed trace is extracted directly and the
/// regex stays, so a rare outlier can't discard a regex that fits its cohort.
pub const USER_TASK_REGEX_MAX_CONSECUTIVE_MISSES: NumEnv<i64> =
    NumEnv::new("USER_TASK_REGEX_MAX_CONSECUTIVE_MISSES", 10);

/// Destination project for user-task internal (self-)tracing spans. Unset /
/// unparsable ⇒ `None` ⇒ the spans are no-ops in the internal exporter.
/// Deliberately distinct from other internal-tracing project ids (e.g.
/// `TRACE_CHAT_INTERNAL_PROJECT_ID`) so each feature routes to its own project.
pub const USER_TASK_INTERNAL_PROJECT_ID: &str = "USER_TASK_INTERNAL_PROJECT_ID";
