//! Public-facing URLs used to build user-clickable links in notifications and
//! CLI auth. No static default (defaults are context-specific at the call
//! site), so bare names.

/// Frontend public URL — self-hosted instances point links at their own host.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";

/// Public URL of the user-scoped OAuth MCP resource. This exact value is used
/// as the OAuth access-token audience.
pub const LAMINAR_MCP_RESOURCE_URL: &str = "LAMINAR_MCP_RESOURCE_URL";

/// OAuth MCP is fail-closed unless both the public resource and authorization
/// server origins are configured. This prevents partial self-hosted upgrades
/// from advertising an authorization flow that cannot complete.
pub fn oauth_mcp_configured() -> bool {
    [LAMINAR_MCP_RESOURCE_URL, NEXT_PUBLIC_URL]
        .into_iter()
        .all(|key| std::env::var(key).is_ok_and(|value| !value.trim().is_empty()))
}
