pub mod attributes;
pub mod consumer;
mod evaluators;
pub mod events;
pub mod grpc_service;
mod index;
pub mod limits;
pub mod producer;
pub mod span_attributes;
pub mod spans;
mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";
