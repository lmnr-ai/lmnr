//! Sentry span sampling.

use super::NumEnv;

/// Fraction of transactions (and therefore spans) sent to Sentry. `f32` to match
/// `ClientOptions::traces_sample_rate`. Read via [`sample_rate`], which clamps to
/// `0.0..=1.0`.
pub const SAMPLE_RATE: NumEnv<f32> = NumEnv::new("EXTERNAL_TRACING_SAMPLE_RATE", 0.2);

/// Keep-fraction for transactions, clamped to `0.0..=1.0`.
pub fn sample_rate() -> f32 {
    SAMPLE_RATE.clamp(0.0, 1.0)
}
