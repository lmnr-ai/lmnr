//! Notification settings: public-facing URLs used to build user-clickable links
//! in notifications and CLI auth (no static default — defaults are
//! context-specific at the call site, so bare names), and alert throttling.

use crate::env::NumEnv;

/// Frontend public URL — self-hosted instances point links at their own host.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";

/// Minimum gap between two signal-event notifications for the same alert.
/// Events that pass the alert gate while the per-alert lock is held are
/// dropped, so a noisy signal sends at most one notification per window.
pub const ALERT_SEND_LOCK_TTL_SECONDS: NumEnv<u64> = NumEnv::new("ALERT_SEND_LOCK_TTL_SECONDS", 30);
