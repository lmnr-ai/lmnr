//! Public surface for the signals feature.
//!
//! Implementation lives in `private/` and is gated behind the `signals` cargo
//! feature. With the feature off, `public.rs` provides no-op stubs so the OSS
//! build keeps compiling and behaves as if signals never fire.

/// Signal creation service (validation + orchestration over the db layer).
/// Ungated: creating signal rows is a plain DB write (signal *processing* is
/// what the `signals` feature gates) shared by the CLI and the browser drawer.
pub mod service;

#[cfg(feature = "signals")]
pub mod private;

#[cfg(not(feature = "signals"))]
mod public;

#[cfg(feature = "signals")]
pub use private::check_and_push_signals;

#[cfg(not(feature = "signals"))]
pub use public::check_and_push_signals;
