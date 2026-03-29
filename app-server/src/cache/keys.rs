//! This module contains the prefixes for the cache keys.
//! Keys are used across modules and need to be stored in a single place

pub const CUSTOM_MODEL_COSTS_CACHE_KEY: &str = "custom_model_costs";
pub const MODEL_COSTS_CACHE_KEY: &str = "model_costs";
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
pub const WORKSPACE_DEPLOYMENTS_BY_WORKSPACE_CACHE_KEY: &str = "workspace_deployment_config_by_ws";
pub const DATA_PLANE_AUTH_TOKEN_CACHE_KEY: &str = "data_plane_auth_token";
pub const REPORT_SCHEDULER_LOCK_CACHE_KEY: &str = "report_scheduler_lock";
pub const REPORT_SCHEDULER_LAST_CHECK_CACHE_KEY: &str = "report_scheduler_last_check";
pub const SIGNAL_BATCH_LOCK_CACHE_KEY: &str = "signal_batch_lock";
pub const SIGNAL_BATCH_SUBMITTED_CACHE_KEY: &str = "signal_batch_submitted";
pub const USAGE_WARNING_SENT_CACHE_KEY: &str = "usage_warning_sent";
pub const WORKSPACE_USAGE_WARNINGS_CACHE_KEY: &str = "workspace_usage_warnings";
