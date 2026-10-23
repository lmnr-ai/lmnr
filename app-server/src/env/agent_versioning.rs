//! Tunables for agent versioning (`src/agent_versioning`).

use super::{BoolEnv, NumEnv};

/// Master switch. When false, ingest writes no `agent_prompts` rows and the
/// scheduled job does not start. Disabled by default.
pub const ENABLED: BoolEnv = BoolEnv::new("AGENT_VERSIONING_ENABLED", false);

/// N: traces a line must be present (or absent) in, consecutively, on each
/// side of a change. Also the number of traces a new version's core is built from.
pub const MIN_RUN: NumEnv<usize> = NumEnv::new("AGENT_VERSIONING_MIN_RUN", 30);

/// Longest a rolling deploy may mix old and new prompts and still count as one change.
pub const ROLLOUT_WINDOW_SECONDS: NumEnv<i64> =
    NumEnv::new("AGENT_VERSIONING_ROLLOUT_WINDOW_SECONDS", 30 * 60);

/// A trace waits at most this long for confirmation before it is labelled anyway.
pub const MAX_HOLD_SECONDS: NumEnv<i64> =
    NumEnv::new("AGENT_VERSIONING_MAX_HOLD_SECONDS", 24 * 60 * 60);

/// Change detection reads at most this many traces per agent per minute.
pub const SAMPLES_PER_MINUTE: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_SAMPLES_PER_MINUTE", 20);

/// Cap on unlabelled samples read per agent per run; a backlog drains over runs.
pub const MAX_SAMPLES: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_MAX_SAMPLES", 5000);

pub const INTERVAL_SECONDS: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_INTERVAL_SECONDS", 600);

/// How far back a run looks before the labelling horizon for the samples a
/// change straddling the horizon needs.
pub const LOOKBACK_SECONDS: NumEnv<i64> = NumEnv::new("AGENT_VERSIONING_LOOKBACK_SECONDS", 60 * 60);
