//! HTTP / gRPC server ports and request payload limits.

use super::NumEnv;

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
