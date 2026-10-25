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
    NumEnv::new("AGENT_VERSIONING_ROLLOUT_WINDOW_SECONDS", 10 * 60);

/// Agents with prompts ingested this recently are visited each run, long
/// enough to drain a backlog after their traffic stops.
pub const ACTIVE_WINDOW_SECONDS: NumEnv<i64> =
    NumEnv::new("AGENT_VERSIONING_ACTIVE_WINDOW_SECONDS", 24 * 60 * 60);

/// Change detection reads at most this many traces per agent per minute.
pub const SAMPLES_PER_MINUTE: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_SAMPLES_PER_MINUTE", 100);

/// Cap on unlabelled samples read per agent per run; a backlog drains over runs.
pub const MAX_SAMPLES: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_MAX_SAMPLES", 5000);

pub const INTERVAL_SECONDS: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_INTERVAL_SECONDS", 600);

/// How far back a run first looks before the labelling horizon for the samples
/// a change straddling the horizon needs; widened when it holds too few.
pub const LOOKBACK_SECONDS: NumEnv<i64> = NumEnv::new("AGENT_VERSIONING_LOOKBACK_SECONDS", 60 * 60);

/// Release mode: a release with this many traces is decided from that many,
/// and lets every older undecided release be decided early.
pub const RELEASE_MIN_RUN: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_RELEASE_MIN_RUN", 10);

/// Release mode: a release short of `RELEASE_MIN_RUN` traces is decided from
/// what it has this long after it was first seen.
pub const RELEASE_DECIDE_AFTER_SECONDS: NumEnv<i64> =
    NumEnv::new("AGENT_VERSIONING_RELEASE_DECIDE_AFTER_SECONDS", 6 * 60 * 60);

/// Release mode: fewest traces a release is ever decided from.
pub const RELEASE_MIN_SAMPLES: NumEnv<u64> = NumEnv::new("AGENT_VERSIONING_RELEASE_MIN_SAMPLES", 3);
