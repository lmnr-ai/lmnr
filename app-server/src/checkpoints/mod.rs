pub mod consumer;
pub mod subagent;
pub mod system_prompt;
pub mod version;

pub const CHECKPOINTS_QUEUE: &str = "checkpoints_queue";
pub const CHECKPOINTS_EXCHANGE: &str = "checkpoints_exchange";
pub const CHECKPOINTS_ROUTING_KEY: &str = "checkpoints_routing_key";
