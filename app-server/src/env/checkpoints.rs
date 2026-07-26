//! Tunables for the checkpoints / agent-versioning pipeline (`src/checkpoints`).

use super::{BoolEnv, NumEnv};

/// Master switch for the checkpoints (agent versions) pipeline. When false,
/// the spans consumer publishes no checkpoint messages and the checkpoints
/// workers are not spawned. Disabled by default (LAM-1987).
pub const ENABLED: BoolEnv = BoolEnv::new("CHECKPOINTS_ENABLED", false);

/// How many recent versions PER AGENT the classifier compares an unknown shape
/// against. Above 1, concurrently-live variants of one agent (A/B tests,
/// subversions) stay visible even though they aren't the newest row.
pub const CLASSIFY_VERSIONS_PER_AGENT: NumEnv<i64> =
    NumEnv::new("CHECKPOINTS_CLASSIFY_VERSIONS_PER_AGENT", 5);

/// Overall cap on the versions fed to one classification, bounding both the
/// Postgres read and the classifier's LLM context. Truncation drops an agent's
/// extra versions before dropping any agent, so every agent stays comparable.
pub const CLASSIFY_MAX_VERSIONS: NumEnv<i64> = NumEnv::new("CHECKPOINTS_CLASSIFY_MAX_VERSIONS", 100);
