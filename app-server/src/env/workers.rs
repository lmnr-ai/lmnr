//! Per-queue worker pool sizes. All consumed in `main.rs` when spinning up the
//! consumer. Signal/clustering counts are only read in `signals`-feature
//! builds, hence `allow(dead_code)` for OSS.

use super::NumEnv;

pub const NUM_SPANS: NumEnv<u8> = NumEnv::new("NUM_SPANS_WORKERS", 4);
pub const NUM_DATA_PLANE_SPANS: NumEnv<usize> = NumEnv::new("NUM_DATA_PLANE_SPANS_WORKERS", 0);
pub const NUM_SPANS_INDEXER: NumEnv<u8> = NumEnv::new("NUM_SPANS_INDEXER_WORKERS", 4);
pub const NUM_BROWSER_EVENTS: NumEnv<u8> = NumEnv::new("NUM_BROWSER_EVENTS_WORKERS", 4);
pub const NUM_LOGS: NumEnv<u8> = NumEnv::new("NUM_LOGS_WORKERS", 4);
pub const NUM_REPORTS: NumEnv<u8> = NumEnv::new("NUM_REPORTS_WORKERS", 2);
pub const NUM_CHECKPOINTS: NumEnv<u8> = NumEnv::new("NUM_CHECKPOINTS_WORKERS", 2);

pub const NUM_NOTIFICATION: NumEnv<u8> = NumEnv::new("NUM_NOTIFICATION_WORKERS", 2);
pub const NUM_NOTIFICATION_DELIVERY: NumEnv<u8> =
    NumEnv::new("NUM_NOTIFICATION_DELIVERY_WORKERS", 2);

// Signals / clustering worker counts (read only under `feature = "signals"`).
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_SEMANTIC_EVENT: NumEnv<u8> = NumEnv::new("NUM_SEMANTIC_EVENT_WORKERS", 2);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_CLUSTERING_BATCHING: NumEnv<u8> = NumEnv::new("NUM_CLUSTERING_BATCHING_WORKERS", 2);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_CLUSTERING: NumEnv<u8> = NumEnv::new("NUM_CLUSTERING_WORKERS", 2);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_SIGNAL_JOB_SUBMISSION_BATCH: NumEnv<u8> =
    NumEnv::new("NUM_SIGNAL_JOB_SUBMISSION_BATCH_WORKERS", 4);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_SIGNAL_JOB_PENDING_BATCH: NumEnv<u8> =
    NumEnv::new("NUM_SIGNAL_JOB_PENDING_BATCH_WORKERS", 4);
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub const NUM_SIGNAL_JOB_REALTIME: NumEnv<usize> =
    NumEnv::new("NUM_SIGNAL_JOB_REALTIME_WORKERS", 4);

/// Cap on the backoff between worker connect retries (`worker/mod.rs`).
pub const CONNECT_BACKOFF_MAX_INTERVAL_SECS: NumEnv<u64> =
    NumEnv::new("WORKER_CONNECT_BACKOFF_MAX_INTERVAL_SECS", 10);
