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
