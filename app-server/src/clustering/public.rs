//! No-op surface for the clustering feature.
//!
//! Clustering is an enterprise feature implemented in `lmnr-private`. OSS
//! builds have no callers of `clustering::*` — the worker is never spawned
//! and nothing pushes to the clustering queue — so this module is
//! intentionally empty.
