//! This module contains the prefixes for the cache keys.
//! Keys are used across modules and need to be stored in a single place

pub const MODEL_COSTS_CACHE_KEY: &str = "model_costs_v1";
pub const PROJECT_API_KEY_CACHE_KEY: &str = "project_api_key";
pub const PROJECT_CACHE_KEY: &str = "project";
pub const SIGNAL_TRIGGERS_CACHE_KEY: &str = "signal_triggers";
pub const SIGNAL_TRIGGER_LOCK_CACHE_KEY: &str = "signal_trigger_lock";
pub const WORKSPACE_BYTES_USAGE_CACHE_KEY: &str = "workspace_bytes_usage";
pub const WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY: &str = "workspace_signal_runs_usage";
pub const CLUSTERING_LOCK_CACHE_KEY: &str = "clustering_lock";
pub const AUTOCOMPLETE_LOCK_CACHE_KEY: &str = "autocomplete_lock";
pub const AUTOCOMPLETE_CACHE_KEY: &str = "autocomplete";
pub const WORKSPACE_DEPLOYMENTS_CACHE_KEY: &str = "workspace_deployment_config";
pub const DATA_PLANE_AUTH_TOKEN_CACHE_KEY: &str = "data_plane_auth_token";
