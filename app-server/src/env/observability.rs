//! Tracing / logging / Sentry configuration.

/// Sentry DSN. Presence (plus `ENABLE_TRACING`) enables the Sentry tree.
pub const SENTRY_DSN: &str = "SENTRY_DSN";
/// Master switch for both the Sentry and internal self-tracing trees.
pub const ENABLE_TRACING: &str = "ENABLE_TRACING";
/// Standard `tracing_subscriber` env filter for the fmt + Sentry layers.
pub const RUST_LOG: &str = "RUST_LOG";
/// Base URL of a Laminar instance to export internal self-tracing spans to over OTLP/HTTP
/// (`{url}/v1/traces`). Set together with [`INTERNAL_TRACING_HTTP_API_KEY`] to replace the
/// in-process `push_spans_to_queue` ingest with a regular authenticated HTTP export.
pub const INTERNAL_TRACING_HTTP_URL: &str = "INTERNAL_TRACING_HTTP_URL";
/// Project API key used as the `Authorization: Bearer` credential for the HTTP export above.
/// The key's project is the destination — the per-span routing attribute only gates emission.
pub const INTERNAL_TRACING_HTTP_API_KEY: &str = "INTERNAL_TRACING_HTTP_API_KEY";
/// Enables the reports scheduler (plus a configured email client).
pub const ENABLE_REPORTS: &str = "ENABLE_REPORTS";
