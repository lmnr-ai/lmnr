//! Per-project rate limits. Each is required (unwrapped) only when
//! its feature is enabled, which itself checks presence — so bare names.

/// Global default N for the /v1/sql per-project limit; per-project N
/// overrides live in cache (`sql_rate_limit:{id}`). The period is global.
/// TODO: Rename env vars to be SQL-specific, or extend this rate limit to apply to all endpoints.
pub const HTTP_LIMIT: &str = "RATE_LIMIT";
pub const HTTP_PERIOD_SECS: &str = "RATE_LIMIT_PERIOD_SECS";

/// Global defaults for the per-project data-ingestion limit (gRPC + HTTP
/// OTLP traces); per-project overrides live in cache
/// (`ingestion_project_rate_limit:{id}` for N,
/// `ingestion_project_rate_limit_period:{id}` for the window seconds).
pub const INGESTION_LIMIT: &str = "INGESTION_RATE_LIMIT";
pub const INGESTION_PERIOD_SECS: &str = "INGESTION_RATE_LIMIT_PERIOD_SECS";
