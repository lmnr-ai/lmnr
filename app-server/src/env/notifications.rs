//! Notification settings: alert throttling, Slack API endpoint.

use crate::env::{NumEnv, StringEnv};

/// Minimum gap between two signal-event notifications for the same alert.
/// Events that pass the alert gate while the per-alert lock is held are
/// dropped, so a noisy signal sends at most one notification per window.
pub const ALERT_SEND_LOCK_TTL_SECONDS: NumEnv<u64> = NumEnv::new("ALERT_SEND_LOCK_TTL_SECONDS", 30);

/// Base URL of the Slack Web API. Override to point deliveries at a stand-in
/// when testing them without a Slack workspace.
pub const SLACK_API_URL: StringEnv = StringEnv::new("SLACK_API_URL", "https://slack.com/api");
