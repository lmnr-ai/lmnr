//! Read-only SQL query (`/v1/sql`) execution guards. Both are passed straight
//! into CH settings, so they're modeled as strings.

use super::StringEnv;

/// `max_execution_time` for ad-hoc SQL queries, in seconds.
pub const MAX_EXECUTION_TIME: StringEnv = StringEnv::new("SQL_QUERY_MAX_EXECUTION_TIME", "120");
/// `max_result_bytes` for ad-hoc SQL queries. Default 512 MB.
pub const MAX_RESULT_BYTES: StringEnv = StringEnv::new("SQL_QUERY_MAX_RESULT_BYTES", "536870912");
/// `max_memory_usage` (bytes) for public/CLI ad-hoc SQL queries — the per-query
/// memory ceiling that protects ClickHouse from OOM-inducing scans. Applied only
/// to internet-facing traffic, never the trusted frontend. Default `0` =
/// unlimited, so self-hosters are unrestricted unless they opt in; cloud sets a
/// concrete cap (e.g. a few GB) via env.
pub const MAX_MEMORY_USAGE: StringEnv = StringEnv::new("SQL_QUERY_MAX_MEMORY_USAGE", "0");
// TODO: find more fine-grained controls for this
/// `min_bytes_to_use_direct_io` forces the query to directly read from disk
/// skipping the page cache if the number of bytes to read exceeds
/// the value. Default `0` = no enforcement.
///
/// Large reads may cause huge chunks of data to be read via OS page cache.
/// An offending repeated query from API may cause significant slowdown to the
/// rest of the read paths if the page cache is busy serving API requests.
/// This setting is a kill switch to re-route offending API queries to read
/// directly from disk, thus greatly slowing them down, but unblocking the
/// rest of critical functionality. Reference:
/// https://presentations.clickhouse.com/2021-meetup53/optimizations/?full#13
pub const MIN_BYTES_TO_USE_DIRECT_IO: StringEnv =
    StringEnv::new("SQL_QUERY_MIN_BYTES_TO_USE_DIRECT_IO", "0");
