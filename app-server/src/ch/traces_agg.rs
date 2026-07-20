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
use crate::db::trace::Trace;

/// `statuses` Enum8 values; must match the DDL enum
/// `Enum8('success' = 1, 'error' = 2)` in the traces_agg migration.
const STATUS_ENUM_SUCCESS: i8 = 1;
const STATUS_ENUM_ERROR: i8 = 2;

/// One per-batch partial row for the `traces_agg` AggregatingMergeTree table.
/// Field order MUST match the CREATE TABLE column order exactly (RowBinary
/// serialization is positional). `created_at` and the reserved columns
/// (`agent_input`/`agent_output`) are deliberately absent: the insert names
/// its columns, so the server fills their defaults.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgg {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    /// Raw JSON value per key, unversioned; the table's `maxMap` keeps each
    /// key's lexicographically-greatest value across partials, used purely
    /// as an "any occurrence wins" per-key merge (CH has no per-key map-merge
    /// combinator that isn't min/max/sum-based).
    pub metadata: Vec<(String, String)>,
    pub session_id: String,
    pub user_id: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub top_span_id: Uuid,
    pub top_span_name: String,
    pub top_span_type: u8,
    pub tags: Vec<String>,
    pub num_spans: u64,
    pub has_browser_session: u8,
    pub span_names: Vec<String>,
    pub root_span_input: String,
    pub root_span_output: String,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub reasoning_tokens: u64,
    /// Enum8 values on the wire (Int8); union of statuses seen in this batch.
    pub statuses: Vec<i8>,
    /// Enum8 values on the wire (Int8); must stay in sync with
    /// `Into<u8> for TraceType` AND the DDL enum — out-of-range ints
    /// (an unlisted variant, or a value > 127 wrapping in the u8→i8 cast)
    /// are accepted at insert but poison every later read of the part.
    pub trace_types: Vec<i8>,
}

fn encode_metadata(metadata: Option<&Value>) -> Vec<(String, String)> {
    let Some(Value::Object(map)) = metadata else {
        return Vec::new();
    };
    map.iter()
        .map(|(k, v)| (k.clone(), v.to_string()))
        .collect()
}

/// `top_span_name` carries a 1-byte priority prefix: '2' when the batch saw
/// the real root span, '1' when the name is the path-derived fallback (set
/// without top_span_id, see `TraceAggregation::from_spans`). Under the table's
/// `max(String)` any root-derived name then beats any fallback, keeping the
/// name consistent with `top_span_id`/`top_span_type` (which only the root
/// sets) and matching the PG upsert where a later batch carrying the root
/// overwrites the fallback. The view strips the prefix with substring(_, 2).
fn encode_top_span_name(name: Option<&str>, saw_root_span: bool) -> String {
    match name {
        Some(name) => format!("{}{}", if saw_root_span { '2' } else { '1' }, name),
        None => String::new(),
    }
}

fn status_enum_values(status: Option<&str>) -> Vec<i8> {
    match status {
        Some("error") => vec![STATUS_ENUM_ERROR],
        Some(s) if !s.is_empty() => vec![STATUS_ENUM_SUCCESS],
        _ => Vec::new(),
    }
}

/// A value outside the DDL enum would wrap in the cast and poison reads of
/// the part; surface the drift at test time (a panic on the ingest hot path
/// would be worse than the poisoned column it guards).
fn trace_type_enum_value(trace_type: u8) -> i8 {
    debug_assert!(
        trace_type <= 3,
        "trace_type {trace_type} not in the traces_agg Enum8 DDL — extend the enum via ALTER"
    );
    trace_type as i8
}

impl CHTraceAgg {
    /// Build a partial row from one batch's in-memory aggregation. `now_ns` is
    /// the flush wall-clock, used only as the start/end time fallback.
    pub fn from_aggregation(agg: &TraceAggregation, now_ns: i64) -> Self {
        let start_time = agg.start_time.map(chrono_to_nanoseconds).unwrap_or(now_ns);
        let end_time = agg.end_time.map(chrono_to_nanoseconds).unwrap_or(now_ns);

        CHTraceAgg {
            id: agg.trace_id,
            project_id: agg.project_id,
            start_time,
            end_time,
            input_tokens: agg.input_tokens,
            output_tokens: agg.output_tokens,
            total_tokens: agg.total_tokens,
            input_cost: agg.input_cost,
            output_cost: agg.output_cost,
            total_cost: agg.total_cost,
            metadata: encode_metadata(agg.metadata.as_ref()),
            session_id: agg.session_id.clone().unwrap_or_default(),
            user_id: agg.user_id.clone().unwrap_or_default(),
            top_span_id: agg.top_span_id.unwrap_or(Uuid::nil()),
            top_span_name: encode_top_span_name(
                agg.top_span_name.as_deref(),
                agg.top_span_id.is_some(),
            ),
            top_span_type: agg.top_span_type,
            tags: agg.tags.iter().cloned().collect(),
            num_spans: agg.num_spans as u64,
            has_browser_session: agg.has_browser_session.unwrap_or(false) as u8,
            span_names: agg.span_names.iter().cloned().collect(),
            root_span_input: agg.root_span_input.clone().unwrap_or_default(),
            root_span_output: agg.root_span_output.clone().unwrap_or_default(),
            cache_read_input_tokens: agg.cache_read_input_tokens as u64,
            cache_creation_input_tokens: agg.cache_creation_input_tokens as u64,
            reasoning_tokens: agg.reasoning_tokens as u64,
            statuses: status_enum_values(agg.status.as_deref()),
            trace_types: vec![trace_type_enum_value(agg.trace_type)],
        }
    }

    /// Build a partial row for a metadata patch (POST /v1/traces/metadata),
    /// from the PG-merged trace row the patch UPDATE returned. All aggregates
    /// are identities except: metadata (the full merged map, unversioned —
    /// `maxMap`'s per-key value comparison is arbitrary from an application
    /// standpoint, so this is best-effort, not LWW) and `num_spans` (+1,
    /// matching the PG counter bump that pays for the virtual metadata-only
    /// span). `now_ns` is the fallback timestamp.
    pub fn from_patched_trace(trace: &Trace, now_ns: i64) -> Self {
        let start_time = trace
            .start_time()
            .map(chrono_to_nanoseconds)
            .unwrap_or(now_ns);
        let end_time = trace
            .end_time()
            .map(chrono_to_nanoseconds)
            .unwrap_or(now_ns);

        CHTraceAgg {
            id: trace.id(),
            project_id: trace.project_id(),
            start_time,
            end_time,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            metadata: encode_metadata(trace.metadata()),
            session_id: String::new(),
            user_id: String::new(),
            top_span_id: Uuid::nil(),
            top_span_name: String::new(),
            top_span_type: 0,
            tags: Vec::new(),
            num_spans: 1,
            has_browser_session: 0,
            span_names: Vec::new(),
            root_span_input: String::new(),
            root_span_output: String::new(),
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            statuses: Vec::new(),
            trace_types: Vec::new(),
        }
    }
}

impl ClickhouseInsertable for CHTraceAgg {
    const TABLE: Table = Table::TracesAgg;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TracesAgg(items)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn metadata_values_are_raw_json() {
        let metadata = json!({"a": 1, "b": "x", "c": {"nested": true}});
        let encoded = encode_metadata(Some(&metadata));

        let a = encoded.iter().find(|(k, _)| k == "a").unwrap();
        assert_eq!(a.1, "1");
        let b = encoded.iter().find(|(k, _)| k == "b").unwrap();
        assert_eq!(b.1, "\"x\"");
        let c = encoded.iter().find(|(k, _)| k == "c").unwrap();
        assert_eq!(c.1, "{\"nested\":true}");
    }

    #[test]
    fn top_span_name_root_beats_path_fallback_under_max() {
        let fallback = encode_top_span_name(Some("zzz_outer_path"), false);
        let root = encode_top_span_name(Some("agent"), true);
        // Real root name must win max(String) even when lexicographically smaller.
        assert!(root > fallback);
        assert_eq!(&root[1..], "agent");
        assert_eq!(&fallback[1..], "zzz_outer_path");
        assert_eq!(encode_top_span_name(None, false), "");
    }

    #[test]
    fn status_enum_mapping() {
        assert_eq!(status_enum_values(Some("error")), vec![STATUS_ENUM_ERROR]);
        assert_eq!(
            status_enum_values(Some("success")),
            vec![STATUS_ENUM_SUCCESS]
        );
        assert_eq!(status_enum_values(Some("ok")), vec![STATUS_ENUM_SUCCESS]);
        assert_eq!(status_enum_values(Some("")), Vec::<i8>::new());
        assert_eq!(status_enum_values(None), Vec::<i8>::new());
    }
}
