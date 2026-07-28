//! Write-once (static) parts of a trace, split out of `traces_agg` (LAM-2026).
//!
//! These columns are SET rather than aggregated: a trace gets 1..N writes and
//! the latest should win. `CoalescingMergeTree` resolves each column
//! independently — `None` means "no update from this write" and never erases a
//! prior value — so a batch only writes the columns it actually learned about.
//!
//! Resolution is by INSERTION ORDER (last non-NULL write per column wins), NOT
//! by `start_time`: `CoalescingMergeTree` takes no version parameter (its
//! optional argument is a columns-to-coalesce list).
//!
//! `start_time` is the trace's start time and the partition key (mirroring
//! `traces_replacing` / `traces_agg` so reads can push a PREWHERE down to it).
//! Background merges don't cross partitions, but `SELECT ... FINAL` does, so
//! reads still see one coalesced row. Every write must derive `start_time` from
//! the same trace-level value — see the migration for the read-side contract
//! (pad the bounds; never set `do_not_merge_across_partitions_select_final`).

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
    /// Trace start time in nanoseconds — the partition key, NOT a version. All
    /// writes for a trace must derive this from the same trace-level value so
    /// they land in the same partition; a partition-key column is itself not
    /// coalesced (it keeps the first-arriving value).
    pub start_time: i64,
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
    /// The REAL root span's name — written only alongside `root_span_id`.
    pub root_span_name: Option<String>,
    /// Span-path-derived preview name, for in-progress traces (and traces whose
    /// root span never arrives). Kept in its own column so it can never clobber
    /// `root_span_name`: readers resolve
    /// `coalesce(root_span_name, root_span_name_fallback)`, which makes the real
    /// name win regardless of arrival order without `traces_agg`'s '2'/'1'
    /// priority-prefix encoding.
    pub root_span_name_fallback: Option<String>,
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

/// `DEFAULT` (0) is the "not yet known" value — writing it would pin the trace
/// to DEFAULT and stop a later EVALUATION/PLAYGROUND batch from setting the
/// real type, mirroring the PG upsert's
/// `CASE WHEN traces.type = 0 THEN EXCLUDED.type` first-non-zero rule.
///
/// Takes the raw PG `smallint`. Values outside the DDL `Enum8` are DROPPED
/// rather than cast: an out-of-range int inserts fine but then poisons every
/// later read of the part with `UNKNOWN_ELEMENT_OF_ENUM`, so losing one
/// trace's type beats corrupting the column.
fn trace_type_enum_value(trace_type: i16) -> Option<i8> {
    matches!(trace_type, 1..=3).then_some(trace_type as i8)
}

/// Takes the raw PG `smallint`. Unlike `trace_type`, 0 (`DEFAULT`) IS a real
/// value here — it's written together with the root span id, so there's no
/// "not yet known" ambiguity to guard. Out-of-DDL-range values are dropped for
/// the same enum-poisoning reason as above; the DDL covers the full
/// `Into<u8> for SpanType` range 0..=8.
fn root_span_type_enum_value(top_span_type: Option<i16>) -> Option<i8> {
    top_span_type
        .filter(|t| matches!(t, 0..=8))
        .map(|t| t as i8)
}

impl CHTraceStatic {
    /// Build a static-column write from the PG-merged trace row, or `None` when
    /// nothing static is known yet (every column would be a NULL hole, so the
    /// row would be pure overhead).
    ///
    /// **Must be fed the row Postgres returned, NOT the per-batch
    /// `TraceAggregation`.** These columns are last-write-wins per column, so a
    /// partial write would clobber rather than merge — most visibly `metadata`,
    /// which is ONE `Nullable(String)` here while Postgres merges it with `||`
    /// and `traces_agg` merges per key with `maxMap`. `TraceAggregation.metadata`
    /// only merges within a single batch, so writing it would drop every key an
    /// earlier batch contributed. The PG row is already cumulative across all
    /// batches (and across `POST /v1/traces/metadata` patches), which makes a
    /// whole-object overwrite correct here. The same reasoning covers
    /// `status`/`trace_type`: PG has already applied its sticky-error and
    /// first-non-zero precedence rules.
    ///
    /// The root-span NAME columns are the one exception: they come from `agg`
    /// (this batch's aggregation), not the PG row, because only the batch knows
    /// the name's PROVENANCE. `traces.top_span_name` is a single column whose
    /// `COALESCE(EXCLUDED..., ...)` upsert arm lets a later path-derived
    /// fallback overwrite the real root's name (a live bug in
    /// `traces_replacing`), so the PG value can't be trusted to be root-derived
    /// even when `top_span_id` is set. Pass `None` for a patch-only trace: a
    /// metadata patch learns nothing about the root span, so all root columns
    /// stay NULL holes.
    ///
    /// `now_ns` is the `start_time` fallback for a row with no start time.
    pub fn from_trace(trace: &Trace, agg: Option<&TraceAggregation>, now_ns: i64) -> Option<Self> {
        // Within a batch the root trio is unambiguous: `top_span_id` is set
        // only by the real root span, and `top_span_name` is then that span's
        // name. With no `top_span_id` the name (if any) came from the span
        // path, so it goes to the fallback column where it can never clobber a
        // real name.
        let (root_span_id, root_span_name, root_span_name_fallback, root_span_type) = match agg {
            Some(agg) => match agg.top_span_id {
                Some(id) => (
                    Some(id),
                    non_empty(agg.top_span_name.as_ref()),
                    None,
                    root_span_type_enum_value(Some(agg.top_span_type as i16)),
                ),
                None => (None, None, non_empty(agg.top_span_name.as_ref()), None),
            },
            None => (None, None, None, None),
        };

        let row = CHTraceStatic {
            project_id: trace.project_id(),
            trace_id: trace.id(),
            start_time: trace
                .start_time()
                .map(chrono_to_nanoseconds)
                .unwrap_or(now_ns),
            input: None,
            output_hashes: None,
            user_id: non_empty(trace.user_id().as_ref()),
            session_id: non_empty(trace.session_id().as_ref()),
            metadata: encode_metadata(trace.metadata()),
            root_span_id,
            root_span_name,
            root_span_name_fallback,
            root_span_type,
            status: status_enum_value(trace.status().as_ref()),
            has_browser_session: trace.has_browser_session().map(|v| v as u8),
            trace_type: trace_type_enum_value(trace.trace_type()),
            internal_metadata: None,
        };
        row.has_any_value().then_some(row)
    }

    /// Build a static-column write for the extracted agent input/output. Only
    /// the io columns are set; everything else is a NULL hole.
    ///
    /// `start_time` MUST be the TRACE's start time, not the winning span's end
    /// time: it's the partition key, so using a per-write timestamp would drop
    /// this row into a different partition than the aggregation writes and
    /// leave it invisible to any `start_time`-bounded read of the trace.
    pub fn from_agent_io(
        project_id: Uuid,
        trace_id: Uuid,
        input: Option<String>,
        output_hashes: Option<String>,
        start_time: i64,
    ) -> Option<Self> {
        if input.is_none() && output_hashes.is_none() {
            return None;
        }
        Some(CHTraceStatic {
            project_id,
            trace_id,
            start_time,
            input,
            output_hashes,
            user_id: None,
            session_id: None,
            metadata: None,
            root_span_id: None,
            root_span_name: None,
            root_span_name_fallback: None,
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
            || self.root_span_name_fallback.is_some()
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
    use chrono::Utc;
    use serde_json::json;

    use super::*;

    fn empty_trace() -> Trace {
        Trace::test_new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            None,
            None,
            Some(json!({"span": true})),
        )
    }

    /// A batch aggregation carrying only the root-span fields the writer reads.
    fn agg_with_root(
        top_span_id: Option<Uuid>,
        top_span_name: Option<&str>,
        top_span_type: u8,
    ) -> TraceAggregation {
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
            tags: std::collections::HashSet::new(),
            num_spans: 0,
            top_span_id,
            top_span_name: top_span_name.map(str::to_string),
            top_span_type,
            trace_type: 0,
            has_browser_session: None,
            span_names: std::collections::HashSet::new(),
            root_span_input: None,
            root_span_output: None,
        }
    }

    // A trace with nothing static known must not write a row at all — every
    // column would be a NULL hole, so the row is pure overhead.
    #[test]
    fn trace_with_no_static_values_writes_nothing() {
        assert!(CHTraceStatic::from_trace(&empty_trace(), None, 0).is_none());
    }

    // Empty strings must become NULL holes, not `''` writes: under
    // last-write-wins an empty write would erase a value a prior batch set.
    #[test]
    fn empty_strings_are_null_holes() {
        let mut trace = empty_trace();
        trace.test_set_static(Some(""), Some(""), None, None);
        assert!(CHTraceStatic::from_trace(&trace, None, 0).is_none());

        trace.test_set_static(Some("s1"), Some(""), None, None);
        let row = CHTraceStatic::from_trace(&trace, None, 0).unwrap();
        assert_eq!(row.session_id.as_deref(), Some("s1"));
        assert_eq!(row.user_id, None, "empty user_id stays a NULL hole");
    }

    // A batch WITHOUT the root span contributes only the path-derived preview
    // name, in its own column — so it can never clobber a real root name, and
    // the preview still renders for in-progress traces.
    #[test]
    fn path_derived_name_goes_to_the_fallback_column() {
        let trace = empty_trace();
        let agg = agg_with_root(None, Some("outer_path"), 0);
        let row = CHTraceStatic::from_trace(&trace, Some(&agg), 0).unwrap();
        assert_eq!(row.root_span_name, None);
        assert_eq!(row.root_span_name_fallback.as_deref(), Some("outer_path"));
        assert_eq!(row.root_span_id, None);
        assert_eq!(
            row.root_span_type, None,
            "no root span => no type, so it can't desync from the id"
        );
    }

    // A batch WITH the root span writes id/name/type together and leaves the
    // fallback column a NULL hole.
    #[test]
    fn real_root_name_goes_to_the_primary_column() {
        let trace = empty_trace();
        let root_id = Uuid::new_v4();
        let agg = agg_with_root(Some(root_id), Some("agent"), 6);
        let row = CHTraceStatic::from_trace(&trace, Some(&agg), 0).unwrap();
        assert_eq!(row.root_span_id, Some(root_id));
        assert_eq!(row.root_span_name.as_deref(), Some("agent"));
        assert_eq!(row.root_span_name_fallback, None);
        assert_eq!(row.root_span_type, Some(6));
    }

    // The precedence must be order-independent. Separate columns give the
    // reader `coalesce(real, fallback)`, so a fallback batch arriving AFTER the
    // real root can't overwrite the real name — the bug `traces_replacing` has
    // (its COALESCE arm lets a later fallback win while top_span_id keeps the
    // root's, desyncing the two) and that `traces_agg` works around with a
    // '2'/'1' priority prefix.
    #[test]
    fn late_fallback_batch_cannot_clobber_the_real_root_name() {
        let trace = empty_trace();
        let root_id = Uuid::new_v4();

        // batch 1: real root span.
        let first = CHTraceStatic::from_trace(
            &trace,
            Some(&agg_with_root(Some(root_id), Some("real_root"), 6)),
            0,
        )
        .unwrap();
        // batch 2 (later): no root span, only a path-derived name.
        let second = CHTraceStatic::from_trace(
            &trace,
            Some(&agg_with_root(None, Some("path_fallback"), 0)),
            0,
        )
        .unwrap();

        // The later write leaves `root_span_name` a NULL hole, so coalescing
        // keeps batch 1's real name whichever order they land in.
        assert_eq!(second.root_span_name, None);
        assert_eq!(first.root_span_name.as_deref(), Some("real_root"));
        // And the fallback is still recorded for preview purposes.
        assert_eq!(
            second.root_span_name_fallback.as_deref(),
            Some("path_fallback")
        );
    }

    // A metadata patch learns nothing about the root span, so it must write no
    // root columns at all rather than guessing from the PG row (whose
    // `top_span_name` may itself already be a clobbered fallback).
    #[test]
    fn patch_only_trace_writes_no_root_columns() {
        let mut trace = empty_trace();
        trace.test_set_root_span(Some(Uuid::new_v4()), Some("whatever"), Some(1), 0);
        trace.test_set_static(None, None, Some(json!({"patched": true})), None);

        let row = CHTraceStatic::from_trace(&trace, None, 0).unwrap();
        assert!(row.metadata.is_some(), "the patch's metadata still lands");
        assert_eq!(row.root_span_id, None);
        assert_eq!(row.root_span_name, None);
        assert_eq!(row.root_span_name_fallback, None);
        assert_eq!(row.root_span_type, None);
    }

    // Regression: `metadata` is ONE Nullable(String) resolved by last-write-wins,
    // so it must come from the CUMULATIVE Postgres row. Feeding it a per-batch
    // map (which `TraceAggregation.metadata` is — it only merges within a batch)
    // would drop every key an earlier batch contributed.
    #[test]
    fn metadata_is_written_whole_from_the_cumulative_pg_row() {
        let mut trace = empty_trace();
        // What PG returns after batch 2: `||`-merged across both batches.
        trace.test_set_static(
            None,
            None,
            Some(json!({"from_batch_1": "a", "from_batch_2": "b"})),
            None,
        );
        let row = CHTraceStatic::from_trace(&trace, None, 0).unwrap();
        let encoded = row.metadata.unwrap();
        assert!(
            encoded.contains("from_batch_1"),
            "earlier keys must survive"
        );
        assert!(encoded.contains("from_batch_2"));
    }

    // Regression: PG has already applied its sticky-error rule, so an 'error'
    // that a PREVIOUS batch set is still on the row we read — the write carries
    // it forward instead of relying on this batch having seen the failure.
    #[test]
    fn status_comes_from_the_merged_row_not_the_current_batch() {
        let mut trace = empty_trace();
        trace.test_set_static(None, None, None, Some("error"));
        let row = CHTraceStatic::from_trace(&trace, None, 0).unwrap();
        assert_eq!(row.status, Some(STATUS_ENUM_ERROR));
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

    // trace_type DEFAULT (0) means "not yet known". Writing it would pin the
    // trace to DEFAULT and stop a later EVALUATION/PLAYGROUND batch from
    // setting the real type.
    #[test]
    fn default_trace_type_is_not_written() {
        assert_eq!(trace_type_enum_value(0), None);
        assert_eq!(trace_type_enum_value(1), Some(1));
        assert_eq!(trace_type_enum_value(3), Some(3));
    }

    // An out-of-DDL-range Enum8 int inserts fine but then poisons every later
    // read of the part with UNKNOWN_ELEMENT_OF_ENUM, so unknown values are
    // dropped to a NULL hole instead of cast through.
    #[test]
    fn out_of_range_enum_values_are_dropped_not_cast() {
        assert_eq!(trace_type_enum_value(4), None);
        assert_eq!(trace_type_enum_value(-1), None);
        assert_eq!(root_span_type_enum_value(Some(9)), None);
        assert_eq!(root_span_type_enum_value(Some(-1)), None);
        assert_eq!(root_span_type_enum_value(None), None);
        // 0 (DEFAULT) IS a real root span type — unlike trace_type, it's only
        // written alongside a real root span id, so there's no ambiguity.
        assert_eq!(root_span_type_enum_value(Some(0)), Some(0));
        assert_eq!(root_span_type_enum_value(Some(8)), Some(8));
    }

    #[test]
    fn metadata_is_stringified_json_and_empty_maps_are_holes() {
        assert_eq!(encode_metadata(None), None);
        assert_eq!(encode_metadata(Some(&json!({}))), None);
        let encoded = encode_metadata(Some(&json!({"a": 1}))).unwrap();
        assert_eq!(encoded, "{\"a\":1}");
    }

    // start_time is the partition key, so it must be the TRACE's start time
    // (every write for a trace must agree on it), falling back to the flush
    // clock only when the row carries no start time at all.
    #[test]
    fn start_time_uses_trace_start_then_falls_back() {
        let start = Utc::now();
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();

        let mut trace = Trace::test_new(
            trace_id,
            project_id,
            Some(start),
            None,
            Some(json!({"span": true})),
        );
        trace.test_set_static(Some("s"), None, None, None);
        let row = CHTraceStatic::from_trace(&trace, None, 123).unwrap();
        assert_eq!(row.start_time, chrono_to_nanoseconds(start));

        let mut trace = Trace::test_new(
            trace_id,
            project_id,
            None,
            None,
            Some(json!({"span": true})),
        );
        trace.test_set_static(Some("s"), None, None, None);
        let row = CHTraceStatic::from_trace(&trace, None, 123).unwrap();
        assert_eq!(row.start_time, 123);
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
        // The trace's start_time, so this row shares the aggregation writes'
        // partition — NOT the winning span's end time.
        assert_eq!(row.start_time, 7);
        assert_eq!(row.session_id, None);
        assert_eq!(row.status, None);
        assert_eq!(row.trace_type, None);
    }
}
