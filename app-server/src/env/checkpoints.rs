//! Tunables for the checkpoints / agent-versioning pipeline (`src/checkpoints`).

use super::{BoolEnv, NumEnv};

/// Master switch for the checkpoints (agent versions) pipeline. When false,
/// the spans consumer publishes no checkpoint messages and the checkpoints
/// workers are not spawned. Disabled by default (LAM-1987).
pub const ENABLED: BoolEnv = BoolEnv::new("CHECKPOINTS_ENABLED", false);

/// How many recent versions PER AGENT the classifier compares an unknown shape
/// against. Above 1, concurrently-live variants of one agent (A/B tests,
/// subversions) stay visible even though they aren't the newest row.
const CLASSIFY_VERSIONS_PER_AGENT: NumEnv<i64> =
    NumEnv::new("CHECKPOINTS_CLASSIFY_VERSIONS_PER_AGENT", 5);

/// Cap on the *extra* (non-newest) versions fed to one classification, bounding
/// the classifier's LLM context. Every agent's newest version is always included
/// on top of this, so raising or lowering it can never hide an agent.
const CLASSIFY_MAX_EXTRA_VERSIONS: NumEnv<i64> =
    NumEnv::new("CHECKPOINTS_CLASSIFY_MAX_EXTRA_VERSIONS", 100);

/// At least 1 — a `0`/negative override would otherwise be read as "no versions
/// per agent". The query still returns every agent's newest version regardless,
/// so clamping only keeps the value's meaning honest.
pub fn classify_versions_per_agent() -> i64 {
    CLASSIFY_VERSIONS_PER_AGENT.get().max(1)
}

/// At least 0 — extras are additive, so 0 is a legitimate "newest only" setting;
/// a negative override is meaningless and clamps to it.
pub fn classify_max_extra_versions() -> i64 {
    CLASSIFY_MAX_EXTRA_VERSIONS.get().max(0)
}
