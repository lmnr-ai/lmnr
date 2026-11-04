//! RabbitMQ connection + channel tuning.

use super::NumEnv;

/// RabbitMQ connection URL. Required when the RabbitMQ feature is on.
pub const URL: &str = "RABBITMQ_URL";

pub const MAX_CHANNEL_POOL_SIZE: NumEnv<usize> = NumEnv::new("RABBITMQ_MAX_CHANNEL_POOL_SIZE", 64);
/// Max message payload in bytes. Default 50 MB.
pub const MAX_PAYLOAD: NumEnv<usize> = NumEnv::new("RABBITMQ_MAX_PAYLOAD", 52_428_800);
/// Whole-chain timeout for consumer setup (`mq/rabbitmq/mod.rs`).
pub const CONSUMER_SETUP_TIMEOUT_SECS: NumEnv<u64> =
    NumEnv::new("RABBITMQ_CONSUMER_SETUP_TIMEOUT_SECS", 60);
/// How many consumer setups may run against one connection at once. Low on
/// purpose: after a reconnect every worker rebuilds its channel, and a broker
/// that just came back is better served one queue at a time than all at once.
pub const CONSUMER_SETUP_CONCURRENCY: NumEnv<usize> =
    NumEnv::new("RABBITMQ_CONSUMER_SETUP_CONCURRENCY", 2);
/// Consecutive consumer-setup timeouts after which a connection that still
/// reports `Connected` is treated as wedged and replaced (`mq/rabbitmq/connection.rs`).
pub const SETUP_TIMEOUTS_BEFORE_RECONNECT: NumEnv<u32> =
    NumEnv::new("RABBITMQ_SETUP_TIMEOUTS_BEFORE_RECONNECT", 5);
