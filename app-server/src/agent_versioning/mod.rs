//! Agent versioning.
//!
//! An agent is an `agent_hash`. Ingest stores each production LLM span's
//! agent prompt (system prompt plus tool definitions) as a set of masked line
//! hashes in `agent_prompts`. A scheduled job per agent ([`job`]) samples one
//! prompt per trace, finds sharp line flips ([`inferred::timeline`]), mints a
//! version per new stable core (the lines in every prompt after the flip), and
//! tags every trace with its version in `traces_agg.agent_versions`. The
//! consumer creates and names an agent on its first prompt ([`registry`]).
//!
//! Once most prompts carry the SDK's release (a git SHA), the agent switches
//! to release mode for good: versions group releases instead of flips
//! ([`releases`]), and ingest tags traces of decided releases directly.

use std::sync::Arc;

use crate::{cache::Cache, db::DB, llm::LlmClient};

mod inferred;
pub mod ingest;
mod job;
pub mod naming;
pub mod normalize;
pub mod registry;
mod releases;
mod versions;

const NS: i64 = 1_000_000_000;
/// Async inserts become readable shortly after `ingested_at`; reading only up
/// to this far behind now keeps a row from being skipped before it is visible.
const VISIBILITY_LAG_NS: i64 = 2 * 60 * NS;

/// The scheduled versioning job ([`job`]); each path and the shared steps
/// add their methods in their own module.
pub struct Job {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Option<Arc<LlmClient>>,
}
