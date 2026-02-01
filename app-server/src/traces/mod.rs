pub mod clustering;
pub mod consumer;
pub mod events;
pub mod grpc_service;
pub mod limits;
pub mod producer;
pub mod provider;
pub mod realtime;
pub mod signals;
pub mod span_attributes;
pub mod spans;
pub mod trigger;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

// don't change these queue names for backward compatibility
pub const SIGNALS_QUEUE: &str = "semantic_event_queue";
pub const SIGNALS_EXCHANGE: &str = "semantic_event_exchange";
pub const SIGNALS_ROUTING_KEY: &str = "semantic_event_routing_key";

#[derive(Clone)]
pub struct IngestedBytes {
    pub span_bytes: usize,
}
