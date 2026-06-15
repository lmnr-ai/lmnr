//! Debugger replay cache tuning (`debugger/mod.rs`). All read once into
//! `LazyLock`s at module init.

use super::NumEnv;

/// Spans pulled from ClickHouse per warmup page.
pub const CACHE_QUERY_PAGE_SIZE: NumEnv<u32> = NumEnv::new("DEBUGGER_CACHE_QUERY_PAGE_SIZE", 8);
/// Cache ceiling: max spans admitted per `(project, trace)`.
pub const CACHE_MAX_SPANS: NumEnv<usize> = NumEnv::new("DEBUGGER_CACHE_MAX_SPANS", 256);
/// Cache ceiling: max total response bytes admitted per `(project, trace)`.
pub const CACHE_MAX_BYTES: NumEnv<usize> = NumEnv::new("DEBUGGER_CACHE_MAX_BYTES", 67_108_864);
/// TTL on entry keys + ready marker.
pub const CACHE_TTL_SECONDS: NumEnv<u64> = NumEnv::new("DEBUGGER_CACHE_TTL_SECONDS", 3600);
/// Warmup lock TTL.
pub const CACHE_LOCK_TTL_SECONDS: NumEnv<u64> = NumEnv::new("DEBUGGER_CACHE_LOCK_TTL_SECONDS", 60);
/// Max wait before a blocked caller degrades to `Live`.
pub const CACHE_WARMUP_TIMEOUT_SECONDS: NumEnv<u64> =
    NumEnv::new("DEBUGGER_CACHE_WARMUP_TIMEOUT_SECONDS", 10);
