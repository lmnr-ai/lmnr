//! Per-project ingestion rate limits. Each is required (unwrapped) only when
//! its feature is enabled, which itself checks presence — so bare names.

pub const HTTP_LIMIT: &str = "RATE_LIMIT";
pub const HTTP_PERIOD_SECS: &str = "RATE_LIMIT_PERIOD_SECS";
pub const GRPC_LIMIT: &str = "GRPC_RATE_LIMIT";
pub const GRPC_PERIOD_SECS: &str = "GRPC_RATE_LIMIT_PERIOD_SECS";
