use std::collections::HashSet;

use anyhow::Result;
use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::traces::TraceAggregation;
use super::utils::chrono_to_nanoseconds;
use super::{ClickhouseInsertable, DataPlaneBatch, Table};
use crate::traces::input_extraction::metadata::USER_TASK_METADATA_KEY;

/// Whether any partial exists for the trace. Existence probe on the
/// `(project_id, id)` primary key: no GROUP BY (a trace is present iff it has at
/// least one partial) and `SELECT 1 … LIMIT 1` so the scan short-circuits on the
/// first match instead of counting every partial. `fetch_optional` maps "no row"
/// to `None` rather than erroring. Backs the `POST /v1/traces/metadata` 404 gate.
pub async fn trace_exists(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
) -> Result<bool> {
    let found = clickhouse
        .query("SELECT 1 FROM traces_agg WHERE project_id = ? AND id = ? LIMIT 1")
        .bind(project_id)
        .bind(trace_id)
        .fetch_optional::<u8>()
        .await?;
    Ok(found.is_some())
}

/// `statuses` Enum8 values; must match the DDL enum
/// `Enum8('success' = 1, 'error' = 2)` in the traces_agg migration.
const STATUS_ENUM_SUCCESS: i8 = 1;
const STATUS_ENUM_ERROR: i8 = 2;

/// One per-batch partial row for the `traces_agg` AggregatingMergeTree table.
/// Field order MUST match the CREATE TABLE column order exactly (RowBinary
/// serialization is positional). `created_at` is deliberately absent: the insert
/// names its columns, so the server fills its default. The static trace columns
/// (session/user id, root span, browser session) now live in `traces_static`;
/// `metadata` is kept here so the pre-`traces_static` values stay restorable.
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
    pub tags: Vec<String>,
    pub num_spans: u64,
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
    /// This batch's signal events only — the arrays concatenate across a
    /// trace's partials.
    /// Tuple field order matches the `traces_agg.signal_events` DDL.
    pub signal_events: Vec<CHTraceSignalEvent>,
    /// L1 leaf cluster ids for this trace's signal events. L0 is excluded
    /// because those rows are deleted on promotion. Ancestors are derived
    /// at read time from `clusters_dict.path`.
    ///
    /// `uuid_vec` is required: `Uuid`'s own `Serialize` writes 17
    /// length-prefixed bytes per element in RowBinary instead of 16.
    #[serde(with = "crate::ch::utils::uuid_vec")]
    pub cluster_ids: Vec<Uuid>,
}

/// One element of `traces_agg.signal_events`. Field order is the DDL tuple.
///
/// Deliberately minimal, since every field is paid for on each of the trace's
/// events: the signal's `name` is derivable from `signal_id`, and the event's
/// time is the trace's own `end_time`, already a column on the row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CHTraceSignalEvent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub severity: u8,
    /// The event's JSON payload, denormalized so a trace-scoped read does not
    /// have to join `signal_events` (ordered by signal_id, so it cannot prune
    /// on trace_id at all). Copied verbatim from `signal_events.payload`, never
    /// re-serialized, so the two always render the same bytes.
    pub payload: String,
}

fn encode_metadata(metadata: Option<&Value>) -> Vec<(String, String)> {
    let Some(Value::Object(map)) = metadata else {
        return Vec::new();
    };
    let mut pairs: Vec<(String, String)> = map
        .iter()
        // Extracted input lives in the `trace_agent_input` supplementary
        // table, not the traces_agg maxMap. The metadata patch that carries
        // this key is written to `traces_replacing` (the current read path)
        // AND flows here via `from_patched_trace`, so strip it to keep the
        // two stores from diverging. (Output has no metadata-key
        // equivalent to strip — see `input_extraction::metadata`.)
        .filter(|(k, _)| k.as_str() != USER_TASK_METADATA_KEY)
        .map(|(k, v)| (k.clone(), v.to_string()))
        .collect();
    // `serde_json` runs with `preserve_order`, so this Map's key order is
    // whatever the `HashMap` it was built from happened to yield — different on
    // every rebuild. Sort so a retried flush serializes the same bytes and CH's
    // insert-block dedup can recognise it. `maxMap` merges per key, so key order
    // is irrelevant to the stored value.
    pairs.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));
    pairs
}

/// A `HashSet`'s iteration order is reseeded per instance, so the same batch
/// rebuilt on a retry would emit these arrays in a different order and lose CH's
/// insert-block dedup. Both columns are `groupUniqArrayArray`, which is
/// order-independent, so sorting costs nothing at read.
fn sorted_array(values: &HashSet<String>) -> Vec<String> {
    let mut out: Vec<String> = values.iter().cloned().collect();
    out.sort_unstable();
    out
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
            tags: sorted_array(&agg.tags),
            num_spans: agg.num_spans as u64,
            span_names: sorted_array(&agg.span_names),
            cache_read_input_tokens: agg.cache_read_input_tokens as u64,
            cache_creation_input_tokens: agg.cache_creation_input_tokens as u64,
            reasoning_tokens: agg.reasoning_tokens as u64,
            statuses: status_enum_values(agg.status.as_deref()),
            trace_types: vec![trace_type_enum_value(agg.trace_type)],
            signal_events: Vec::new(),
            cluster_ids: Vec::new(),
        }
    }

    /// Build a partial row for a metadata patch (`POST /v1/traces/metadata`)
    /// straight from the patch. Every aggregate is an identity except
    /// `metadata` (the patched object, unversioned — `maxMap`'s per-key value
    /// comparison is arbitrary from an application standpoint, so this is
    /// best-effort, not LWW) and `num_spans` (+1, paying for the virtual
    /// metadata-only span that drove the patch).
    ///
    /// `end_time` is `0`, the `max` identity: a patch learns nothing about the
    /// trace's end, and `max` can never be lowered back down once a too-late
    /// value merges in.
    ///
    /// `start_time` can't use the `min` identity (epoch 0 / `i64::MAX`) the
    /// same way: `traces_agg` is `PARTITION BY toYYYYMM(start_time)`, so an
    /// epoch or far-future value would land this partial in a different
    /// partition than the span batch's, and the two would never merge.
    /// `start_time` is the caller's resolved trace start
    /// (`processor::resolve_static_start_times`); with none resolvable it
    /// passes `now_ns + 1h`, which is still a `min` no-op against any real
    /// (past-or-present) start while staying in the same or an adjacent
    /// monthly partition so the merge stays local.
    pub fn from_metadata_patch(
        project_id: Uuid,
        trace_id: Uuid,
        metadata: Option<&Value>,
        start_time: i64,
    ) -> Self {
        let mut row = Self::zero_sum_partial(project_id, trace_id, start_time);
        row.metadata = encode_metadata(metadata);
        row.num_spans = 1;
        row
    }

    /// Identity aggregates everywhere except identity + `start_time`. Used by
    /// writers that only know one fact about a trace (a signal event, a
    /// cluster id) so they do not have to copy the full zero-delta by hand.
    /// `start_time` must be the trace's real start: it is `min` AND the
    /// partition key, and there is no "unknown" value that stays in-partition.
    pub fn zero_sum_partial(project_id: Uuid, trace_id: Uuid, start_time_ns: i64) -> Self {
        CHTraceAgg {
            id: trace_id,
            project_id,
            start_time: start_time_ns,
            end_time: 0,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            metadata: Vec::new(),
            tags: Vec::new(),
            num_spans: 0,
            span_names: Vec::new(),
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            statuses: Vec::new(),
            trace_types: Vec::new(),
            signal_events: Vec::new(),
            cluster_ids: Vec::new(),
        }
    }
}

/// A patch that carries no resolvable trace start is nudged an hour past ingest
/// time so it stays a `min` no-op while landing in the same or an adjacent
/// monthly partition as the span batch's partial.
pub const PATCH_START_TIME_OFFSET_NS: i64 = 60 * 60 * 1_000_000_000;

impl ClickhouseInsertable for CHTraceAgg {
    const TABLE: Table = Table::TracesAgg;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        super::configure_hot_ingest_insert(insert)
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TracesAgg(items)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // A patch learns nothing about the trace's end, so `end_time` must be the
    // `max` identity — `max` can never be lowered again once a too-late value
    // merges in. `start_time` takes the caller's resolved trace start so the
    // partial lands in the span batch's partition.
    #[test]
    fn metadata_patch_uses_max_identity_end_and_the_resolved_start() {
        let resolved_start = 1_700_000_000_000_000_000;
        let row = CHTraceAgg::from_metadata_patch(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some(&json!({"k": "v"})),
            resolved_start,
        );
        assert_eq!(row.end_time, 0, "max identity for end_time");
        assert_eq!(row.start_time, resolved_start);
        // The +1 pays for the virtual metadata-only span that drove the patch.
        assert_eq!(row.num_spans, 1);
        // Every other aggregate is an identity.
        assert_eq!(row.total_tokens, 0);
        assert_eq!(row.total_cost, 0.0);
        assert!(row.statuses.is_empty());
        assert!(row.trace_types.is_empty());
        assert!(row.span_names.is_empty());
        assert!(row.signal_events.is_empty());
        assert!(row.cluster_ids.is_empty());
    }

    #[test]
    fn zero_sum_partial_is_identities_except_start_time() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let start = 1_700_000_000_000_000_000;
        let row = CHTraceAgg::zero_sum_partial(project_id, trace_id, start);
        assert_eq!(row.project_id, project_id);
        assert_eq!(row.id, trace_id);
        assert_eq!(row.start_time, start);
        assert_eq!(row.end_time, 0);
        assert_eq!(row.num_spans, 0);
        assert_eq!(row.total_tokens, 0);
        assert_eq!(row.total_cost, 0.0);
        assert!(row.signal_events.is_empty());
        assert!(row.cluster_ids.is_empty());
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

    // ClickHouse insert-block dedup is a content checksum, so every column
    // built from a `HashMap`/`HashSet` has to be ordered by its own contents —
    // otherwise a retried flush emits different bytes and is written twice.
    #[test]
    fn hash_ordered_columns_are_sorted_for_block_dedup() {
        let metadata = json!({"zeta": 1, "alpha": 2, "mu": 3});
        let keys: Vec<String> = encode_metadata(Some(&metadata))
            .into_iter()
            .map(|(k, _)| k)
            .collect();
        assert_eq!(keys, vec!["alpha", "mu", "zeta"]);

        let mut agg = TraceAggregation::empty(Uuid::new_v4(), Uuid::new_v4());
        agg.tags = ["prod", "beta", "llm"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        agg.span_names = ["outer", "inner", "middle"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let row = CHTraceAgg::from_aggregation(&agg, 0);
        assert_eq!(row.tags, vec!["beta", "llm", "prod"]);
        assert_eq!(row.span_names, vec!["inner", "middle", "outer"]);
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

/// Round-trips `CHTraceAgg` through a real ClickHouse to catch RowBinary
/// layout drift. `#[ignore]`d: it needs a server, and every other test in this
/// crate is hermetic.
///
/// Worth keeping because this failure mode is silent. `main.rs` disables
/// validation, so writes carry no names or types; a field whose Rust type
/// serialises to a different byte width than its column just desynchronises the
/// stream, and the server reports `CANNOT_READ_ALL_DATA` at some later row,
/// blaming whichever column straddled the end of the buffer. Nothing points at
/// the offending field. `cluster_ids` shipped exactly that bug: `Vec<Uuid>`
/// without `uuid_vec` wrote 17 bytes per element instead of 16.
///
///   docker compose -f docker-compose-local-dev.yml up -d clickhouse
///   cargo test --features signals traces_agg_row_layout -- --ignored --nocapture
#[cfg(test)]
mod live_ch {
    use super::*;
    use uuid::Uuid;

    const DB: &str = "lmnr_traces_agg_layout_test";

    /// Read side needs the same UUID handling as the write side.
    #[derive(Row, Deserialize)]
    struct IdsRow {
        #[serde(with = "clickhouse::serde::uuid")]
        cluster_id: Uuid,
        #[serde(with = "clickhouse::serde::uuid")]
        event_id: Uuid,
    }

    fn client(database: &str) -> clickhouse::Client {
        clickhouse::Client::default()
            .with_url(std::env::var("CLICKHOUSE_URL").unwrap_or("http://localhost:8123".into()))
            .with_user(std::env::var("CLICKHOUSE_USER").unwrap_or("ch_user".into()))
            .with_password(std::env::var("CLICKHOUSE_PASSWORD").unwrap_or("ch_passwd".into()))
            .with_database(database)
            // Mirrors main.rs: plain RowBinary, which is what makes a width
            // mismatch silent rather than a clean type error.
            .with_validation(false)
            .with_setting("async_insert", "1")
            .with_setting("wait_for_async_insert", "1")
    }

    #[tokio::test]
    #[ignore = "needs a live ClickHouse"]
    async fn traces_agg_row_layout_round_trips() {
        let admin = client("default");
        admin
            .query(&format!("CREATE DATABASE IF NOT EXISTS {DB}"))
            .execute()
            .await
            .unwrap();
        let c = client(DB);
        c.query("DROP TABLE IF EXISTS traces_agg")
            .execute()
            .await
            .unwrap();
        // Column types mirror the deployed table; only the engine differs
        // (Cloud runs the Shared* variant).
        c.query(
            "CREATE TABLE traces_agg (
                id UUID, project_id UUID,
                start_time SimpleAggregateFunction(min, DateTime64(9,'UTC')),
                end_time SimpleAggregateFunction(max, DateTime64(9,'UTC')),
                input_tokens SimpleAggregateFunction(sum, Int64),
                output_tokens SimpleAggregateFunction(sum, Int64),
                total_tokens SimpleAggregateFunction(sum, Int64),
                input_cost SimpleAggregateFunction(sum, Float64),
                output_cost SimpleAggregateFunction(sum, Float64),
                total_cost SimpleAggregateFunction(sum, Float64),
                metadata SimpleAggregateFunction(maxMap, Map(String,String)),
                session_id SimpleAggregateFunction(max, String),
                user_id SimpleAggregateFunction(max, String),
                top_span_id SimpleAggregateFunction(max, UUID),
                top_span_name SimpleAggregateFunction(max, String),
                top_span_type SimpleAggregateFunction(max, UInt8),
                tags SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
                num_spans SimpleAggregateFunction(sum, UInt64),
                has_browser_session SimpleAggregateFunction(max, UInt8),
                span_names SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
                cache_read_input_tokens SimpleAggregateFunction(sum, UInt64),
                cache_creation_input_tokens SimpleAggregateFunction(sum, UInt64),
                reasoning_tokens SimpleAggregateFunction(sum, UInt64),
                created_at SimpleAggregateFunction(min, DateTime64(9,'UTC')) DEFAULT now64(9),
                statuses SimpleAggregateFunction(groupUniqArrayArray, Array(Enum8('success'=1,'error'=2))),
                trace_types SimpleAggregateFunction(groupUniqArrayArray, Array(Enum8('DEFAULT'=0,'EVALUATION'=1,'EVENT'=2,'PLAYGROUND'=3))),
                internal_metadata SimpleAggregateFunction(maxMap, Map(String,String)),
                signal_events SimpleAggregateFunction(groupArrayArray, Array(Tuple(event_id UUID, signal_id UUID, severity UInt8, payload String))),
                cluster_ids SimpleAggregateFunction(groupUniqArrayArray, Array(UUID))
            ) ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(start_time) ORDER BY (project_id, id)",
        )
        .execute()
        .await
        .unwrap();

        let project_id = Uuid::new_v4();
        // Several rows: a one-byte drift only trips the parser a few rows in.
        let expected: Vec<(Uuid, Uuid, Uuid)> = (0..5)
            .map(|_| (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()))
            .collect();
        let mut insert = c.insert::<CHTraceAgg>("traces_agg").await.unwrap();
        for (trace_id, cluster_id, event_id) in &expected {
            let mut row =
                CHTraceAgg::zero_sum_partial(project_id, *trace_id, 1_700_000_000_000_000_000);
            row.cluster_ids = vec![*cluster_id];
            row.signal_events = vec![CHTraceSignalEvent {
                event_id: *event_id,
                signal_id: Uuid::new_v4(),
                severity: 1,
                payload: "{}".to_string(),
            }];
            insert.write(&row).await.unwrap();
        }
        insert
            .end()
            .await
            .expect("RowBinary layout drifted from the table");

        for (trace_id, cluster_id, event_id) in &expected {
            let got = c
                .query(
                    "SELECT arrayJoin(cluster_ids) AS cluster_id, \
                            tupleElement(arrayJoin(signal_events), 1) AS event_id \
                     FROM traces_agg WHERE project_id = ? AND id = ?",
                )
                .bind(project_id)
                .bind(trace_id)
                .fetch_one::<IdsRow>()
                .await
                .unwrap();
            let (got_cluster, got_event) = (got.cluster_id, got.event_id);
            // Equality, not just well-formedness: a wrong byte ORDER still
            // yields a syntactically valid UUID.
            assert_eq!(got_cluster, *cluster_id, "cluster_id byte order drifted");
            assert_eq!(got_event, *event_id, "signal_events tuple drifted");
        }

        admin
            .query(&format!("DROP DATABASE IF EXISTS {DB}"))
            .execute()
            .await
            .unwrap();
    }
}
