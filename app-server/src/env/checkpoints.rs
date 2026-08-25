//! Tunables for the checkpoints / agent-versioning pipeline (`src/checkpoints`).

use super::BoolEnv;

/// Master switch for the checkpoints (agent versions) pipeline. When false,
/// the spans consumer publishes no checkpoint messages and the checkpoints
/// workers are not spawned. Disabled by default (LAM-1987).
pub const ENABLED: BoolEnv = BoolEnv::new("CHECKPOINTS_ENABLED", false);
