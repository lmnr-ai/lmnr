//! Write-once (static) parts of a trace, split out of `traces_agg` (LAM-2026).
//!
//! Writes are per-batch DELTAS, exactly like `traces_agg` — nothing reads a
//! cumulative row first, so this is independent of the Postgres aggregator
//! (which is being retired). Every column must therefore fold correctly from
//! partials alone.
//!
//! Most columns are SET rather than aggregated: a trace gets 1..N writes and the
//! latest should win. `CoalescingMergeTree` resolves each of those independently
//! — `None` means "no update from this write" and never erases a prior value —
//! so a batch only writes the columns it actually learned about. Resolution is by
//! INSERTION ORDER (last non-NULL write per column wins), NOT by `start_time`:
//! `CoalescingMergeTree` takes no version parameter (its optional argument is a
//! columns-to-coalesce list).
//!
//! `status` / `trace_type` are deliberately NOT here — they stay in `traces_agg`
//! as its `statuses` / `trace_types` seen-value arrays, because their precedence
//! (sticky `error`; DEFAULT must not pin a trace a later batch types otherwise)
//! needs the union that `traces_agg` already stores and already resolves in its
//! view. Don't duplicate them here.
//!
//! `metadata` has SET semantics, NOT patch semantics: a plain `Option<String>`
//! holding the whole stringified JSON object, written only when the batch
//! actually carries metadata. Deliberately NOT a `maxMap` map like `traces_agg`
//! — per-key map merging is slow at scale, and avoiding that cost is a main
//! reason this table exists. **Setting a trace's metadata more than once is
//! therefore UNDEFINED**: whichever write lands last wins wholesale and the other
//! writes' keys are lost, not merged. See the migration header.
//!
//! `start_time` is the batch's min span start and the partition key (mirroring
//! `traces_replacing` / `traces_agg` so reads can push a PREWHERE down to it).
//! Background merges don't cross partitions, but `SELECT ... FINAL` does, so
//! reads still see one coalesced row. See the migration for the read-side
//! contract (pad the bounds; never set
//! `do_not_merge_across_partitions_select_final`) and for why the partition-key
//! column is deliberately a plain `DateTime64` rather than a
//! `SimpleAggregateFunction(min, ...)`.

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
use crate::traces::input_extraction::metadata::USER_TASK_METADATA_KEY;

/// One delta write of the static columns for a trace. Field order MUST match the
/// CREATE TABLE column order (RowBinary is positional).
///
/// Every payload column is `Option` — `None` serializes as ClickHouse NULL, which
/// `CoalescingMergeTree` treats as "no update" and leaves the prior value
/// intact.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceStatic {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Batch min span start, nanoseconds. The partition key — NOT a version, and
    /// NOT aggregated (a partition-key column keeps the first-arriving value in a
    /// CoalescingMergeTree), so this can be a later batch's start when spans
    /// arrive out of order. Reads use it as a padded pruning bound; the
    /// authoritative trace start lives in `traces_agg`.
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
    /// Whole stringified JSON object (same shape as
    /// `traces_replacing.metadata`), with SET — not patch — semantics: `None`
    /// when this batch carried no metadata, so it's a no-op rather than an
    /// erase. Any single write wins wholesale; setting a trace's metadata twice
    /// is undefined (see the module docs).
    pub metadata: Option<String>,
    #[serde(with = "clickhouse::serde::uuid::option")]
    pub root_span_id: Option<Uuid>,
    /// The REAL root span's name — written only alongside `root_span_id`.
    pub root_span_name: Option<String>,
    /// Span-path-derived preview name, for in-progress traces (and traces whose
    /// root span never arrives). Kept in its own column so it can never clobber
    /// `root_span_name`: readers resolve
    /// `coalesce(root_span_name, root_span_name_from_path)`, which makes the real
    /// name win regardless of arrival order without `traces_agg`'s '2'/'1'
    /// priority-prefix encoding.
    pub root_span_name_from_path: Option<String>,
    /// Enum8 on the wire (Int8). The DDL enum covers the full
    /// `Into<u8> for SpanType` range: an out-of-range int is accepted at
    /// INSERT but poisons every later read of the part.
    pub root_span_type: Option<i8>,
    pub has_browser_session: Option<u8>,
    /// Reserved, no writer yet; same SET semantics as `metadata`.
    pub internal_metadata: Option<String>,
}

/// Empty strings collapse to `None` so a batch that saw no value writes a NULL
/// hole (no update) rather than overwriting a known value with `''`.
fn non_empty(value: Option<&String>) -> Option<String> {
    value.filter(|s| !s.is_empty()).cloned()
}

/// Takes the batch's `top_span_type`. Out-of-DDL-range values are dropped for the
/// same enum-poisoning reason as above; the DDL covers the full
/// `Into<u8> for SpanType` range 0..=8.
fn root_span_type_enum_value(top_span_type: u8) -> Option<i8> {
    (top_span_type <= 8).then_some(top_span_type as i8)
}

/// Whole stringified JSON object, matching `traces_replacing.metadata`. Written
/// only when the object is non-empty — an empty object carries no keys, so
/// writing it would only risk clobbering a populated value under SET semantics.
///
/// Reserved `lmnr_*` keys are stripped. They're compatibility shims for
/// `traces_replacing.metadata` (see `USER_TASK_METADATA_KEY`) and the values they
/// carry already have dedicated columns here (`input`, `output_hashes`), so
/// letting one through wouldn't add a key — under SET semantics its whole-object
/// write would REPLACE the customer's real metadata. The call site already keeps
/// the synthetic fold out of `traces_static` entirely; this is the backstop, and
/// it mirrors the strip `traces_agg`'s `encode_metadata` does for the same key.
fn encode_metadata(metadata: Option<&Value>) -> Option<String> {
    let Some(Value::Object(map)) = metadata else {
        return None;
    };
    let filtered: serde_json::Map<String, Value> = map
        .iter()
        .filter(|(k, _)| !is_reserved_metadata_key(k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    (!filtered.is_empty()).then(|| Value::Object(filtered).to_string())
}

/// Keys the ingest path folds into `traces_replacing.metadata` for
/// backwards-compatible reads. They are NOT customer metadata and must never be
/// written to `traces_static`.
fn is_reserved_metadata_key(key: &str) -> bool {
    key == USER_TASK_METADATA_KEY || key == "lmnr_trace_output"
}

impl CHTraceStatic {
    /// Build a delta write from one batch's in-memory aggregation, or `None` when
    /// the batch learned nothing static (every column would be a no-op, so the
    /// row would be pure overhead).
    ///
    /// `now_ns` is the `start_time` fallback for a batch with no span times.
    pub fn from_aggregation(agg: &TraceAggregation, now_ns: i64) -> Option<Self> {
        // Within a batch the root trio is unambiguous: `top_span_id` is set only
        // by the real root span, and `top_span_name` is then that span's name.
        // With no `top_span_id` the name (if any) came from the span path, so it
        // goes to `root_span_name_from_path` where it can never clobber a real
        // name under last-write-wins.
        let (root_span_id, root_span_name, root_span_name_from_path, root_span_type) =
            match agg.top_span_id {
                Some(id) => (
                    Some(id),
                    non_empty(agg.top_span_name.as_ref()),
                    None,
                    root_span_type_enum_value(agg.top_span_type),
                ),
                None => (None, None, non_empty(agg.top_span_name.as_ref()), None),
            };

        let row = CHTraceStatic {
            project_id: agg.project_id,
            trace_id: agg.trace_id,
            start_time: agg.start_time.map(chrono_to_nanoseconds).unwrap_or(now_ns),
            input: None,
            output_hashes: None,
            user_id: non_empty(agg.user_id.as_ref()),
            session_id: non_empty(agg.session_id.as_ref()),
            metadata: encode_metadata(agg.metadata.as_ref()),
            root_span_id,
            root_span_name,
            root_span_name_from_path,
            root_span_type,
            has_browser_session: agg.has_browser_session.map(|v| v as u8),
            internal_metadata: None,
        };
        row.has_any_value().then_some(row)
    }

    /// Build a delta write for a metadata patch (`POST /v1/traces/metadata`).
    /// Carries the patch's object as the whole `metadata` value — SET semantics,
    /// so it does not merge with what the span batches wrote. A trace whose
    /// metadata is set by both a span batch and a patch has undefined metadata
    /// (see the module docs); that's the accepted cost of avoiding per-key map
    /// merges.
    ///
    /// `start_time` should be the trace's start when known; a patch carries no
    /// span times, so callers pass the flush clock and accept that a patch for a
    /// trace that started in an earlier month lands one partition late (still
    /// coalesced by `SELECT ... FINAL`, but clippable by a tight bound).
    pub fn from_metadata_patch(
        project_id: Uuid,
        trace_id: Uuid,
        metadata: Option<&Value>,
        start_time: i64,
    ) -> Option<Self> {
        let metadata = encode_metadata(metadata);
        if metadata.is_none() {
            return None;
        }
        Some(CHTraceStatic {
            project_id,
            trace_id,
            start_time,
            input: None,
            output_hashes: None,
            user_id: None,
            session_id: None,
            metadata,
            root_span_id: None,
            root_span_name: None,
            root_span_name_from_path: None,
            root_span_type: None,
            has_browser_session: None,
            internal_metadata: None,
        })
    }

    /// Build a delta write for the extracted agent input/output. Only the io
    /// columns are set; everything else is a no-op.
    ///
    /// `start_time` MUST be the TRACE's start time, not the winning span's end
    /// time: it's the partition key, so a per-write timestamp would drop this row
    /// into a different partition than the aggregation writes and leave it
    /// invisible to any `start_time`-bounded read of the trace.
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
            root_span_name_from_path: None,
            root_span_type: None,
            has_browser_session: None,
            internal_metadata: None,
        })
    }

    /// Whether this write carries anything at all — i.e. any non-NULL coalescing
    /// column or any non-identity aggregate.
    fn has_any_value(&self) -> bool {
        self.input.is_some()
            || self.output_hashes.is_some()
            || self.user_id.is_some()
            || self.session_id.is_some()
            || self.metadata.is_some()
            || self.root_span_id.is_some()
            || self.root_span_name.is_some()
            || self.root_span_name_from_path.is_some()
            || self.root_span_type.is_some()
            || self.has_browser_session.is_some()
            || self.internal_metadata.is_some()
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

    // A batch that learned nothing static must not write a row at all — every
    // column would be a no-op, so the row is pure overhead. Status and trace type
    // are NOT static columns here (they live in traces_agg), so a batch carrying
    // only those still writes nothing.
    #[test]
    fn batch_with_no_static_values_writes_nothing() {
        assert!(CHTraceStatic::from_aggregation(&empty_agg(), 0).is_none());

        let mut agg = empty_agg();
        agg.status = Some("error".to_string());
        agg.trace_type = 1;
        assert!(
            CHTraceStatic::from_aggregation(&agg, 0).is_none(),
            "status / trace_type belong to traces_agg, not traces_static"
        );
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

    // `metadata` is written as the whole object (SET semantics), so a batch that
    // carries metadata writes all of it and a batch that doesn't writes a NULL
    // hole. This deliberately does NOT merge keys across writes — per-key map
    // merging is the cost this table exists to avoid — so a trace whose metadata
    // is set twice ends up with whichever write lands last. Pinning the shape
    // here so nobody "fixes" it into a patch/merge later without revisiting the
    // performance trade-off.
    #[test]
    fn metadata_is_written_whole_with_set_semantics() {
        let mut agg = empty_agg();
        agg.metadata = Some(json!({"k1": "one"}));
        let first = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(first.metadata.as_deref(), Some("{\"k1\":\"one\"}"));

        // A second write carries only ITS object — k1 is not restated and will
        // NOT be merged in; last write wins wholesale (undefined by contract).
        agg.metadata = Some(json!({"k2": "two"}));
        let second = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(second.metadata.as_deref(), Some("{\"k2\":\"two\"}"));

        // A batch with no metadata leaves a NULL hole rather than erasing.
        agg.metadata = None;
        agg.session_id = Some("s".to_string());
        let third = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(third.metadata, None);
    }

    // Regression (LAM-2026 review): the ingest path folds the extracted user task
    // into `traces_replacing.metadata` as a synthetic `lmnr_user_task` key. That
    // must never reach traces_static — its `metadata` is ONE whole-object column
    // with SET semantics, so a synthetic `{lmnr_user_task: …}` write doesn't sit
    // beside the customer's keys, it REPLACES them (reproduced end-to-end: a trace
    // with real metadata came back holding only `lmnr_user_task`). The call site
    // keeps the fold out of this table entirely; this pins the backstop strip.
    #[test]
    fn reserved_lmnr_metadata_keys_are_never_written() {
        // A synthetic-only object encodes to nothing rather than a clobbering write.
        assert_eq!(
            encode_metadata(Some(&json!({USER_TASK_METADATA_KEY: "the task"}))),
            None
        );
        assert_eq!(
            encode_metadata(Some(&json!({"lmnr_trace_output": "out"}))),
            None
        );
        // Mixed object keeps only the customer's keys.
        assert_eq!(
            encode_metadata(Some(&json!({
                "real_user_key": "keep",
                USER_TASK_METADATA_KEY: "strip",
            })))
            .as_deref(),
            Some("{\"real_user_key\":\"keep\"}")
        );
        // A customer key that merely starts with a similar prefix is NOT reserved.
        assert!(
            encode_metadata(Some(&json!({"lmnr_user_task_custom": "keep"})))
                .unwrap()
                .contains("lmnr_user_task_custom")
        );
    }

    #[test]
    fn metadata_is_stringified_json_and_empty_objects_are_no_ops() {
        assert_eq!(encode_metadata(None), None);
        assert_eq!(
            encode_metadata(Some(&json!({}))),
            None,
            "an empty object carries no keys, so writing it could only clobber"
        );
        assert_eq!(
            encode_metadata(Some(&json!({"a": 1, "b": "x", "c": {"n": true}}))).as_deref(),
            Some("{\"a\":1,\"b\":\"x\",\"c\":{\"n\":true}}")
        );
    }

    // A batch WITHOUT the root span contributes only the path-derived preview
    // name, in its own column — so it can never clobber a real root name, and
    // the preview still renders for in-progress traces.
    #[test]
    fn path_derived_name_goes_to_its_own_column() {
        let mut agg = empty_agg();
        agg.top_span_name = Some("outer_path".to_string());
        let row = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(row.root_span_name, None);
        assert_eq!(row.root_span_name_from_path.as_deref(), Some("outer_path"));
        assert_eq!(row.root_span_id, None);
        assert_eq!(
            row.root_span_type, None,
            "no root span => no type, so it can't desync from the id"
        );
    }

    // A batch WITH the root span writes id/name/type together and leaves
    // `root_span_name_from_path` a NULL hole.
    #[test]
    fn real_root_name_goes_to_the_primary_column() {
        let mut agg = empty_agg();
        let root_id = Uuid::new_v4();
        agg.top_span_id = Some(root_id);
        agg.top_span_name = Some("agent".to_string());
        agg.top_span_type = 6;
        let row = CHTraceStatic::from_aggregation(&agg, 0).unwrap();
        assert_eq!(row.root_span_id, Some(root_id));
        assert_eq!(row.root_span_name.as_deref(), Some("agent"));
        assert_eq!(row.root_span_name_from_path, None);
        assert_eq!(row.root_span_type, Some(6));
    }

    // The precedence must be order-independent. Separate columns give the reader
    // `coalesce(real, from_path)`, so a path-only batch arriving AFTER the real
    // root can't overwrite the real name — the bug `traces_replacing` has (its
    // COALESCE arm lets a later fallback win while top_span_id keeps the root's,
    // desyncing the two) and that `traces_agg` works around with a '2'/'1'
    // priority prefix.
    #[test]
    fn late_path_only_batch_cannot_clobber_the_real_root_name() {
        let mut agg = empty_agg();
        let root_id = Uuid::new_v4();

        // batch 1: real root span.
        agg.top_span_id = Some(root_id);
        agg.top_span_name = Some("real_root".to_string());
        agg.top_span_type = 6;
        let first = CHTraceStatic::from_aggregation(&agg, 0).unwrap();

        // batch 2 (later): no root span, only a path-derived name.
        agg.top_span_id = None;
        agg.top_span_name = Some("path_derived".to_string());
        agg.top_span_type = 0;
        let second = CHTraceStatic::from_aggregation(&agg, 0).unwrap();

        // The later write leaves `root_span_name` a NULL hole, so coalescing
        // keeps batch 1's real name whichever order they land in.
        assert_eq!(second.root_span_name, None);
        assert_eq!(first.root_span_name.as_deref(), Some("real_root"));
        // And the path-derived name is still recorded for preview purposes.
        assert_eq!(
            second.root_span_name_from_path.as_deref(),
            Some("path_derived")
        );
    }

    #[test]
    fn out_of_range_root_span_type_is_dropped_not_cast() {
        assert_eq!(root_span_type_enum_value(9), None);
        // 0 (DEFAULT) IS a real root span type — unlike trace_type it's only
        // written alongside a real root span id, so there's no ambiguity.
        assert_eq!(root_span_type_enum_value(0), Some(0));
        assert_eq!(root_span_type_enum_value(8), Some(8));
    }

    // start_time is the partition key, so it must be the batch's span start
    // (falling back to the flush clock only when the batch has no span times).
    #[test]
    fn start_time_uses_span_start_then_falls_back() {
        let start = Utc::now();
        let mut agg = empty_agg();
        agg.session_id = Some("s".to_string());
        agg.start_time = Some(start);
        let row = CHTraceStatic::from_aggregation(&agg, 123).unwrap();
        assert_eq!(row.start_time, chrono_to_nanoseconds(start));

        agg.start_time = None;
        let row = CHTraceStatic::from_aggregation(&agg, 123).unwrap();
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
        assert_eq!(row.metadata, None);
    }
}
