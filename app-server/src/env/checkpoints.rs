//! Tunables for the checkpoints / agent-versioning pipeline (`src/checkpoints`).

use super::BoolEnv;

/// Master switch for the checkpoints (agent versions) pipeline. When false,
/// the ingest producer attaches no agent-versioning inputs to system-prompt
/// versioning messages, tool-definition versioning workers do not start, and
/// nothing is recorded. Disabled by default.
pub const ENABLED: BoolEnv = BoolEnv::new("CHECKPOINTS_ENABLED", false);
