//! Tunables for duration/status-aware Sentry transaction sampling.

/// Fraction (0.0 - 1.0) of fast, non-error transactions kept. Errors and slow
/// transactions bypass this entirely.
pub const EXTERNAL_TRACING_SAMPLE_RATE: &str = "EXTERNAL_TRACING_SAMPLE_RATE";

/// Minimum duration (seconds) above which a transaction is always kept.
pub const SENTRY_MIN_SAMPLED_DURATION_SECS: &str = "SENTRY_MIN_SAMPLED_DURATION_SECS";

/// Default keep-fraction for fast, non-error transactions.
pub const DEFAULT_SAMPLE_RATE: f64 = 0.2;

/// Default duration threshold, in seconds.
pub const DEFAULT_MIN_SAMPLED_DURATION_SECS: f64 = 5.0;

/// Parses a float env var, falling back to `default` when unset, empty, or
/// unparseable. Mirrors [`super::NumEnv::get`] semantics; kept separate because
/// both values need range clamping the generic descriptor doesn't do.
fn float_env(name: &str, default: f64) -> f64 {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite())
        .unwrap_or(default)
}

/// Keep-fraction for fast, non-error transactions, clamped to `0.0..=1.0`.
pub fn sample_rate() -> f64 {
    float_env(EXTERNAL_TRACING_SAMPLE_RATE, DEFAULT_SAMPLE_RATE).clamp(0.0, 1.0)
}

/// Duration threshold in seconds; negative values are treated as 0 (keep everything).
pub fn min_sampled_duration_secs() -> f64 {
    float_env(
        SENTRY_MIN_SAMPLED_DURATION_SECS,
        DEFAULT_MIN_SAMPLED_DURATION_SECS,
    )
    .max(0.0)
}
