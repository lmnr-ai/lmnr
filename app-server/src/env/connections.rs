//! Shared service connection strings + the operation-mode switch. These are
//! either required, optional-with-fallback-to-in-memory, or consumed by
//! multi-var feature detection, so they're bare names.

/// Redis URL. Optional — absence falls back to in-memory cache + pub/sub.
pub const REDIS_URL: &str = "REDIS_URL";
/// Query engine gRPC URL. Required when the SQL query engine feature is on.
pub const QUERY_ENGINE_URL: &str = "QUERY_ENGINE_URL";
/// pii-redactor gRPC URL. Presence enables the PII redaction feature.
pub const PII_REDACTOR_URL: &str = "PII_REDACTOR_URL";
/// Checkpoints self-tracing destination project id.
pub const CHECKPOINTS_INTERNAL_PROJECT_ID: &str = "CHECKPOINTS_INTERNAL_PROJECT_ID";

/// `producer` | `consumer` | unset (= both). Selects which halves run.
pub const OPERATION_MODE: &str = "OPERATION_MODE";

/// Deployment environment: `development` | `FULL` | `PRODUCTION`. Drives
/// `Feature::UsageLimit` / `Feature::FullBuild` and the Sentry environment tag.
pub const ENVIRONMENT: &str = "ENVIRONMENT";
