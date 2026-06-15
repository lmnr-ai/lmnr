//! Tracing / logging / Sentry configuration.

/// Sentry DSN. Presence (plus `ENABLE_TRACING`) enables the Sentry tree.
pub const SENTRY_DSN: &str = "SENTRY_DSN";
/// Master switch for both the Sentry and internal self-tracing trees.
pub const ENABLE_TRACING: &str = "ENABLE_TRACING";
/// Standard `tracing_subscriber` env filter for the fmt + Sentry layers.
pub const RUST_LOG: &str = "RUST_LOG";
/// Enables the reports scheduler (plus a configured email client).
pub const ENABLE_REPORTS: &str = "ENABLE_REPORTS";
