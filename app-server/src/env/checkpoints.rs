//! Tunables for the checkpoints / agent-versioning pipeline (`src/checkpoints`).

use super::BoolEnv;

/// Master switch for the checkpoints (agent versions) pipeline. When false,
/// the ingest producer attaches no agent-versioning inputs to system-prompt
/// versioning messages and their consumer records nothing. Enabled by default.
pub const ENABLED: BoolEnv = BoolEnv::new("CHECKPOINTS_ENABLED", true);
