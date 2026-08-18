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
/// Gives one signal run exclusive use of a trace for its FIRST step, so the
/// next signal's request hits the provider prefix cache the first one warmed
/// instead of racing it. Held only across step 0 and scoped per
/// `(project, trace)` — NOT per signal (cross-signal sharing is the point),
/// which is what distinguishes it from [`SIGNAL_TRIGGER_LOCK_CACHE_KEY`].
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNAL_TRACE_EXCLUSIVE_LOCK_CACHE_KEY: &str = "signal_trace_exclusive_lock";
/// Set once a signal request for a trace has completed, meaning the provider's
/// prefix cache for that trace is warm. Every later run on the trace then skips
/// [`SIGNAL_TRACE_EXCLUSIVE_LOCK_CACHE_KEY`] entirely and runs in PARALLEL — the
/// lock only has to elect the first warmer, not serialize all K signals.
/// Its TTL approximates the provider's implicit-cache lifetime, so it is a
/// heuristic: too long merely costs a cache miss, too short a needless wait.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNAL_PREFIX_WARM_CACHE_KEY: &str = "signal_prefix_warm";
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
/// Race guard mirroring `USAGE_WARNING_SEND_LOCK_KEY` for hard-limit
/// notifications. Hard-limit messages share `definition_id` (= workspace_id)
/// across usage items, so the lock is keyed `…:{workspace_id}:{usage_item}` to
/// avoid a bytes notification suppressing a concurrent signal-cost one.
pub const HARD_LIMIT_SEND_LOCK_KEY: &str = "hard_limit_send_lock";
/// Short-lived cache of `workspace_hard_limit_notifications.last_notified_at`
/// per `(workspace_id, usage_item)`, so over-limit workspaces don't hit
/// Postgres on every blocked ingestion request. The frontend evicts this key
/// when it deletes the underlying dedup row (limit removed/raised); the short
/// TTL is a backstop for a failed eviction. Must stay in sync with the
/// frontend constant in `frontend/lib/cache.ts`.
pub const HARD_LIMIT_NOTIFIED_CACHE_KEY: &str = "hard_limit_notified";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SYS_PROMPT_SUMMARY_CACHE_KEY: &str = "sys_prompt_summary_v2";
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SPAN_KEEP_DEFAULT_RULES_CACHE_KEY: &str = "signals_span_keep_default_rules";
pub const TRACE_EVALUATION_ID_CACHE_KEY: &str = "trace_evaluation_id";
pub const USER_TASK_REGEX_CACHE_KEY: &str = "user_task_regex";
/// `(project, agent_hash, version_hash, has_history) → String` — the user-task
/// extraction regex keyed by prompt VERSION (`Feature::VersionedInputExtraction`).
/// Deliberately a different prefix from `USER_TASK_REGEX_CACHE_KEY` so the two
/// keyings never read each other's entries.
pub const USER_TASK_VERSION_REGEX_CACHE_KEY: &str = "user_task_version_regex";
/// `(project, agent_hash, version_hash, has_history) → SampleAccumulator` — the
/// distinct user-message samples feeding the multi-sample regex agent.
pub const USER_TASK_SAMPLES_CACHE_KEY: &str = "user_task_samples";
/// Per-cohort lock serializing the user-task regex agent's run.
pub const USER_TASK_REGEX_AGENT_LOCK_CACHE_KEY: &str = "user_task_regex_agent_lock";
pub const USER_TASK_LOCK_CACHE_KEY: &str = "user_task_lock";
/// Stripped path (ancestor names, own segment removed) of the current
/// user-task input winner span — every LLM span on this same stripped path
/// is a trace-output candidate. See `input_extraction::lock::main_agent_path_cache_key`.
pub const MAIN_AGENT_PATH_CACHE_KEY: &str = "main_agent_path";

/// Per-project override N for the data-ingestion rate limit, set out-of-band
/// via valkey-cli: `ingestion_project_rate_limit:{project_id}` = N requests
/// per window. Missing key = global `INGESTION_RATE_LIMIT` default.
pub const INGESTION_RATE_LIMIT_CACHE_KEY: &str = "ingestion_project_rate_limit";

/// Per-project override period (seconds) for the data-ingestion rate limit,
/// set out-of-band via valkey-cli:
/// `ingestion_project_rate_limit_period:{project_id}` = window length in
/// seconds. Missing key = global `INGESTION_RATE_LIMIT_PERIOD_SECS` default.
pub const INGESTION_RATE_LIMIT_PERIOD_CACHE_KEY: &str = "ingestion_project_rate_limit_period";

/// Per-project override N for the /v1/sql rate limit, set out-of-band via
/// valkey-cli: `sql_rate_limit:{project_id}` = N requests per the global
/// `RATE_LIMIT_PERIOD_SECS` window. Missing key = global `RATE_LIMIT` default.
pub const SQL_RATE_LIMIT_CACHE_KEY: &str = "sql_rate_limit";

pub const PROJECT_MEMBERSHIP_CACHE_KEY: &str = "project_membership";
pub const AGENT_VERSION_HASH_CACHE_KEY: &str = "agent_version_hash";
pub const AGENT_STABLE_PROMPT_REGEX_CACHE_KEY: &str = "agent_stable_prompt_regex";
pub const AGENT_CLASSIFY_LOCK_CACHE_KEY: &str = "agent_classify_lock";

// Static system-prompt extraction (LAM-1899). All three are namespaced by
// `(project_id, prompt_hash)` — the naive signature — see
// `traces/system_extraction/mod.rs`.
/// `naive_signature → Vec<{pattern, label}>` whose patterns' matches are the
/// prompt's dynamic parts. `_v2` abandons pre-label entries whose shape was a
/// bare `Vec<String>` — readers of the old key (the enterprise summarizer)
/// degrade to their raw-prompt fallback as those entries expire, instead of
/// failing to deserialize objects where strings were cached.
pub const STATIC_SP_REGEX_CACHE_KEY: &str = "static_sp_regex_v2";
/// `naive_signature → Vec<system_prompt>` samples awaiting extraction.
pub const STATIC_SP_ACCUMULATOR_CACHE_KEY: &str = "static_sp_accumulator";
/// `naive_signature → total occurrences seen` (a small counter kept separate
/// from the multi-KB samples blob so bumping it doesn't rewrite the samples).
/// Drives the static-prompt fallback when unique samples never diversify.
pub const STATIC_SP_OCCURRENCES_CACHE_KEY: &str = "static_sp_occurrences";
/// Per-signature extraction lock (legacy pipeline).
pub const STATIC_SP_LOCK_CACHE_KEY: &str = "static_sp_lock";

// System-prompt version tracking (`Feature::StaticSpV2`) — the base layer
// the derived-artifact caches (static-part regexes, later user-task regexes)
// build on. Keyed by `(project_id, agent_hash)` — the first-sentence hash —
// except the memo, which is keyed by the full prompt's content hash. See
// `traces/sp_versioning/versions.rs`.
//
// `_v2` ABANDONS every pre-existing entry, for two reasons that both fail
// SILENTLY rather than as a deserialization error:
//
//   1. Blank lines stopped participating in `line_hashes`, so a v1 version's
//      stored line set contains hashes no new prompt can ever produce. The
//      subset match would never hit again, the full algorithm would run on
//      every prompt, and the dead versions would sit in the registry costing a
//      read apiece until the cap or TTL cleared them.
//   2. `WindowEntry` moved its line hashes out to a key of their own. A v1
//      blob still deserializes (serde ignores the dropped field), but every
//      entry in it references hashes that were never written to the new key —
//      so the window reads as unusable, and the pipeline mints one verbatim
//      version per prompt until the entries age out.
//
// Bumping all five together also makes the version counter start clean, which
// is what makes a post-deploy version count comparable to a local run.
/// `(project, agent_hash) → Vec<VersionEntry>` — live prompt versions,
/// newest first, capped at `SP_EXTRACTION_VERSION_CAP`.
pub const SYSTEM_PROMPT_VERSIONS_CACHE_KEY: &str = "system_prompt_versions_v2";

/// `(project, agent_hash, version_hash) → Vec<u64>` — the version's static
/// line-hash set, read by the cheap subset match.
pub const SYSTEM_PROMPT_VERSION_LINES_CACHE_KEY: &str = "system_prompt_version_lines_v2";

/// `(project, agent_hash, version_hash) → Vec<LabeledRegex>` — the version's
/// static-part removal regexes. Absent = generation pending/failed (readers
/// fall back to the raw prompt).
pub const SYSTEM_PROMPT_DYNAMIC_REGEXES_CACHE_KEY: &str = "system_prompt_dynamic_regexes_v2";

/// `(project, agent_hash) → Vec<WindowEntry>` — last N distinct prompts.
/// Metadata only: the line hashes live one key per prompt (below) so the
/// per-message read-modify-write on this blob doesn't carry them.
pub const SYSTEM_PROMPT_WINDOW_CACHE_KEY: &str = "system_prompt_window_v2";

/// `(project, agent_hash, full_prompt_hash) → Vec<u64>` — one window entry's
/// line hashes. Immutable for the life of the entry, and only read when the
/// full algorithm runs, which is why they are split off the window blob.
pub const SYSTEM_PROMPT_WINDOW_LINES_CACHE_KEY: &str = "system_prompt_window_lines";

/// `(project, agent_hash) → i64` — event time (epoch ms) of the agent's last
/// staleness probe. The value is the SPAN's `start_time`, not wall time, so the
/// interval is measured on the data's own timeline; the key's TTL only bounds
/// memory and deliberately is NOT the mechanism. Shared rather than
/// process-local so the interval means the same thing however many ingest pods
/// are running.
pub const SYSTEM_PROMPT_PROBE_CACHE_KEY: &str = "system_prompt_probe";

/// `(project, full_prompt_hash) → version_hash` — exact-bytes memo letting
/// the ingest producer skip classification for byte-identical repeats. `_v2`
/// with the rest: the value is a v1 version hash, which no longer names a live
/// version, so a hit would label spans with a version nothing can resolve.
pub const SYSTEM_PROMPT_VERSION_MEMO_CACHE_KEY: &str = "system_prompt_version_memo_v2";

/// Per-agent mint lock (`sp_versioning::versions::mint_lock_cache_key`).
pub const SYSTEM_PROMPT_VERSION_LOCK_CACHE_KEY: &str = "system_prompt_version_lock";

/// Per-version lock serializing the SP-regex extraction worker's agent run
/// (`static_sp_extraction::worker::run_lock_cache_key`).
pub const SYSTEM_PROMPT_REGEX_EXTRACTION_LOCK_CACHE_KEY: &str =
    "system_prompt_regex_extraction_lock";

// Debugger replay cache (LAM-1715). Concrete Redis keys are namespaced by
// `(project_id, replay_trace_id)` — see `traces/debug_cache.rs`.
pub const DEBUGGER_CACHE_KEY: &str = "debugger_replay_cache";
pub const DEBUGGER_CACHE_READY_KEY: &str = "debugger_replay_ready";
pub const DEBUGGER_CACHE_LOCK_KEY: &str = "debugger_replay_lock";
