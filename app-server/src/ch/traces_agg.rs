use anyhow::Result;
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
use crate::traces::input_extraction::metadata::USER_TASK_METADATA_KEY;

/// `statuses` Enum8 values; must match the DDL enum
/// `Enum8('success' = 1, 'error' = 2)` in the traces_agg migration.
const STATUS_ENUM_SUCCESS: i8 = 1;
const STATUS_ENUM_ERROR: i8 = 2;

/// One per-batch partial row for the `traces_agg` AggregatingMergeTree table.
/// Field order MUST match the CREATE TABLE column order exactly (RowBinary
/// serialization is positional). `created_at` and the reserved
/// `internal_metadata` column are deliberately absent: the insert names
/// its columns, so the server fills their defaults. The extracted agent
/// input/output live in the supplementary `trace_agent_input`/`_output`
/// RMT tables, not here.
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
        // Extracted input lives in the `trace_agent_input` supplementary
        // table, not the traces_agg maxMap. The metadata patch that carries
        // this key is written to `traces_replacing` (the current read path)
        // AND flows here via `from_patched_trace`, so strip it to keep the
        // two stores from diverging. (Output has no metadata-key
        // equivalent to strip — see `input_extraction::metadata`.)
        .filter(|(k, _)| k.as_str() != USER_TASK_METADATA_KEY)
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
    ///
    /// A patch that beats the trace's real span batch creates a stub row with
    /// `now()` placeholder start/end times (`Trace::is_stub`). In
    /// `traces_replacing`, the later aggregation upsert explicitly discards a
    /// stub's placeholder times before applying `LEAST`/`GREATEST`, so the
    /// placeholder is harmless there. `traces_agg`'s `end_time` is a
    /// `SimpleAggregateFunction(max, ...)` with no such correction — once a
    /// too-late placeholder is merged in, no later, earlier, correct partial
    /// can ever lower it back down. So for a stub row this emits `end_time =
    /// 0` (the `max` identity) instead of the placeholder, making this
    /// partial a no-op on `end_time` until a real span batch's own partial
    /// supplies the true value.
    ///
    /// `start_time` can't use the `min` identity (epoch 0 / `i64::MAX`) the
    /// same way: `traces_agg` is `PARTITION BY toYYYYMM(start_time)`, so an
    /// epoch or far-future value would land this partial in a different
    /// partition than the real span batch's — and the two partials would
    /// never merge together. Instead use `now_ns + 1h`: any real trace's
    /// `start_time` is at or before ingest time, so `min` still always picks
    /// the real value once it arrives, while staying in the same (or an
    /// adjacent) monthly partition as `now_ns` so the merge is local.
    pub fn from_patched_trace(trace: &Trace, now_ns: i64) -> Self {
        const STUB_START_TIME_OFFSET_NS: i64 = 60 * 60 * 1_000_000_000;

        let (start_time, end_time) = if trace.is_stub() {
            (now_ns + STUB_START_TIME_OFFSET_NS, 0)
        } else {
            (
                trace
                    .start_time()
                    .map(chrono_to_nanoseconds)
                    .unwrap_or(now_ns),
                trace.end_time().map(chrono_to_nanoseconds).unwrap_or(now_ns),
            )
        };

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
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            statuses: Vec::new(),
            trace_types: Vec::new(),
        }
    }
}

/// Re-aggregated cumulative state of one trace, read back from `traces_agg`
/// after this batch's partials have landed. Mirrors the subset of
/// `traces_agg_v0` that signal trigger filters evaluate — the derived
/// `status` / `trace_type` / `top_span_name` expressions are computed in SQL
/// (see `fetch_trace_states`) so precedence stays in one place.
#[derive(Row, Deserialize, Debug, Clone)]
pub struct CHTraceState {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub num_spans: u64,
    pub session_id: String,
    pub user_id: String,
    pub status: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub top_span_id: Uuid,
    pub top_span_name: String,
    pub trace_type: i16,
    pub tags: Vec<String>,
    pub span_names: Vec<String>,
}

/// Fetch the cumulative post-merge state of `trace_ids` within one project.
///
/// Signal trigger filters compare RUNNING TOTALS and set-once fields
/// (`span_names` from earlier batches, `top_span_id` for `root_span_finished`),
/// so they cannot run on a single batch's delta — this read-back is what
/// `upsert_trace_statistics_batch`'s `RETURNING` used to provide. Scoped by
/// `(project_id, id)`, which is the table's ORDER BY, so no time bound is
/// needed (and must not be added: partials of one trace can straddle monthly
/// partitions).
///
/// `status` deliberately resolves to an EMPTY string when no partial carried a
/// status, unlike `traces_agg_v0`'s two-value `success`/`error` contract: the
/// Postgres column was NULL in that case, and a filter on `status = 'success'`
/// must keep not matching a trace whose spans never reported one.
pub async fn fetch_trace_states(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> Result<Vec<CHTraceState>> {
    if trace_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = trace_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query_str = format!(
        "SELECT
            id,
            sum(input_tokens) AS input_tokens,
            sum(output_tokens) AS output_tokens,
            sum(total_tokens) AS total_tokens,
            sum(input_cost) AS input_cost,
            sum(output_cost) AS output_cost,
            sum(total_cost) AS total_cost,
            sum(num_spans) AS num_spans,
            CAST(max(session_id), 'String') AS session_id,
            CAST(max(user_id), 'String') AS user_id,
            if(
                empty(groupUniqArrayArray(statuses)),
                '',
                if(has(groupUniqArrayArray(statuses), 'error'), 'error', 'success')
            ) AS status,
            CAST(max(top_span_id), 'UUID') AS top_span_id,
            substring(max(top_span_name), 2) AS top_span_name,
            toInt16(multiIf(
                has(groupUniqArrayArray(trace_types), 'PLAYGROUND'), 3,
                has(groupUniqArrayArray(trace_types), 'EVALUATION'), 1,
                has(groupUniqArrayArray(trace_types), 'EVENT'), 2,
                0
            )) AS trace_type,
            groupUniqArrayArray(tags) AS tags,
            groupUniqArrayArray(span_names) AS span_names
         FROM traces_agg
         WHERE project_id = ? AND id IN ({placeholders})
         GROUP BY id"
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);
    for trace_id in trace_ids {
        query = query.bind(trace_id);
    }

    Ok(query.fetch_all::<CHTraceState>().await?)
}

/// Whether any partial exists for `(project_id, trace_id)`.
///
/// Backs the `POST /v1/traces/metadata` 404. No time bound and no GROUP BY —
/// `(project_id, id)` is the table's ORDER BY, so this prunes to the relevant
/// granules and a single matching partial is enough to prove the trace exists.
pub async fn trace_exists(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<bool> {
    let count = clickhouse
        .query("SELECT count() FROM traces_agg WHERE project_id = ? AND id = ? LIMIT 1")
        .bind(project_id)
        .bind(trace_id)
        .fetch_one::<u64>()
        .await?;

    Ok(count > 0)
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
    use chrono::Utc;
    use serde_json::json;

    use super::*;

    #[test]
    fn from_patched_trace_stub_row_avoids_placeholder_times() {
        // A patch that beats the real span batch creates a stub row
        // (span_names still NULL) with `now()` placeholder start/end times.
        // Those placeholders must never ride into traces_agg's min/max
        // aggregates as-is — otherwise a too-late placeholder `end_time`
        // would permanently inflate the aggregate via `max`, since no later,
        // correct, earlier partial can ever lower it back down.
        let now_ns = 1_000_000_000;
        let trace = Trace::test_new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some(Utc::now()),
            Some(Utc::now()),
            None, // span_names: None => stub
        );
        assert!(trace.is_stub());

        let row = CHTraceAgg::from_patched_trace(&trace, now_ns);
        // end_time uses the true `max` identity: harmless no-op until a real
        // span batch supplies the actual value.
        assert_eq!(row.end_time, 0, "max identity for end_time");
        // start_time can't use the `min` identity (epoch/i64::MAX) because
        // traces_agg partitions on toYYYYMM(start_time) — an epoch or
        // far-future value would land this partial in a different partition
        // than the real span batch's, and the two would never merge. Instead
        // it's nudged 1h into the future of ingest time: still a `min`
        // no-op against any real (past-or-present) start_time, while staying
        // in the same/adjacent monthly partition.
        assert_eq!(row.start_time, now_ns + 60 * 60 * 1_000_000_000);
    }

    #[test]
    fn from_patched_trace_real_row_keeps_its_times() {
        // A patch against an already-real row (span_names populated by a
        // prior aggregation upsert) must propagate the real times verbatim —
        // only the stub case is special-cased.
        let start = Utc::now();
        let end = Utc::now();
        let trace = Trace::test_new(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some(start),
            Some(end),
            Some(json!({"some_span": true})),
        );
        assert!(!trace.is_stub());

        let row = CHTraceAgg::from_patched_trace(&trace, 0);
        assert_eq!(row.start_time, chrono_to_nanoseconds(start));
        assert_eq!(row.end_time, chrono_to_nanoseconds(end));
    }

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
    fn extracted_input_key_is_stripped_from_metadata() {
        // The patch that carries this key also lands in traces_replacing;
        // here (traces_agg) it must NOT appear — input lives in the
        // supplementary `trace_agent_input` table. Output has no metadata
        // key at all (LAM-1953 rework: stored as hashes, never folded into
        // `traces_replacing.metadata`), so there's nothing to strip for it.
        let metadata = json!({
            "user_key": "keep",
            "lmnr_user_task": "the task",
        });
        let encoded = encode_metadata(Some(&metadata));
        assert!(encoded.iter().any(|(k, _)| k == "user_key"));
        assert!(!encoded.iter().any(|(k, _)| k == "lmnr_user_task"));
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
