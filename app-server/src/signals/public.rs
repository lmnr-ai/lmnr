//! No-op stubs for the signals feature when the `signals` cargo feature is OFF.
//!
//! The full implementation lives in `signals/private/` and is only compiled
//! when the feature is on (typically inside the private repo). External
//! callers (`traces/processor.rs` for `check_and_push_signals`,
//! `api/v1/mcp.rs` for `get_trace_structure_as_string`) link against this
//! module in OSS builds and observe the documented no-op behaviour.

use std::sync::Arc;

use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::db::spans::Span;
use crate::db::trace::Trace;
use crate::mq::MessageQueue;

pub async fn check_and_push_signals(
    _updated_traces: &[Trace],
    _spans: &[Span],
    _db: Arc<DB>,
    _cache: Arc<Cache>,
    _clickhouse: clickhouse::Client,
    _queue: Arc<MessageQueue>,
) {
    // signals feature compiled out — no work performed.
}

pub async fn get_trace_structure_as_string(
    _clickhouse: clickhouse::Client,
    _project_id: Uuid,
    _trace_id: Uuid,
) -> anyhow::Result<String> {
    Ok(String::new())
}
