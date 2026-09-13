//! HTTP / gRPC server ports, request payload limits, and the shutdown budget.

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

/// How long a SIGTERM'd process waits for stream readers and queue workers to
/// finish the flush they are in (and the offset store / ack that records it)
/// before it exits anyway — see `runtime::shutdown`.
///
/// Must fit inside the pod's `terminationGracePeriodSeconds` MINUS the `preStop`
/// delay, or the kubelet SIGKILLs us mid-flush and the drain buys nothing. It is
/// spent only on work already in flight, so a value near the p99 flush duration
/// is enough; the ceiling exists because transient flush retries are unbounded by
/// design.
pub const SHUTDOWN_DRAIN_TIMEOUT_SECS: NumEnv<u64> = NumEnv::new("SHUTDOWN_DRAIN_TIMEOUT_SECS", 25);
