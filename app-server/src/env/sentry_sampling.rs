//! Tunables for duration/status-aware Sentry transaction sampling.

use super::NumEnv;

/// Fraction of fast, non-error transactions kept. Errors and slow transactions
/// bypass this entirely. Read via [`sample_rate`], which clamps to `0.0..=1.0` —
/// `rand::random_bool` PANICS outside that range.
pub const SAMPLE_RATE: NumEnv<f64> = NumEnv::new("EXTERNAL_TRACING_SAMPLE_RATE", 0.2);

/// Duration (seconds) at or above which a transaction is always kept. Read via
/// [`min_sampled_duration_secs`], which clamps negatives away.
pub const MIN_SAMPLED_DURATION_SECS: NumEnv<f64> =
    NumEnv::new("SENTRY_MIN_SAMPLED_DURATION_SECS", 5.0);

/// Keep-fraction for fast, non-error transactions, clamped to `0.0..=1.0`.
pub fn sample_rate() -> f64 {
    SAMPLE_RATE.clamp(0.0, 1.0)
}

/// Duration threshold in seconds; a negative value clamps to 0 (keep everything).
pub fn min_sampled_duration_secs() -> f64 {
    MIN_SAMPLED_DURATION_SECS.clamp(0.0, f64::MAX)
}
