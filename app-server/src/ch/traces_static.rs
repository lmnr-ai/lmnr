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
//! Three columns can't be expressed that way over deltas and use
//! `SimpleAggregateFunction` instead (same encodings as `traces_agg`):
//! `metadata` / `internal_metadata` accumulate, so they merge PER KEY via
//! `maxMap`; `statuses` / `trace_types` carry seen-value unions so the READ path
//! owns precedence (sticky `error`, PLAYGROUND > EVALUATION > DEFAULT).
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

/// `statuses` Enum8 values; must match the DDL enum in the traces_static
/// migration.
const STATUS_ENUM_SUCCESS: i8 = 1;
const STATUS_ENUM_ERROR: i8 = 2;

/// One delta write of the static columns for a trace. Field order MUST match the
/// CREATE TABLE column order (RowBinary is positional).
///
/// Coalescing columns are `Option` — `None` serializes as ClickHouse NULL, which
/// `CoalescingMergeTree` treats as "no update" and leaves the prior value intact.
/// The `SimpleAggregateFunction` columns instead fold by their own combinator, so
/// their identity value (empty map / empty array) is the no-op.
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
    /// Raw JSON value per key, merged PER KEY by the table's `maxMap` — the one
    /// column whose value genuinely accumulates across batches. Same encoding
    /// (and the same "any occurrence wins, NOT guaranteed last-write-wins"
    /// caveat) as `traces_agg.metadata`. An empty map is a no-op.
    pub metadata: Vec<(String, String)>,
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
    /// Enum8 values on the wire (Int8); union of statuses seen in this batch.
    /// The read path resolves precedence (`error` is sticky), so a later
    /// success-only batch can't downgrade a prior error.
    pub statuses: Vec<i8>,
    pub has_browser_session: Option<u8>,
    /// Enum8 values on the wire (Int8); union of trace types seen in this batch.
    /// Must stay in sync with `Into<u8> for TraceType` AND the DDL enum —
    /// out-of-range ints are accepted at insert but poison later reads.
    pub trace_types: Vec<i8>,
    /// Reserved, no writer yet; same per-key `maxMap` encoding as `metadata`.
    pub internal_metadata: Vec<(String, String)>,
}

/// Empty strings collapse to `None` so a batch that saw no value writes a NULL
/// hole (no update) rather than overwriting a known value with `''`.
fn non_empty(value: Option<&String>) -> Option<String> {
    value.filter(|s| !s.is_empty()).cloned()
}

/// Seen-value union for this batch. Unlike a single coalescing column this needs
/// no precedence logic: `error` stickiness is applied at read time from the
/// merged union, so a later success-only batch can't downgrade a prior error.
fn status_enum_values(status: Option<&String>) -> Vec<i8> {
    match status.map(String::as_str) {
        Some("error") => vec![STATUS_ENUM_ERROR],
        Some(s) if !s.is_empty() => vec![STATUS_ENUM_SUCCESS],
        _ => Vec::new(),
    }
}

/// Seen-value union for this batch. `DEFAULT` (0) is the aggregation's "not yet
/// known" value, so it's omitted — otherwise every batch would report DEFAULT and
/// the read-side `multiIf` could never distinguish "no type seen" from a real
/// DEFAULT. Out-of-DDL-range values are dropped rather than cast: an
/// out-of-range int inserts fine but then poisons every later read of the part
/// with `UNKNOWN_ELEMENT_OF_ENUM`.
fn trace_type_enum_values(trace_type: u8) -> Vec<i8> {
    match trace_type {
        1..=3 => vec![trace_type as i8],
        _ => Vec::new(),
    }
}

/// Takes the batch's `top_span_type`. Out-of-DDL-range values are dropped for the
/// same enum-poisoning reason as above; the DDL covers the full
/// `Into<u8> for SpanType` range 0..=8.
fn root_span_type_enum_value(top_span_type: u8) -> Option<i8> {
    (top_span_type <= 8).then_some(top_span_type as i8)
}

/// Raw JSON value per key, matching `traces_agg`'s `maxMap` encoding.
fn encode_metadata(metadata: Option<&Value>) -> Vec<(String, String)> {
    let Some(Value::Object(map)) = metadata else {
        return Vec::new();
    };
    map.iter()
        .map(|(k, v)| (k.clone(), v.to_string()))
        .collect()
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
            statuses: status_enum_values(agg.status.as_ref()),
            has_browser_session: agg.has_browser_session.map(|v| v as u8),
            trace_types: trace_type_enum_values(agg.trace_type),
            internal_metadata: Vec::new(),
        };
        row.has_any_value().then_some(row)
    }

    /// Build a delta write for a metadata patch (`POST /v1/traces/metadata`).
    /// Only the patched keys are carried; the table's `maxMap` merges them into
    /// whatever the span batches contributed, so this needs no cumulative read.
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
        if metadata.is_empty() {
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
            statuses: Vec::new(),
            has_browser_session: None,
            trace_types: Vec::new(),
            internal_metadata: Vec::new(),
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
            metadata: Vec::new(),
            root_span_id: None,
            root_span_name: None,
            root_span_name_from_path: None,
            root_span_type: None,
            statuses: Vec::new(),
            has_browser_session: None,
            trace_types: Vec::new(),
            internal_metadata: Vec::new(),
        })
    }

    /// Whether this write carries anything at all — i.e. any non-NULL coalescing
    /// column or any non-identity aggregate.
    fn has_any_value(&self) -> bool {
        self.input.is_some()
            || self.output_hashes.is_some()
            || self.user_id.is_some()
            || self.session_id.is_some()
            || !self.metadata.is_empty()
            || self.root_span_id.is_some()
            || self.root_span_name.is_some()
            || self.root_span_name_from_path.is_some()
            || self.root_span_type.is_some()
            || !self.statuses.is_empty()
            || self.has_browser_session.is_some()
            || !self.trace_types.is_empty()
            || !self.internal_metadata.is_empty()
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
    // column would be a no-op, so the row is pure overhead.
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

    // `metadata` is the one accumulating column, so it's a per-key maxMap rather
    // than a coalescing value: each batch contributes only its OWN keys and the
    // table merges them, so no batch can drop keys an earlier one contributed.
    #[test]
    fn metadata_is_per_key_so_batches_only_contribute_their_own_keys() {
        let mut agg = empty_agg();
        agg.metadata = Some(json!({"k1": "one"}));
        let first = CHTraceStatic::from_aggregation(&agg, 0).unwrap();

        agg.metadata = Some(json!({"k2": "two"}));
        let second = CHTraceStatic::from_aggregation(&agg, 0).unwrap();

        assert_eq!(
            first.metadata,
            vec![("k1".to_string(), "\"one\"".to_string())]
        );
        assert_eq!(
            second.metadata,
            vec![("k2".to_string(), "\"two\"".to_string())],
            "the second delta must NOT restate k1; maxMap merges the two"
        );
    }

    #[test]
    fn metadata_values_are_raw_json_and_empty_maps_are_no_ops() {
        assert!(encode_metadata(None).is_empty());
        assert!(encode_metadata(Some(&json!({}))).is_empty());
        let encoded = encode_metadata(Some(&json!({"a": 1, "b": "x", "c": {"n": true}})));
        assert_eq!(encoded.iter().find(|(k, _)| k == "a").unwrap().1, "1");
        assert_eq!(encoded.iter().find(|(k, _)| k == "b").unwrap().1, "\"x\"");
        assert_eq!(
            encoded.iter().find(|(k, _)| k == "c").unwrap().1,
            "{\"n\":true}"
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

    // 'error' must stay sticky across deltas. A single coalescing column can't do
    // that (a later success batch would overwrite it), so statuses is a seen-value
    // union and the read path applies `has(statuses,'error')`.
    #[test]
    fn statuses_are_a_seen_value_union() {
        assert_eq!(
            status_enum_values(Some(&"error".to_string())),
            vec![STATUS_ENUM_ERROR]
        );
        assert_eq!(
            status_enum_values(Some(&"success".to_string())),
            vec![STATUS_ENUM_SUCCESS]
        );
        // Any other non-empty status is treated as non-error, matching
        // traces_agg's mapping.
        assert_eq!(
            status_enum_values(Some(&"ok".to_string())),
            vec![STATUS_ENUM_SUCCESS]
        );
        assert!(status_enum_values(Some(&String::new())).is_empty());
        assert!(status_enum_values(None).is_empty());
    }

    // trace_type DEFAULT (0) is the aggregation's "not yet known" value, so it's
    // never contributed — otherwise every batch would report DEFAULT and the read
    // side could not tell "nothing seen" from a real DEFAULT.
    #[test]
    fn trace_types_omit_default_and_out_of_range() {
        assert!(trace_type_enum_values(0).is_empty());
        assert_eq!(trace_type_enum_values(1), vec![1]);
        assert_eq!(trace_type_enum_values(3), vec![3]);
        assert!(
            trace_type_enum_values(4).is_empty(),
            "outside the DDL enum => dropped, an out-of-range int poisons reads"
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
        assert!(row.statuses.is_empty());
        assert!(row.trace_types.is_empty());
        assert!(row.metadata.is_empty());
    }
}
