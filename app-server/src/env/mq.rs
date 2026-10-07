//! RabbitMQ connection + channel tuning.

use super::{BoolEnv, NumEnv};

/// RabbitMQ connection URL. Required when the RabbitMQ feature is on.
pub const URL: &str = "RABBITMQ_URL";
/// Whether to enable lapin's auto-recover on the connection.
pub const AUTO_RECONNECT: BoolEnv = BoolEnv::new("RABBITMQ_AUTO_RECONNECT", false);

pub const MAX_CHANNEL_POOL_SIZE: NumEnv<usize> = NumEnv::new("RABBITMQ_MAX_CHANNEL_POOL_SIZE", 64);
/// Max message payload in bytes. Default 50 MB.
pub const MAX_PAYLOAD: NumEnv<usize> = NumEnv::new("RABBITMQ_MAX_PAYLOAD", 52_428_800);
/// Whole-chain timeout for consumer setup (`mq/rabbit.rs`).
pub const CONSUMER_SETUP_TIMEOUT_SECS: NumEnv<u64> =
    NumEnv::new("RABBITMQ_CONSUMER_SETUP_TIMEOUT_SECS", 60);
