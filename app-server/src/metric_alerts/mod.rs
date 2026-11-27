//! Threshold and percent-change alerts on a project's traffic, cost, tokens and
//! LLM calls, read from the per-minute span rollup. See
//! `docs/internal/metric-alerts.md`.

pub mod cadence;
pub mod engine;
pub mod ingestion;
pub mod message;
pub mod preview;
pub mod query;
pub mod rule;
pub mod scheduler;
pub mod series;
pub mod store;

#[cfg(test)]
mod engine_tests;
