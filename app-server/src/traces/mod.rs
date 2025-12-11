pub mod clustering;
pub mod consumer;
pub mod events;
pub mod grpc_service;
pub mod limits;
pub mod producer;
pub mod provider;
pub mod realtime;
pub mod semantic_events;
pub mod span_attributes;
pub mod spans;
pub mod trigger;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

pub const SEMANTIC_EVENT_QUEUE: &str = "semantic_event_queue";
pub const SEMANTIC_EVENT_EXCHANGE: &str = "semantic_event_exchange";
pub const SEMANTIC_EVENT_ROUTING_KEY: &str = "semantic_event_routing_key";

pub const EVENT_CLUSTERING_QUEUE: &str = "event_clustering_queue";
pub const EVENT_CLUSTERING_EXCHANGE: &str = "event_clustering_exchange";
pub const EVENT_CLUSTERING_ROUTING_KEY: &str = "event_clustering_routing_key";

#[derive(Clone)]
pub struct IngestedBytes {
    pub span_bytes: usize,
}
