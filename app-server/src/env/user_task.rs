//! Tunables for ingestion-time user-task extraction (`traces/user_task`).

use super::NumEnv;

/// Per-trace user-task winner-lock TTL (~6h). Bounds how long a winning
/// span's lock gates weaker candidates; after expiry the next candidate
/// re-extracts from scratch.
pub const USER_TASK_LOCK_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("USER_TASK_LOCK_TTL_SECONDS", 21600);

/// Destination project for user-task internal (self-)tracing spans. Unset /
/// unparsable ⇒ `None` ⇒ the spans are no-ops in the internal exporter.
/// Deliberately distinct from other internal-tracing project ids (e.g.
/// `TRACE_CHAT_INTERNAL_PROJECT_ID`) so each feature routes to its own project.
pub const USER_TASK_INTERNAL_PROJECT_ID: &str = "USER_TASK_INTERNAL_PROJECT_ID";

/// Provider for the regex-generation LLM calls. Unset/empty ⇒ bedrock.
/// Either way, a provider that isn't registered (missing credentials)
/// silently falls back to the `LLM_PROVIDER` default inside
/// `LlmClient::resolve`.
pub const INPUT_EXTRACTION_LLM_PROVIDER: &str = "INPUT_EXTRACTION_LLM_PROVIDER";
