//! This module contains the prefixes for the cache keys.
//! Keys are used across modules and need to be stored in a single place

pub const LLM_PRICES_CACHE_KEY: &str = "llm_prices";
pub const PROJECT_API_KEY_CACHE_KEY: &str = "project_api_key";
pub const PROJECT_CACHE_KEY: &str = "project";
pub const WORKSPACE_LIMITS_CACHE_KEY: &str = "workspace_limits";
pub const PROJECT_EVALUATORS_BY_PATH_CACHE_KEY: &str = "project_evaluators_by_path";
pub const SEMANTIC_EVENT_TRIGGER_SPANS_CACHE_KEY: &str = "semantic_event_trigger_spans";
pub const PROJECT_EVENT_NAMES_CACHE_KEY: &str = "project_event_names";
pub const WORKSPACE_BYTES_USAGE_CACHE_KEY: &str = "workspace_bytes_usage";
pub const CLUSTERING_LOCK_CACHE_KEY: &str = "clustering_lock";
pub const AUTOCOMPLETE_LOCK_CACHE_KEY: &str = "autocomplete_lock";
pub const AUTOCOMPLETE_CACHE_KEY: &str = "autocomplete";
pub const WORKSPACE_DEPLOYMENTS_CACHE_KEY: &str = "workspace_deployment_config";
pub const DATA_PLANE_AUTH_TOKEN_CACHE_KEY: &str = "data_plane_auth_token";
