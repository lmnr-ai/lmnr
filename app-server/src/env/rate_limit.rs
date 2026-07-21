//! Per-project ingestion rate limits. Each is required (unwrapped) only when
//! its feature is enabled, which itself checks presence — so bare names.

/// Global default for the /v1/sql per-project limit; per-project overrides
/// live in cache (`sql_rate_limit:{id}` / `sql_rate_limit_period:{id}`).
pub const HTTP_LIMIT: &str = "RATE_LIMIT";
pub const HTTP_PERIOD_SECS: &str = "RATE_LIMIT_PERIOD_SECS";
pub const GRPC_LIMIT: &str = "GRPC_RATE_LIMIT";
pub const GRPC_PERIOD_SECS: &str = "GRPC_RATE_LIMIT_PERIOD_SECS";
