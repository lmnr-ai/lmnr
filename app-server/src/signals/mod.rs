//! Public surface for the signals feature.
//!
//! Implementation lives in `private/` and is gated behind the `signals` cargo
//! feature. With the feature off, `public.rs` provides no-op stubs so the OSS
//! build keeps compiling and behaves as if signals never fire.

#[cfg(feature = "signals")]
pub mod private;

#[cfg(not(feature = "signals"))]
mod public;

#[cfg(feature = "signals")]
pub use private::{check_and_push_signals, get_trace_structure_as_string};

#[cfg(not(feature = "signals"))]
pub use public::{check_and_push_signals, get_trace_structure_as_string};
