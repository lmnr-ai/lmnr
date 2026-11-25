//! Threshold and percent-change alerts on a project's cost, tokens, traffic,
//! error rate and latency. See `docs/internal/metric-alerts.md`.

pub mod cadence;
pub mod engine;
pub mod filters;
pub mod ingestion;
pub mod preview;
pub mod query;
pub mod rule;
pub mod scheduler;
pub mod series;
pub mod store;

#[cfg(test)]
mod engine_tests;
