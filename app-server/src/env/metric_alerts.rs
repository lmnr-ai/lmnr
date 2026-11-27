//! Metric alert scheduler settings.

use crate::env::NumEnv;

/// A check measures the window that ended this many minutes ago, so spans
/// that ended inside it have had time to reach ClickHouse.
pub const METRIC_ALERTS_SETTLE_MINUTES: NumEnv<i64> =
    NumEnv::new("METRIC_ALERTS_SETTLE_MINUTES", 2);
