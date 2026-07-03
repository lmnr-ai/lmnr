//! Static system prompt extraction agent (LAM-1898, step 1).
//!
//! Given N example system prompts from the same template family, an LLM agent
//! hypothesizes and verifies (via the harness-side `regex` tool) an ordered
//! list of removal regexes that strip every dynamically-injected span, so all
//! examples collapse to the same static skeleton. Isolated module — not wired
//! into the ingest pipeline yet.
#![allow(dead_code)]

pub mod agent;
pub mod diff;
pub mod prompt;
pub mod tool;

pub use agent::{ExtractionConfig, extract_static_regexes};
pub use tool::run_regex_tool;
