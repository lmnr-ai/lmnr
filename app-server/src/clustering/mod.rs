//! Public surface for the clustering feature.
//!
//! Implementation lives in `private/` and is gated behind the `signals` cargo
//! feature (clustering is part of the enterprise signals bundle). With the
//! feature off, `public.rs` provides no-op stubs and the clustering consumer
//! worker is never spawned from `main.rs` — OSS builds ingest signal events
//! without any downstream clustering.
//!
//! In OSS the `private` module is intentionally not present in the source
//! tree; it ships only in `lmnr-private`. The `#[cfg(feature = "signals")]`
//! gate keeps OSS builds (which never enable `signals`) compiling without it.

#[cfg(feature = "signals")]
pub mod private;

#[cfg(not(feature = "signals"))]
mod public;
