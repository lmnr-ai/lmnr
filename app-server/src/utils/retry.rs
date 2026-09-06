//! Exponential-backoff builders for `backon`.
//!
//! `ExponentialBuilder::default()` is jitter-OFF, capped at 3 retries, and has
//! no wall-clock budget. All three fail open — into a thundering herd or a
//! silently truncated retry loop — so retry sites build from one of these
//! constructors rather than from `default()`.

use std::time::Duration;

use backon::ExponentialBuilder;

/// `backoff`'s default multiplier, which every call site inherited before the
/// move to `backon` (whose default is 2.0).
const DEFAULT_FACTOR: f32 = 1.5;

/// Jitter decorrelates retries across pods hammering one sick dependency.
/// `backon` jitters UP only (`[d, 2d)`) and applies it AFTER the `max_delay`
/// clamp, so a realized sleep can reach `2 * max_delay`.
fn base(min_delay: Duration, max_delay: Duration) -> ExponentialBuilder {
    ExponentialBuilder::default()
        .with_jitter()
        .with_factor(DEFAULT_FACTOR)
        .with_min_delay(min_delay)
        .with_max_delay(max_delay)
}

/// Retries bounded by a budget on the SUM OF SLEEPS.
///
/// NOT `backoff`'s `max_elapsed_time`, which measured wall clock including time
/// spent inside the operation; this excludes it. Only for operations that are
/// fast relative to `total_delay` — for slow ones (LLM calls) use
/// [`bounded_attempts`], which can't drift.
pub fn bounded_delay(
    min_delay: Duration,
    max_delay: Duration,
    total_delay: Duration,
) -> ExponentialBuilder {
    base(min_delay, max_delay)
        .without_max_times()
        .with_total_delay(Some(total_delay))
}

/// Retries bounded by attempt count; `retries` excludes the initial attempt, so
/// the operation runs at most `retries + 1` times.
///
/// The only bound that is deterministic under `#[tokio::test(start_paused)]`.
pub fn bounded_attempts(
    min_delay: Duration,
    max_delay: Duration,
    retries: usize,
) -> ExponentialBuilder {
    base(min_delay, max_delay).with_max_times(retries)
}

/// Retries forever, for supervisors whose only correct outcome is eventual
/// success — giving up means data loss or a wedged process, not a failed request.
pub fn unbounded(min_delay: Duration, max_delay: Duration) -> ExponentialBuilder {
    base(min_delay, max_delay).without_max_times()
}

#[cfg(test)]
mod tests {
    use backon::BackoffBuilder;

    use super::*;

    /// The regression these constructors exist for: `ExponentialBuilder`'s
    /// `max_times: Some(3)` default silently truncates a budgeted or unbounded
    /// retry loop to four attempts.
    #[test]
    fn budgeted_and_unbounded_builders_drop_the_default_attempt_cap() {
        let budgeted = bounded_delay(
            Duration::from_millis(1),
            Duration::from_millis(10),
            Duration::from_secs(60),
        );
        assert!(
            budgeted.build().take(100).count() > 3,
            "total_delay budget must outlive the default 3-retry cap"
        );

        let unbounded = unbounded(Duration::from_millis(1), Duration::from_millis(10));
        assert_eq!(unbounded.build().take(10_000).count(), 10_000);
    }

    #[test]
    fn bounded_attempts_yields_exactly_that_many_retries() {
        let builder = bounded_attempts(Duration::from_millis(1), Duration::from_millis(10), 5);
        assert_eq!(builder.build().count(), 5);
    }

    /// Jitter is what keeps a fleet from retrying in lockstep, and it is off by
    /// default in `backon`.
    #[test]
    fn jitter_is_enabled() {
        let builder = bounded_attempts(Duration::from_secs(1), Duration::from_secs(1), 200);
        // Without jitter every delay would be exactly `min_delay`.
        assert!(
            builder
                .build()
                .any(|delay| delay > Duration::from_millis(1050)),
            "delays are not jittered"
        );
    }

    /// `bounded_delay` stops once the accumulated sleep would exceed the budget.
    #[test]
    fn bounded_delay_stops_on_its_budget() {
        let total: Duration = bounded_delay(
            Duration::from_secs(1),
            Duration::from_secs(10),
            Duration::from_secs(30),
        )
        .build()
        .sum();
        assert!(total <= Duration::from_secs(30));
    }
}
