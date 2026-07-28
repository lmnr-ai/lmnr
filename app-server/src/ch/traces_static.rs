//! Write-once (static) parts of a trace, split out of `traces_agg` (LAM-2026).
//!
//! These columns are SET rather than aggregated: a trace gets 1..N writes and
//! the latest should win. `CoalescingMergeTree` resolves each column
//! independently — `None` means "no update from this write" and never erases a
//! prior value — so a batch only writes the columns it actually learned about.
//!
//! Resolution is by INSERTION ORDER (last non-NULL write per column wins), NOT
//! by `updated_at`: `CoalescingMergeTree` takes no version parameter (its
//! optional argument is a columns-to-coalesce list). `updated_at` is purely
//! informational. The table is deliberately unpartitioned — coalescing only
//! happens within a partition, so any per-write timestamp as a partition key
//! would strand a trace's writes in separate, permanently-partial rows. See the
//! migration for the full semantics.

use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::traces::TraceAggregation;
use super::utils::chrono_to_nanoseconds;
use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
};

/// `status` Enum8 value; must match the DDL enum in the traces_static
/// migration. Only `error` is ever written — see [`status_enum_value`].
const STATUS_ENUM_ERROR: i8 = 2;

/// One write of the static columns for a trace. Field order MUST match the
/// CREATE TABLE column order (RowBinary is positional). Every payload column
/// is `Option` — `None` serializes as ClickHouse NULL, which
/// `CoalescingMergeTree` treats as "no update" and leaves the prior value
/// intact.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceStatic {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Nanoseconds since epoch. Purely informational — NOT a version and not a
    /// partition key (see the module docs), so writes for one trace may
    /// legitimately disagree here without affecting how they merge.
    pub updated_at: i64,
    pub input: Option<String>,
    /// Concatenated lowercase hex, 64 chars per 32-byte hash.
    /// `Nullable(Array(...))` is rejected by ClickHouse and a non-Nullable
    /// `Array` has no NULL hole (an omitted array arrives as `[]` and would
    /// clobber a real value), so the hashes travel as one string and are
    /// unhex'd back into an array at read time.
    pub output_hashes: Option<String>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    /// Stringified JSON object, matching the `traces_replacing.metadata`
    /// encoding the current read path already expects.
    pub metadata: Option<String>,
    #[serde(with = "clickhouse::serde::uuid::option")]
    pub root_span_id: Option<Uuid>,
    pub root_span_name: Option<String>,
    /// Enum8 on the wire (Int8). The DDL enum covers the full
    /// `Into<u8> for SpanType` range: an out-of-range int is accepted at
    /// INSERT but poisons every later read of the part.
    pub root_span_type: Option<i8>,
    /// Enum8 on the wire (Int8).
    pub status: Option<i8>,
    pub has_browser_session: Option<u8>,
    /// Enum8 on the wire (Int8); mirrors `Into<u8> for TraceType`.
    pub trace_type: Option<i8>,
    /// Reserved, no writer yet.
    pub internal_metadata: Option<String>,
}

/// Empty strings collapse to `None` so a batch that saw no value writes a NULL
/// hole (no update) rather than overwriting a known value with `''`. This
/// mirrors the PG upsert's `COALESCE(EXCLUDED.x, traces.x)` arms, which the
/// aggregation only populates with non-empty values.
fn non_empty(value: Option<&String>) -> Option<String> {
    value.filter(|s| !s.is_empty()).cloned()
}

/// `'error'` is sticky in both the PG upsert and the `traces_agg` view, and a
/// `success` write must never downgrade a prior `error`. Insertion-order
/// resolution can't express that, so only `error` is written; the read path
/// defaults a NULL status to `'success'` (the same two-value contract
/// `traces_v0` / `traces_agg_v0` already surface).
fn status_enum_value(status: Option<&String>) -> Option<i8> {
    match status.map(String::as_str) {
        Some("error") => Some(STATUS_ENUM_ERROR),
        _ => None,
    }
}

/// `DEFAULT` (0) is the "not yet known" value in the aggregation — writing it
/// would pin the trace to DEFAULT and stop a later EVALUATION/PLAYGROUND batch
/// from setting the real type, mirroring the PG upsert's
/// `CASE WHEN traces.type = 0 THEN EXCLUDED.type` first-non-zero rule.
fn trace_type_enum_value(trace_type: u8) -> Option<i8> {
    (trace_type != 0).then_some(trace_type as i8)
}

impl CHTraceStatic {
    /// Build a static-column write from one batch's in-memory aggregation, or
    /// `None` when the batch learned nothing static (every column would be a
    /// NULL hole, so the row would be pure overhead).
    ///
    /// `now_ns` is the `updated_at` fallback for a batch with no span times.
    pub fn from_aggregation(agg: &TraceAggregation, now_ns: i64) -> Option<Self> {
        // Only the real root span sets these three together; a path-derived
        // fallback name is deliberately NOT written, so it can't win over the
        // root's name under last-write-wins and desync from
        // `root_span_id`/`root_span_type`.
        let (root_span_id, root_span_name, root_span_type) = match agg.top_span_id {
            Some(id) => (
                Some(id),
                non_empty(agg.top_span_name.as_ref()),
                Some(agg.top_span_type as i8),
            ),
            None => (None, None, None),
        };

        let row = CHTraceStatic {
            project_id: agg.project_id,
            trace_id: agg.trace_id,
            updated_at: agg.start_time.map(chrono_to_nanoseconds).unwrap_or(now_ns),
            input: None,
            output_hashes: None,
            user_id: non_empty(agg.user_id.as_ref()),
            session_id: non_empty(agg.session_id.as_ref()),
            metadata: encode_metadata(agg.metadata.as_ref()),
            root_span_id,
            root_span_name,
            root_span_type,
            status: status_enum_value(agg.status.as_ref()),
            has_browser_session: agg.has_browser_session.map(|v| v as u8),
            trace_type: trace_type_enum_value(agg.trace_type),
            internal_metadata: None,
        };
        row.has_any_value().then_some(row)
    }

    /// Build a static-column write for the extracted agent input/output. Only
    /// the io columns are set; everything else is a NULL hole.
    pub fn from_agent_io(
        project_id: Uuid,
        trace_id: Uuid,
        input: Option<String>,
        output_hashes: Option<String>,
        updated_at: i64,
    ) -> Option<Self> {
        if input.is_none() && output_hashes.is_none() {
            return None;
        }
        Some(CHTraceStatic {
            project_id,
            trace_id,
            updated_at,
            input,
            output_hashes,
            user_id: None,
            session_id: None,
            metadata: None,
            root_span_id: None,
            root_span_name: None,
            root_span_type: None,
            status: None,
            has_browser_session: None,
            trace_type: None,
            internal_metadata: None,
        })
    }

    /// Whether this write carries at least one non-NULL payload column.
    fn has_any_value(&self) -> bool {
        self.input.is_some()
            || self.output_hashes.is_some()
            || self.user_id.is_some()
            || self.session_id.is_some()
            || self.metadata.is_some()
            || self.root_span_id.is_some()
            || self.root_span_name.is_some()
            || self.root_span_type.is_some()
            || self.status.is_some()
            || self.has_browser_session.is_some()
            || self.trace_type.is_some()
            || self.internal_metadata.is_some()
    }
}

/// Stringified JSON object, matching `traces_replacing.metadata`. An empty
/// object is a NULL hole — it carries no keys, so writing it would only risk
/// clobbering a populated map.
fn encode_metadata(metadata: Option<&Value>) -> Option<String> {
    match metadata {
        Some(Value::Object(map)) if !map.is_empty() => Some(Value::Object(map.clone()).to_string()),
        _ => None,
    }
}

impl ClickhouseInsertable for CHTraceStatic {
    const TABLE: Table = Table::TracesStatic;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TracesStatic(items)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use chrono::Utc;
    use serde_json::json;

    use super::*;

    fn empty_agg() -> TraceAggregation {
        TraceAggregation {
            trace_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            start_time: None,
            end_time: None,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            session_id: None,
            user_id: None,
            status: None,
            metadata: None,
            tags: HashSet::new(),
            num_spans: 0,
            top_span_id: None,
            top_span_name: None,
            top_span_type: 0,
            trace_type: 0,
            has_browser_session: None,
            span_names: HashSet::new(),
            root_span_input: None,
            root_span_output: None,
        }
    }

    // A batch that learned nothing static must not write a row at all —
    // every column would be a NULL hole, so the row is pure overhead.
    #[test]
    fn batch_with_no_static_values_writes_nothing() {
        assert!(CHTraceStatic::from_aggregation(&empty_agg(), 0).is_none());
    }

    // Empty strings must become NULL holes, not `''` writes: under
    // last-write-wins an empty write would erase a value a prior batch set.
    #[test]
    fn empty_strings_are_null_holes() {
        let mut agg = empty_agg();
        agg.session_id = Some(String::new());
        agg.user_id = Some(String::new());
        assert!(CHTraceStatic::from_aggregation(&agg, 0).is_none());

        agg.session_id = Some("s1".to_string());
        let row = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(row.session_id.as_deref(), Some("s1"));
        assert_eq!(row.user_id, None, "empty user_id stays a NULL hole");
    }

    // The root-derived name/id/type are written only together, so a
    // path-derived fallback name can never win under last-write-wins and
    // desync from a root_span_id set by another batch.
    #[test]
    fn path_derived_root_name_is_not_written_without_the_root_span() {
        let mut agg = empty_agg();
        agg.top_span_name = Some("outer_path".to_string());
        // No top_span_id => this name came from the span path, not the root.
        assert!(CHTraceStatic::from_aggregation(&agg, 0).is_none());

        let root_id = Uuid::new_v4();
        agg.top_span_id = Some(root_id);
        agg.top_span_name = Some("agent".to_string());
        agg.top_span_type = 6;
        let row = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(row.root_span_id, Some(root_id));
        assert_eq!(row.root_span_name.as_deref(), Some("agent"));
        assert_eq!(row.root_span_type, Some(6));
    }

    // 'error' is sticky; a later 'success' batch must not downgrade it.
    // Insertion-order resolution can't express that, so only 'error' is
    // written and the read path defaults NULL to 'success'.
    #[test]
    fn only_error_status_is_written() {
        assert_eq!(
            status_enum_value(Some(&"error".to_string())),
            Some(STATUS_ENUM_ERROR)
        );
        assert_eq!(status_enum_value(Some(&"success".to_string())), None);
        assert_eq!(status_enum_value(Some(&String::new())), None);
        assert_eq!(status_enum_value(None), None);
    }

    // trace_type DEFAULT (0) means "not yet known" in the aggregation.
    // Writing it would pin the trace to DEFAULT and stop a later
    // EVALUATION/PLAYGROUND batch from setting the real type.
    #[test]
    fn default_trace_type_is_not_written() {
        assert_eq!(trace_type_enum_value(0), None);
        assert_eq!(trace_type_enum_value(1), Some(1));
        assert_eq!(trace_type_enum_value(3), Some(3));
    }

    #[test]
    fn metadata_is_stringified_json_and_empty_maps_are_holes() {
        assert_eq!(encode_metadata(None), None);
        assert_eq!(encode_metadata(Some(&json!({}))), None);
        let encoded = encode_metadata(Some(&json!({"a": 1}))).unwrap();
        assert_eq!(encoded, "{\"a\":1}");
    }

    // updated_at reports the trace's start time (falling back to the flush
    // clock). It's informational only — the table is unpartitioned, so this
    // value never influences which writes merge together.
    #[test]
    fn updated_at_uses_start_time_then_falls_back() {
        let start = Utc::now();
        let mut agg = empty_agg();
        agg.session_id = Some("s".to_string());
        agg.start_time = Some(start);
        let row = CHTraceStatic::from_aggregation(&agg, 123).unwrap();
        assert_eq!(row.updated_at, chrono_to_nanoseconds(start));

        agg.start_time = None;
        let row = CHTraceStatic::from_aggregation(&agg, 123).unwrap();
        assert_eq!(row.updated_at, 123);
    }

    #[test]
    fn agent_io_writes_only_io_columns() {
        assert!(
            CHTraceStatic::from_agent_io(Uuid::new_v4(), Uuid::new_v4(), None, None, 0).is_none()
        );

        let row = CHTraceStatic::from_agent_io(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some("\"the task\"".to_string()),
            Some("ab".repeat(32)),
            7,
        )
        .unwrap();
        assert_eq!(row.input.as_deref(), Some("\"the task\""));
        assert_eq!(row.output_hashes.as_deref().map(str::len), Some(64));
        assert_eq!(row.updated_at, 7);
        assert_eq!(row.session_id, None);
        assert_eq!(row.status, None);
        assert_eq!(row.trace_type, None);
    }
}
