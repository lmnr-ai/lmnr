pub mod consumer;
pub mod events;
pub mod grpc_service;
pub mod limits;
pub mod producer;
pub mod provider;
pub mod span_attributes;
pub mod spans;
pub mod summary;
pub mod trigger;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

pub const TRACE_SUMMARY_QUEUE: &str = "trace_summary_queue";
pub const TRACE_SUMMARY_EXCHANGE: &str = "trace_summary_exchange";
pub const TRACE_SUMMARY_ROUTING_KEY: &str = "trace_summary_routing_key";

#[derive(Clone)]
pub struct IngestedBytes {
    pub span_bytes: usize,
}
