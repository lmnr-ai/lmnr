//! Read-only SQL query (`/v1/sql`) execution guards. Both are passed straight
//! into CH settings, so they're modeled as strings.

use super::StringEnv;

/// `max_execution_time` for ad-hoc SQL queries, in seconds.
pub const MAX_EXECUTION_TIME: StringEnv = StringEnv::new("SQL_QUERY_MAX_EXECUTION_TIME", "120");
/// `max_result_bytes` for ad-hoc SQL queries. Default 512 MB.
pub const MAX_RESULT_BYTES: StringEnv = StringEnv::new("SQL_QUERY_MAX_RESULT_BYTES", "536870912");
