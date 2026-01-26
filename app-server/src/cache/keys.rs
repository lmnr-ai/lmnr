//! This module contains the prefixes for the cache keys.
//! Keys are used across modules and need to be stored in a single place

pub const LLM_PRICES_CACHE_KEY: &str = "llm_prices";
pub const PROJECT_API_KEY_CACHE_KEY: &str = "project_api_key";
pub const PROJECT_CACHE_KEY: &str = "project";
pub const WORKSPACE_LIMITS_CACHE_KEY: &str = "workspace_limits";
pub const PROJECT_EVALUATORS_BY_PATH_CACHE_KEY: &str = "project_evaluators_by_path";
pub const SIGNAL_TRIGGERS_CACHE_KEY: &str = "signal_triggers";
pub const SIGNAL_TRIGGER_LOCK_CACHE_KEY: &str = "signal_trigger_lock";
pub const WORKSPACE_BYTES_USAGE_CACHE_KEY: &str = "workspace_bytes_usage";
pub const CLUSTERING_LOCK_CACHE_KEY: &str = "clustering_lock";
pub const AUTOCOMPLETE_LOCK_CACHE_KEY: &str = "autocomplete_lock";
pub const AUTOCOMPLETE_CACHE_KEY: &str = "autocomplete";
