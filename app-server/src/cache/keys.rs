//! This module contains the prefixes for the cache keys.
//! Keys are used across modules and need to be stored in a single place

pub const CUSTOM_MODEL_COSTS_CACHE_KEY: &str = "custom_model_costs";
pub const MODEL_COSTS_CACHE_KEY: &str = "model_costs";
pub const PROJECT_API_KEY_CACHE_KEY: &str = "project_api_key";
pub const PROJECT_CACHE_KEY: &str = "project";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNAL_TRIGGERS_CACHE_KEY: &str = "signal_triggers";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNAL_TRIGGER_LOCK_CACHE_KEY: &str = "signal_trigger_lock";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const ALERT_FILTERS_CACHE_KEY: &str = "alert_filters";
pub const WORKSPACE_BYTES_USAGE_CACHE_KEY: &str = "workspace_bytes_usage";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
// Raw accumulated token counts per workspace; cost in micro-USD is derived at
// read time so a rate change re-prices the hot cache. Input, cache-read, and
// output are kept in separate keys because each is priced at a different rate.
// Must stay in sync with the frontend constants in `frontend/lib/cache.ts`.
pub const WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY: &str =
    "workspace_signal_runs_usage_input_tokens";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY: &str =
    "workspace_signal_runs_usage_cache_read_tokens";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY: &str =
    "workspace_signal_runs_usage_output_tokens";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const CLUSTERING_LOCK_CACHE_KEY: &str = "clustering_lock";
pub const AUTOCOMPLETE_LOCK_CACHE_KEY: &str = "autocomplete_lock";
pub const AUTOCOMPLETE_CACHE_KEY: &str = "autocomplete";
pub const WORKSPACE_DEPLOYMENTS_CACHE_KEY: &str = "workspace_deployment_config";
pub const WORKSPACE_DEPLOYMENTS_BY_WORKSPACE_CACHE_KEY: &str = "workspace_deployment_config_by_ws";
pub const DATA_PLANE_AUTH_TOKEN_CACHE_KEY: &str = "data_plane_auth_token";
pub const REPORT_SCHEDULER_LOCK_CACHE_KEY: &str = "report_scheduler_lock";
pub const REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY: &str = "report_scheduler_last_check";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SAMPLING_FACTORS_CACHE_KEY: &str = "sampling_factors";
pub const WORKSPACE_USAGE_WARNINGS_CACHE_KEY: &str = "workspace_usage_warnings";
pub const USAGE_WARNING_SEND_LOCK_KEY: &str = "usage_warning_send_lock";
/// Marks that a hard-limit notification has already been sent this billing cycle
/// for a given (workspace, usage item). Keyed `…:{workspace_id}:{usage_item}` and
/// set with a TTL until the next billing reset so it fires at most once per cycle.
/// There is no DB column for hard-limit notifications (unlike warnings'
/// `last_notified_at`), so this cache key is the sole dedup mechanism.
pub const HARD_LIMIT_NOTIFIED_CACHE_KEY: &str = "workspace_hard_limit_notified";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SYS_PROMPT_SUMMARY_CACHE_KEY: &str = "sys_prompt_summary_v2";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SPAN_KEEP_DEFAULT_RULES_CACHE_KEY: &str = "signals_span_keep_default_rules";
pub const TRACE_EVALUATION_ID_CACHE_KEY: &str = "trace_evaluation_id";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const TRACE_INPUT_REGEX_CACHE_KEY: &str = "signals_trace_input_regex";

pub const INGESTION_RATE_LIMIT_PROJECT_ID_CACHE_KEY: &str = "ingestion_rate_limit_project_id";
pub const PROJECT_MEMBERSHIP_CACHE_KEY: &str = "project_membership";
pub const AGENT_VERSION_HASH_CACHE_KEY: &str = "agent_version_hash";
pub const AGENT_STABLE_PROMPT_REGEX_CACHE_KEY: &str = "agent_stable_prompt_regex";
pub const AGENT_CLASSIFY_LOCK_CACHE_KEY: &str = "agent_classify_lock";

// Debugger replay cache (LAM-1715). Concrete Redis keys are namespaced by
// `(project_id, replay_trace_id)` — see `traces/debug_cache.rs`.
pub const DEBUGGER_CACHE_KEY: &str = "debugger_replay_cache";
pub const DEBUGGER_CACHE_READY_KEY: &str = "debugger_replay_ready";
pub const DEBUGGER_CACHE_LOCK_KEY: &str = "debugger_replay_lock";
