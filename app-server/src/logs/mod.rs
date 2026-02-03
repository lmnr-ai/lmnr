pub mod consumer;
pub mod grpc_service;
pub mod producer;

pub const LOGS_QUEUE: &str = "logs_queue";
pub const LOGS_EXCHANGE: &str = "logs_exchange";
pub const LOGS_ROUTING_KEY: &str = "logs_routing_key";
