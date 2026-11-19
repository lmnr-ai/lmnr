//! HTTP / gRPC server ports, request payload limits, and the frontend URLs.

use super::NumEnv;

/// Frontend public URL — self-hosted instances point links at their own host.
/// No static default: it is context-specific at the call site, so a bare name.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";

/// Base URL for app-server → Next.js calls: `NEXT_INTERNAL_URL`, else `NEXT_PUBLIC_URL`.
pub fn next_server_url() -> Option<String> {
    std::env::var(NEXT_INTERNAL_URL)
        .or(std::env::var(NEXT_PUBLIC_URL))
        .ok()
        .map(|v| v.trim_end_matches('/').to_string())
}

/// Public URL of this server's MCP endpoint (e.g. `https://api.lmnr.ai/v1/mcp`). Setting it
/// enables OAuth user tokens on `/v1/mcp`; it is the access tokens' `aud` and must equal the
/// frontend's `MCP_RESOURCE_URL`. No default: unset keeps MCP project-API-key-only.
pub const MCP_RESOURCE_URL: &str = "MCP_RESOURCE_URL";
/// OAuth issuer that mints MCP access tokens. Defaults to `<NEXT_PUBLIC_URL origin>/api/auth`
/// (Better Auth's issuer), so it only needs setting when the frontend's public origin differs.
pub const MCP_AUTHORIZATION_SERVER_URL: &str = "MCP_AUTHORIZATION_SERVER_URL";

/// REST API port.
pub const PORT: NumEnv<u16> = NumEnv::new("PORT", 8000);
/// gRPC ingestion port.
pub const GRPC_PORT: NumEnv<u16> = NumEnv::new("GRPC_PORT", 8001);
/// Realtime SSE / consumer port. Usually distinct from HTTP and gRPC so
/// producer and consumer can share a host in dual mode.
pub const CONSUMER_PORT: NumEnv<u16> = NumEnv::new("CONSUMER_PORT", 8002);

/// Max HTTP request payload in bytes. Default 5 MB.
pub const HTTP_PAYLOAD_LIMIT: NumEnv<usize> = NumEnv::new("HTTP_PAYLOAD_LIMIT", 5_242_880);
/// Max gRPC request payload in bytes. Default 25 MB.
pub const GRPC_PAYLOAD_LIMIT: NumEnv<usize> = NumEnv::new("GRPC_PAYLOAD_LIMIT", 26_214_400);

/// How long queue/stream consumers get after SIGTERM to finish an in-flight
/// message or flush and commit its ack/offset. Keep it under the pod's
/// `terminationGracePeriodSeconds` (k8s default 30s) so the drain completes
/// before SIGKILL.
pub const GRACEFUL_SHUTDOWN_TIMEOUT_MS: NumEnv<u64> =
    NumEnv::new("GRACEFUL_SHUTDOWN_TIMEOUT_MS", 20_000);
