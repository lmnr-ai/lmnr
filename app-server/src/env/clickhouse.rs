//! ClickHouse connection + insert tuning.

use super::{BoolEnv, NumEnv, StringEnv};

/// Required ClickHouse connection settings (no defaults — `expect()` at boot).
pub const URL: &str = "CLICKHOUSE_URL";
pub const USER: &str = "CLICKHOUSE_USER";
pub const PASSWORD: &str = "CLICKHOUSE_PASSWORD";
/// Read-only client credentials. Required when the read-only feature is on.
pub const RO_USER: &str = "CLICKHOUSE_RO_USER";
pub const RO_PASSWORD: &str = "CLICKHOUSE_RO_PASSWORD";

/// Cap (ms) for CH's adaptive `async_insert_busy_timeout` on the hot ingest
/// tables (`spans`, `traces_replacing`, `deduped_content`). Stored as a string
/// because it's passed straight into a CH setting. Read once into a `LazyLock`
/// in `ch/mod.rs`.
pub const ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS: StringEnv =
    StringEnv::new("SPANS_CH_WAIT_FOR_ASYNC_INSERT_MS", "400");

/// Bounds the whole INSERT request task awaited by `Insert::end()`. `0`
/// disables the timeout entirely (handled in `ch/mod.rs`). Default 120 s.
pub const INSERT_TIMEOUT_SECS: NumEnv<u64> = NumEnv::new("CLICKHOUSE_INSERT_TIMEOUT_SECS", 120);

/// Whether browser-event inserts wait for the async insert to complete.
pub const BROWSER_EVENTS_WAIT_FOR_ASYNC_INSERT: BoolEnv =
    BoolEnv::new("BROWSER_EVENTS_CH_WAIT_FOR_ASYNC_INSERT", true);
