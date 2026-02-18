pub mod consumer;
pub mod data_plane_consumer;
pub mod grpc_service;
pub mod processor;
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

pub const SPANS_DATA_PLANE_QUEUE: &str = "spans_data_plane_queue";
pub const SPANS_DATA_PLANE_EXCHANGE: &str = "spans_data_plane_exchange";
pub const SPANS_DATA_PLANE_ROUTING_KEY: &str = "spans_data_plane_routing_key";
