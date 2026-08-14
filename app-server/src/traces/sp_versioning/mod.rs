//! System-prompt version tracking (v2 pipeline, `Feature::StaticSpV2`).
//!
//! Classification-only: detects an agent's system-prompt VERSIONS without
//! running any LLM. Agent identity is the first-sentence hash
//! (`lmnr.span.agent_hash`); within an agent, a per-project window of recent
//! distinct prompts is clustered line-wise (top-K Jaccard → ordered LCS
//! intersection) and the intersection hash is the version. Every resolved
//! span gets a `system_prompt_versions` ClickHouse row.
//!
//! Minting a new version registers it (registry + static line set) — and
//! nothing else. Derived artifacts (the static-part removal regexes, later
//! user-task regexes) are generated ON DEMAND: the first consumer that needs
//! them and finds the cache key absent publishes an extraction request (see
//! `static_sp_extraction::worker`), so LLM spend is proportional to versions
//! actually read, not versions minted. The regexes cache key being absent
//! means "not generated yet / generation failed" — readers fall back to the
//! raw prompt.

pub mod consumer;
pub mod producer;
pub mod similarity;
pub mod versions;
pub mod window;

pub const SP_VERSIONING_QUEUE: &str = "sp_versioning_queue";
pub const SP_VERSIONING_EXCHANGE: &str = "sp_versioning_exchange";
pub const SP_VERSIONING_ROUTING_KEY: &str = "sp_versioning_routing_key";

// Delay (park) queue for messages that can't resolve yet (cold-start window,
// mint in progress, transient error). No consumer — messages expire via
// their per-message TTL and dead-letter back into `SP_VERSIONING_EXCHANGE`.
// Every park uses the same TTL: RabbitMQ only expires at the queue HEAD, so
// a constant delay keeps expiry order equal to arrival order.
pub const SP_VERSIONING_DELAY_QUEUE: &str = "sp_versioning_delay_queue";
pub const SP_VERSIONING_DELAY_EXCHANGE: &str = "sp_versioning_delay_exchange";
pub const SP_VERSIONING_DELAY_ROUTING_KEY: &str = "sp_versioning_delay_routing_key";
