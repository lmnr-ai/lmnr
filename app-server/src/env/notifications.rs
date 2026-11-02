//! Notification settings: alert throttling.

use crate::env::NumEnv;

/// Minimum gap between two signal-event notifications for the same alert.
/// Events that pass the alert gate while the per-alert lock is held are
/// dropped, so a noisy signal sends at most one notification per window.
pub const ALERT_SEND_LOCK_TTL_SECONDS: NumEnv<u64> = NumEnv::new("ALERT_SEND_LOCK_TTL_SECONDS", 30);
