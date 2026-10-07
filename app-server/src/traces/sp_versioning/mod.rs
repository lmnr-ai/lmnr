//! LLM-free version tracking for two kinds of text (see [`kind::VersionKind`]):
//! system prompts and the user-message templates of winning LLM spans.
//!
//! Classification-only: within an agent (first-sentence hash of the system
//! prompt, `lmnr.span.agent_hash`), a per-project window of recent distinct
//! texts is clustered line-wise (top-K Jaccard → ordered LCS intersection) and
//! the intersection hash is the version. An empty intersection is a version
//! too: the text is fully dynamic. Every resolved span gets a row in the kind's
//! versions table.
//!
//! Minting a new version registers it (registry + static line set) — and
//! nothing else. Derived artifacts (the system prompt's static-part removal
//! regexes, user-task extraction regexes) are generated ON DEMAND by the
//! features that read them, so LLM spend is proportional to versions actually
//! read, not versions minted.

pub mod consumer;
pub mod kind;
pub mod producer;
pub mod similarity;
pub mod versions;
pub mod window;

pub use kind::VersionKind;

pub const SP_VERSIONING_QUEUE: &str = "sp_versioning_queue";
pub const SP_VERSIONING_EXCHANGE: &str = "sp_versioning_exchange";
pub const SP_VERSIONING_ROUTING_KEY: &str = "sp_versioning_routing_key";

pub const USER_TEMPLATE_VERSIONING_QUEUE: &str = "user_template_versioning_queue";
pub const USER_TEMPLATE_VERSIONING_EXCHANGE: &str = "user_template_versioning_exchange";
pub const USER_TEMPLATE_VERSIONING_ROUTING_KEY: &str = "user_template_versioning_routing_key";

// Delay (park) queues for messages that can't resolve yet (cold-start window,
// mint in progress, transient error). No consumer — messages expire via their
// per-message TTL and dead-letter back into their kind's main exchange. Every
// park uses the same TTL: RabbitMQ only expires at the queue HEAD, so a
// constant delay keeps expiry order equal to arrival order.
pub const SP_VERSIONING_DELAY_QUEUE: &str = "sp_versioning_delay_queue";
pub const SP_VERSIONING_DELAY_EXCHANGE: &str = "sp_versioning_delay_exchange";
pub const SP_VERSIONING_DELAY_ROUTING_KEY: &str = "sp_versioning_delay_routing_key";

pub const USER_TEMPLATE_VERSIONING_DELAY_QUEUE: &str = "user_template_versioning_delay_queue";
pub const USER_TEMPLATE_VERSIONING_DELAY_EXCHANGE: &str = "user_template_versioning_delay_exchange";
pub const USER_TEMPLATE_VERSIONING_DELAY_ROUTING_KEY: &str =
    "user_template_versioning_delay_routing_key";
