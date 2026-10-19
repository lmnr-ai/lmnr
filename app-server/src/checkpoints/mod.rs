//! Agent versioning ("checkpoints").
//!
//! Runs inline in the system-prompt versioning consumer, right after a batch's
//! spans get their system-prompt version. An agent is an `agent_hash`; a
//! version is a (system-prompt version, tool set) pair; models are a set per
//! version. Every versioned span also tags its trace with
//! `(agent_hash, version_hash, model)` in `traces_agg.agent_versions`.

mod naming;
mod recorder;
mod version;

pub use recorder::{AgentSpan, CheckpointRecorder};
