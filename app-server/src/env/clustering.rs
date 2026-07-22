//! Clustering configuration.

use super::BoolEnv;

/// Whether the clustering service is enabled. Mirrors the frontend's
/// `Feature.CLUSTERING` (`CLUSTERING_ENABLED === "true"`), NOT the app-server
/// `Feature::Clustering` flag (which aliases to `has_llm_provider`). Signal
/// creation reads this to decide whether to auto-create the `NEW_CLUSTER` alert
/// and set `skipSimilar` on the `SIGNAL_EVENT` alert — the decision the frontend
/// `createSignal` made off the same env var.
pub const ENABLED: BoolEnv = BoolEnv::new("CLUSTERING_ENABLED", false);
