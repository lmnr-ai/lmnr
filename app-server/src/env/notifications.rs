//! Public-facing URLs used to build user-clickable links in notifications and
//! CLI auth. No static default (defaults are context-specific at the call
//! site), so bare names.

/// Frontend public URL — self-hosted instances point links at their own host.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";
