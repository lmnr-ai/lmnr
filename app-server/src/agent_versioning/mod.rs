//! Agent versioning: an agent's version is the set of system prompt and tool
//! lines present in every one of its traces, and it changes only when a line
//! flips (see [`detector`]).
//!
//! Ingestion publishes one [`producer::AgentCall`] per LLM span with a system
//! prompt; [`consumer`] stores them in ClickHouse, and [`job`] periodically
//! runs the detector per agent, labelling traces in ClickHouse and keeping
//! versions and their timeline in Postgres.
//!
//! Independent of `traces::sp_versioning`: it reuses only system message
//! extraction, the agent hash and tool normalization.

pub mod consumer;
pub mod detector;
pub mod document;
pub mod job;
pub mod naming;
pub mod producer;

#[cfg(test)]
mod replay;
#[cfg(test)]
mod simulation;

pub const AGENT_VERSIONING_QUEUE: &str = "agent_versioning_queue";
pub const AGENT_VERSIONING_EXCHANGE: &str = "agent_versioning_exchange";
pub const AGENT_VERSIONING_ROUTING_KEY: &str = "agent_versioning_routing_key";
