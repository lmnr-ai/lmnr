//! Clustering configuration.

use super::BoolEnv;

/// Mirrors the FRONTEND's `Feature.CLUSTERING` (`CLUSTERING_ENABLED === "true"`),
/// NOT app-server's `Feature::Clustering` (which aliases `has_llm_provider`).
/// Signal creation reads this to decide whether to auto-create the `NEW_CLUSTER`
/// alert and set `skipSimilar` — the same decision the frontend `createSignal`
/// made off this env var, so both surfaces must read the same thing.
pub const ENABLED: BoolEnv = BoolEnv::new("CLUSTERING_ENABLED", false);
