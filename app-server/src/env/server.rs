//! HTTP / gRPC server ports, request payload limits, and the frontend URLs.

use super::NumEnv;

/// Frontend public URL — self-hosted instances point links at their own host.
/// No static default: it is context-specific at the call site, so a bare name.
pub const NEXT_PUBLIC_URL: &str = "NEXT_PUBLIC_URL";
/// Internal URL preferred over the public one for server-to-server calls
/// (e.g. the CLI-auth JWKS fetch).
pub const NEXT_INTERNAL_URL: &str = "NEXT_INTERNAL_URL";

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
