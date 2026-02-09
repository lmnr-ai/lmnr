pub mod consumer;
pub mod grpc_service;
pub mod limits;
pub mod producer;
pub mod provider;
pub mod realtime;
pub mod span_attributes;
pub mod spans;
pub mod trigger;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";
