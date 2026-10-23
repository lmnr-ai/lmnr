//! Agent versioning ("checkpoints").
//!
//! Runs inline in the system-prompt and tool-definition versioning consumers,
//! right after a batch's spans get their version of that kind. An agent is an
//! `agent_hash`; a version is a (system-prompt version, tool-definition
//! version) pair; models are a set per version. Every versioned span also
//! tags its trace with `(agent_hash, version_hash, model)` in
//! `traces_agg.agent_versions`.

mod recorder;
mod version;

pub use recorder::{AgentSpan, CheckpointRecorder};
