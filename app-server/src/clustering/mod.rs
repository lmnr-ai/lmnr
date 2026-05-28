//! Public surface for the clustering feature.
//!
//! Implementation lives in `private/` and is gated behind the `signals` cargo
//! feature (clustering is part of the enterprise signals bundle). With the
//! feature off, `public.rs` provides no-op stubs and the clustering consumer
//! worker is never spawned from `main.rs` — OSS builds ingest signal events
//! without any downstream clustering.

#[cfg(feature = "signals")]
pub mod private;

#[cfg(not(feature = "signals"))]
mod public;
