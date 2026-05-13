//! Public surface for the clustering feature.
//!
//! The full clustering implementation is an enterprise feature that lives in
//! `lmnr-private` behind the `signals` cargo flag. OSS builds ship no
//! clustering — `public.rs` exists only as a placeholder so the module tree
//! compiles, and the clustering consumer worker is not spawned from
//! `main.rs`.

#[cfg(not(feature = "signals"))]
mod public;
