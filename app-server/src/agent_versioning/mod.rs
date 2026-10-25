//! Agent versioning.
//!
//! An agent is an `agent_hash`. Ingest stores each production LLM span's
//! agent prompt (system prompt plus tool definitions) as a set of masked line
//! hashes in `agent_prompts`. A scheduled job per agent ([`job`]) samples one
//! prompt per trace, finds sharp line flips ([`timeline`]), mints a version per
//! new stable core (the lines in every prompt after the flip), and tags every
//! trace with its version in `traces_agg.agent_versions`. The consumer creates
//! and names an agent on its first prompt ([`registry`]).
//!
//! Once most prompts carry the SDK's release (a git SHA), the agent switches
//! to release mode for good: versions group releases instead of flips
//! ([`releases`]), and ingest tags traces of decided releases directly.

pub mod compare;
mod inferred;
pub mod ingest;
pub mod job;
pub mod naming;
pub mod normalize;
pub mod registry;
mod releases;
pub mod timeline;
