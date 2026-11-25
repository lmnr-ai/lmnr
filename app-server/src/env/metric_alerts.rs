//! Metric alert scheduler settings.

use crate::env::NumEnv;

/// A check measures the window that ended this many minutes ago, so spans
/// that ended inside it have had time to reach ClickHouse.
pub const METRIC_ALERTS_SETTLE_MINUTES: NumEnv<i64> =
    NumEnv::new("METRIC_ALERTS_SETTLE_MINUTES", 2);

/// How far span storage may trail span intake before ingestion counts as
/// behind. While it is, checks that would fire or resolve on a low value are
/// skipped.
pub const METRIC_ALERTS_INGESTION_LAG_SECONDS: NumEnv<i64> =
    NumEnv::new("METRIC_ALERTS_INGESTION_LAG_SECONDS", 60);
