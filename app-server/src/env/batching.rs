//! Batch-worker flush sizes and intervals.

use super::NumEnv;

pub const SPANS_SIZE: NumEnv<usize> = NumEnv::new("SPANS_BATCH_SIZE", 128);
pub const SPANS_FLUSH_INTERVAL_MS: NumEnv<u64> = NumEnv::new("SPANS_BATCH_FLUSH_INTERVAL_MS", 500);

pub const DATA_PLANE_SPANS_SIZE: NumEnv<usize> = NumEnv::new("DATA_PLANE_SPANS_BATCH_SIZE", 256);
pub const DATA_PLANE_SPANS_FLUSH_INTERVAL_MS: NumEnv<u64> =
    NumEnv::new("DATA_PLANE_SPANS_BATCH_FLUSH_INTERVAL_MS", 500);

pub const BROWSER_EVENTS_SIZE: NumEnv<usize> = NumEnv::new("BROWSER_EVENTS_BATCH_SIZE", 1024);
pub const BROWSER_EVENTS_FLUSH_INTERVAL_SEC: NumEnv<u64> =
    NumEnv::new("BROWSER_EVENTS_BATCH_FLUSH_INTERVAL_SEC", 1);

// Signals / clustering batching (read only under `feature = "signals"`).
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const CLUSTERING_EVENTS_SIZE: NumEnv<usize> = NumEnv::new("CLUSTERING_EVENTS_BATCH_SIZE", 100);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const CLUSTERING_EVENTS_FLUSH_INTERVAL_SEC: NumEnv<u64> =
    NumEnv::new("CLUSTERING_EVENTS_BATCH_FLUSH_INTERVAL_SEC", 300);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNALS_FLUSH_INTERVAL_SEC: NumEnv<u64> =
    NumEnv::new("SIGNALS_BATCH_FLUSH_INTERVAL_SEC", 300);

/// `SIGNALS_BATCH_SIZE` has no static default — it falls back to a
/// crate constant (`signals::private::queue::DEFAULT_BATCH_SIZE`) only
/// available in `signals`-feature builds, so just expose the name here.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const SIGNALS_SIZE: &str = "SIGNALS_BATCH_SIZE";
