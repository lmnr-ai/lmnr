//! Tunables for agent versioning (`src/agent_versioning`).

use super::BoolEnv;

/// Master switch. When false, the ingest producer publishes no agent calls,
/// the agent-call workers do not start and the detection job does not run.
/// Disabled by default.
pub const ENABLED: BoolEnv = BoolEnv::new("AGENT_VERSIONING_ENABLED", false);
