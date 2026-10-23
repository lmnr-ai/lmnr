//! Agent versioning.
//!
//! An agent is an `agent_hash`. Ingest stores each production LLM span's
//! agent prompt (system prompt plus tool definitions) as a set of masked line
//! hashes in `agent_prompts`. A scheduled job per agent ([`job`]) samples one
//! prompt per trace, finds sharp line flips ([`timeline`]), mints a version per
//! new stable core (the lines in every prompt after the flip), and tags every
//! trace with its version in `traces_agg.agent_versions`.

pub mod ingest;
pub mod job;
pub mod naming;
pub mod normalize;
pub mod timeline;
