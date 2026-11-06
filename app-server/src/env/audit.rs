//! Workspace audit log (`src/audit/`).

use super::{BoolEnv, NumEnv};

/// Emit audit events. On by default; the queue and consumer run regardless.
pub const ENABLED: BoolEnv = BoolEnv::new("AUDIT_LOG_ENABLED", true);

pub const NUM_WORKERS: NumEnv<usize> = NumEnv::new("NUM_AUDIT_WORKERS", 1);
pub const BATCH_SIZE: NumEnv<usize> = NumEnv::new("AUDIT_BATCH_SIZE", 512);
pub const FLUSH_INTERVAL_MS: NumEnv<u64> = NumEnv::new("AUDIT_BATCH_FLUSH_INTERVAL_MS", 1000);
