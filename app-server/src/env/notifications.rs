//! Notification delivery settings. The public-facing URLs used to build
//! user-clickable links in notifications and CLI auth have no static default
//! (defaults are context-specific at the call site), so they are bare names.

use super::StringEnv;

/// Frontend public URL — self-hosted instances point links at their own host.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";

/// Resend template (id or alias) for the signal empty-trace warning email. It
/// lives in the Resend account behind `RESEND_API_KEY`, so a self-hosted
/// deployment sending through its own account must create a template with the
/// same variables and point this at it.
pub const RESEND_SIGNAL_EMPTY_TRACE_TEMPLATE: StringEnv =
    StringEnv::new("RESEND_SIGNAL_EMPTY_TRACE_TEMPLATE", "signal-empty-trace");
