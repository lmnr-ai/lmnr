//! Static system prompt extraction.
//!
//! Given N example system prompts from the same template family, an LLM agent
//! hypothesizes and verifies (via the harness-side `regex` tool) an ordered
//! list of removal regexes that strip every dynamically-injected span, so all
//! examples collapse to the same static skeleton. Runnable on demand via
//! `routes::system_extraction`, and wired into the ingest pipeline:
//!
//! Every incoming LLM span already carries a "naive signature" — the skeleton
//! hash stored under `lmnr.span.prompt_hash`. Same hash usually means same
//! agent, but the raw system prompt still contains dynamic fragments (dates,
//! user info, ids). The ingest producer checks the static-regex cache for the
//! span's signature; on a miss it publishes the system prompt to the
//! static-prompt queue. The consumer accumulates prompts per signature and,
//! once enough samples exist, runs the extraction agent under a per-signature
//! lock and caches the resulting regex list.

use uuid::Uuid;

use crate::cache::keys::{
    STATIC_PROMPT_ACCUMULATOR_CACHE_KEY, STATIC_PROMPT_LOCK_CACHE_KEY,
    STATIC_PROMPT_REGEX_CACHE_KEY,
};

pub mod agent;
pub mod consumer;
pub mod diff;
pub mod producer;
pub mod prompt;
pub mod tool;

pub use agent::{ExtractionConfig, ExtractionResult, ExtractionTracing, extract_static_regexes};

pub const STATIC_PROMPT_QUEUE: &str = "static_prompt_queue";
pub const STATIC_PROMPT_EXCHANGE: &str = "static_prompt_exchange";
pub const STATIC_PROMPT_ROUTING_KEY: &str = "static_prompt_routing_key";

/// `naive_signature → Vec<regex>` for static-part extraction.
pub fn static_regex_cache_key(project_id: Uuid, prompt_hash: &str) -> String {
    format!("{STATIC_PROMPT_REGEX_CACHE_KEY}:{project_id}:{prompt_hash}")
}

/// `naive_signature → Vec<system_prompt>` samples awaiting extraction.
pub fn accumulator_cache_key(project_id: Uuid, prompt_hash: &str) -> String {
    format!("{STATIC_PROMPT_ACCUMULATOR_CACHE_KEY}:{project_id}:{prompt_hash}")
}

/// Per-signature lock serializing the extraction-agent trigger.
pub fn extraction_lock_cache_key(project_id: Uuid, prompt_hash: &str) -> String {
    format!("{STATIC_PROMPT_LOCK_CACHE_KEY}:{project_id}:{prompt_hash}")
}
