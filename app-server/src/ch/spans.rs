use std::collections::HashMap;

use anyhow::Result;
use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{
        spans::{Span, SpanType},
        trace::TraceType,
    },
    traces::{prompt_hash::extract_system_message, spans::SpanUsage},
    utils::sanitize_string,
};

use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
    utils::chrono_to_nanoseconds,
};

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for SpanType {
    fn into(self) -> u8 {
        match self {
            SpanType::Default => 0,
            SpanType::LLM => 1,
            SpanType::Pipeline => 2,
            SpanType::Executor => 3,
            SpanType::Evaluator => 4,
            SpanType::Evaluation => 5,
            SpanType::Tool => 6,
            SpanType::HumanEvaluator => 7,
            SpanType::Cached => 8,
        }
    }
}

impl From<u8> for SpanType {
    fn from(value: u8) -> Self {
        match value {
            0 => SpanType::Default,
            1 => SpanType::LLM,
            2 => SpanType::Pipeline,
            3 => SpanType::Executor,
            4 => SpanType::Evaluator,
            5 => SpanType::Evaluation,
            6 => SpanType::Tool,
            7 => SpanType::HumanEvaluator,
            8 => SpanType::Cached,
            _ => SpanType::Default,
        }
    }
}

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for TraceType {
    fn into(self) -> u8 {
        match self {
            TraceType::DEFAULT => 0,
            TraceType::EVALUATION => 1,
            TraceType::EVENT => 2,
            TraceType::PLAYGROUND => 3,
        }
    }
}

/// Inverse of `Into<u8>`. The values are NOT declaration order
/// (EVALUATION=1, EVENT=2) — keep the two impls in sync.
impl From<u8> for TraceType {
    fn from(value: u8) -> Self {
        match value {
            1 => TraceType::EVALUATION,
            2 => TraceType::EVENT,
            3 => TraceType::PLAYGROUND,
            _ => TraceType::DEFAULT,
        }
    }
}

/// Field order matches the ClickHouse `spans` table column order so that
/// `SELECT *` deserializes correctly.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHSpan {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub name: String,
    pub span_type: u8,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub model: String,
    pub session_id: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub provider: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub user_id: String,
    // Default value is <null> for backwards compatibility or if path attribute is not present
    pub path: String,
    pub input: String,
    pub output: String,
    #[serde(default)]
    pub size_bytes: u64,
    pub status: String,
    pub attributes: String,
    pub request_model: String,
    pub response_model: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub parent_span_id: Uuid,
    pub trace_metadata: String,
    pub trace_type: u8,
    #[serde(default)]
    pub tags_array: Vec<String>,
    /// Span events stored as Array(Tuple(timestamp Int64, name String, attributes String))
    #[serde(default)]
    pub events: Vec<(i64, String, String)>,
    /// Hashes of deduplicated LLM input messages. When non-empty, `input` is
    /// left empty and the view reconstructs the input JSON array through
    /// `unique_content_dict`, keyed by the row's own group (`session_id`,
    /// else `trace_id`), falling back to the legacy project-scoped
    /// `deduped_content_dict` for rows written before migration 64.
    #[serde(default)]
    pub input_message_hashes: Vec<[u8; 32]>,
    /// 0-based positions into `input_message_hashes` for messages this span
    /// was first to introduce in its trace. Used by the search snippet query
    /// to scope input matching to the new-messages subset only. Trace-scoped
    /// even when storage is session-scoped — search "first occurrence per
    /// trace" semantic must be preserved.
    #[serde(default)]
    pub input_new_message_indices: Vec<u16>,
    /// Hashes of deduplicated LLM output messages. When non-empty, `output`
    /// is left empty and the view reconstructs the array the same way as
    /// `input`. Output of span A and input of span B in the same group
    /// collapse to the same row when content matches.
    #[serde(default)]
    pub output_message_hashes: Vec<[u8; 32]>,
    /// Trace-scoped first-occurrence positions for output messages. Mirrors
    /// `input_new_message_indices` semantics for the output array.
    #[serde(default)]
    pub output_new_message_indices: Vec<u16>,
    /// Single hash for the span's normalized tool-definitions array. Empty
    /// when the span has no tools or is a legacy span. Reconstructed by the
    /// view as a virtual `tool_definitions` column via the same dictionaries.
    #[serde(default)]
    pub tool_definitions_hash: [u8; 32],
    /// Prompt-cache / reasoning token breakdown, LLM spans only (the caller
    /// passes `SpanUsage::default()` for everything else). Spans ingested
    /// before these columns existed carry 0 here and the values only in
    /// `attributes` — readers fall back to `gen_ai.usage.*` for those.
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    #[serde(default)]
    pub reasoning_tokens: u64,
    /// PII byte ranges into `input` / `output` (`crate::pii_redactor::PiiMask`
    /// as `(start, end, label)`), filled only in `dual` PII mode; `spans_v1`
    /// splices placeholders over them under a masking policy. Cleared
    /// alongside `input` / `output` for dedup'd spans.
    #[serde(default)]
    pub input_masks: Vec<(u32, u32, String)>,
    #[serde(default)]
    pub output_masks: Vec<(u32, u32, String)>,
    /// The redactor screened this row (`crate::pii_redactor::SpanVerdict::pii_checked`);
    /// drives the masked branch of `spans_v1`.
    #[serde(default)]
    pub pii_checked: bool,
    /// `size_bytes` without content dedup: input, output and tool definitions
    /// at their raw JSON size. Set by `traces/processor.rs::charge_span_sizes`.
    #[serde(default)]
    pub original_size_bytes: u64,
}

impl CHSpan {
    pub fn from_db_span(span: &Span, usage: &SpanUsage, project_id: Uuid) -> Self {
        let session_id = span.attributes.session_id();
        let user_id = span.attributes.user_id();
        let path = span.attributes.flat_path();

        let span_input_string = span
            .input
            .as_ref()
            .map(|input| sanitize_string(&input.to_string()))
            .unwrap_or_default();

        let span_output_string = span
            .output
            .as_ref()
            .map(|output| sanitize_string(&output.to_string()))
            .unwrap_or_default();

        let trace_metadata = span.attributes.metadata().map_or(String::new(), |m| {
            serde_json::to_string(&m).unwrap_or_default()
        });

        CHSpan {
            span_id: span.span_id,
            parent_span_id: span.parent_span_id.unwrap_or(Uuid::nil()),
            name: span.name.clone(),
            span_type: span.span_type.clone().into(),
            start_time: chrono_to_nanoseconds(span.start_time),
            end_time: chrono_to_nanoseconds(span.end_time),
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens.max(0) as u64,
            cache_creation_input_tokens: usage.cache_creation_input_tokens.max(0) as u64,
            reasoning_tokens: usage.reasoning_tokens.max(0) as u64,
            input_cost: usage.input_cost,
            output_cost: usage.output_cost,
            total_cost: usage.total_cost,
            model: usage
                .response_model
                .clone()
                .or(usage.request_model.clone())
                .unwrap_or(String::from("")),
            request_model: usage.request_model.clone().unwrap_or(String::from("")),
            response_model: usage.response_model.clone().unwrap_or(String::from("")),
            session_id: session_id.unwrap_or(String::from("")),
            project_id: project_id,
            trace_id: span.trace_id,
            provider: usage.provider_name.clone().unwrap_or(String::from("")),
            user_id: user_id.unwrap_or(String::from("")),
            path: path.unwrap_or(String::from("")),
            input: span_input_string,
            output: span_output_string,
            status: span.status.clone().unwrap_or(String::from("")),
            size_bytes: span.size_bytes as u64,
            attributes: span.attributes.to_string(),
            trace_metadata,
            trace_type: span.attributes.trace_type().unwrap_or_default().into(),
            tags_array: span.attributes.tags(),
            events: span
                .events
                .iter()
                .map(|e| {
                    (
                        chrono_to_nanoseconds(e.timestamp),
                        e.name.clone(),
                        e.attributes.to_string(),
                    )
                })
                .collect(),
            input_message_hashes: Vec::new(),
            input_new_message_indices: Vec::new(),
            output_message_hashes: Vec::new(),
            output_new_message_indices: Vec::new(),
            tool_definitions_hash: [0u8; 32],
            input_masks: Vec::new(),
            output_masks: Vec::new(),
            pii_checked: false,
            original_size_bytes: 0,
        }
    }
}

impl ClickhouseInsertable for CHSpan {
    const TABLE: Table = Table::Spans;

    // Cap the server-side async-insert coalescing wait. The Rust batcher
    // already coalesces upstream; without this, CH parks at the adaptive
    // max (~1s) because per-flush byte size is well below the size cap.
    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Spans(items)
    }
}

#[derive(Row, Deserialize)]
struct TraceIdRow {
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
}

pub async fn get_trace_id_by_span_id(
    clickhouse: clickhouse::Client,
    span_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Uuid>> {
    let row = clickhouse
        .query("SELECT trace_id FROM spans WHERE span_id = ? AND project_id = ? LIMIT 1")
        .bind(span_id)
        .bind(project_id)
        .fetch_optional::<TraceIdRow>()
        .await?;

    Ok(row.map(|r| r.trace_id))
}

/// One LLM/CACHED span of a replay trace, with the reconstructed input and the
/// raw output-bearing attributes needed by the debugger warmup (LAM-1715).
///
/// `input` is the reconstructed message-array JSON from `spans_v1` (dedup'd
/// spans store an empty `spans.input`; the view rebuilds it from
/// `unique_content_dict` / `deduped_content_dict`). `raw_response`, `gen_ai_output`
/// and `finish_reason` are extracted from the raw `attributes` blob via
/// `JSONExtractRaw`, which yields an empty string when the key is absent.
///
/// Rows arrive in `start_time` ASC order from the query, so earliest-wins
/// dedup is satisfied by iteration order — no start_time field is needed here.
#[derive(Row, Deserialize, Debug, Clone)]
pub struct DebugCacheSpanRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub input: String,
    /// output column
    pub output: String,
    /// `lmnr.sdk.raw.response` attribute (preferred output source). Empty if absent.
    pub raw_response: String,
    /// `gen_ai.output.messages` attribute (fallback output source). Empty if absent.
    pub gen_ai_output: String,
    /// `gen_ai.response.finish_reason` attribute (single string). Empty if absent.
    pub finish_reason: String,
    /// `gen_ai.response.finish_reasons` attribute (JSON array). Empty if absent.
    pub finish_reasons: String,
    /// `gen_ai.response.model` attribute. Empty if absent.
    pub model: String,
}

/// Fetch one page of a trace's LLM + CACHED spans in `start_time` ASC order,
/// reading reconstructed input + output attributes from `spans_v1`.
///
/// `spans_v1` is a parameterized view (`WHERE project_id = {project_id:UUID}`),
/// so the project scope is passed as a query param rather than a WHERE clause.
/// The debugger replays on behalf of the pipeline, not a viewer, so it reads
/// with the unrestricted policy.
pub async fn query_debug_cache_spans_page(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    limit: u32,
    offset: u32,
) -> Result<Vec<DebugCacheSpanRow>> {
    let rows = clickhouse
        .query(
            "SELECT
                span_id,
                input,
                output,
                JSONExtractRaw(attributes, 'lmnr.sdk.raw.response') AS raw_response,
                JSONExtractRaw(attributes, 'gen_ai.output.messages') AS gen_ai_output,
                JSONExtractRaw(attributes, 'gen_ai.response.finish_reason') AS finish_reason,
                JSONExtractRaw(attributes, 'gen_ai.response.finish_reasons') AS finish_reasons,
                JSONExtractString(attributes, 'gen_ai.response.model') AS model
            FROM spans_v1(project_id={project_id:UUID}, policy='{}')
            WHERE trace_id = {trace_id:UUID}
              AND span_type IN ('LLM', 'CACHED')
            ORDER BY start_time ASC
            LIMIT {limit:UInt32} OFFSET {offset:UInt32}",
        )
        .param("project_id", project_id)
        .param("trace_id", trace_id)
        .param("limit", limit)
        .param("offset", offset)
        .fetch_all::<DebugCacheSpanRow>()
        .await?;

    Ok(rows)
}

/// Dictionary lookup for one content hash, mirroring `spans_v0`: the
/// group-scoped `unique_content_dict` first, the legacy project-scoped
/// `deduped_content_dict` only when `unique_content` has no row. `if` rather
/// than `coalesce`/`ifNull`, which evaluate every branch eagerly: both dicts
/// are `COMPLEX_KEY_CACHE`, so a `deduped_content_dict` lookup for a hash that
/// only `unique_content` has (the common case post-migration) is a cache miss
/// that queries the legacy table. `dedup_group` is the query's `WITH` alias.
pub(crate) fn content_lookup(hash_expr: &str) -> String {
    format!(
        "if(
            isNull(dictGetOrNull('unique_content_dict', 'content', tuple(project_id, dedup_group, {hash_expr}))),
            dictGetOrDefault('deduped_content_dict', 'content', tuple(project_id, {hash_expr}), 'null'),
            dictGetOrDefault('unique_content_dict', 'content', tuple(project_id, dedup_group, {hash_expr}), 'null')
        )"
    )
}

#[derive(Row, Deserialize)]
struct FirstInputRow {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    /// The input is stored as message hashes.
    deduped: bool,
    /// The first message when `deduped`, else the whole input.
    first_input: String,
}

#[derive(Row, Deserialize)]
struct SpanInputRow {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    input: String,
}

/// The system prompt text of the given spans, keyed by span id. Spans not
/// stored yet, or whose input has no system message, are absent.
///
/// A dedup'd span resolves only its first message, where the system message
/// sits: rebuilding the whole input through `spans_v1` costs one dict lookup
/// per message, and a long session's hundreds of cold lookups exceed the
/// dicts' `QUERY_WAIT_TIMEOUT_MILLISECONDS`. Reading raw `spans` returns what
/// `spans_v1` does under the unrestricted policy. The few spans whose first
/// message is not the system one are rebuilt whole.
pub async fn fetch_system_prompts(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    refs: &[(Uuid, Uuid)],
) -> Result<HashMap<Uuid, String>> {
    if refs.is_empty() {
        return Ok(HashMap::new());
    }
    let trace_ids: Vec<Uuid> = refs.iter().map(|(t, _)| *t).collect();
    let span_ids: Vec<Uuid> = refs.iter().map(|(_, s)| *s).collect();
    let rows = clickhouse
        .query(&format!(
            "WITH if(session_id != '', session_id, toString(trace_id)) AS dedup_group
             SELECT span_id,
                    notEmpty(input_message_hashes) AS deduped,
                    if(deduped, {}, input) AS first_input
             FROM spans
             WHERE project_id = {{project_id:UUID}}
               AND trace_id IN {{trace_ids:Array(UUID)}}
               AND span_id IN {{span_ids:Array(UUID)}}",
            content_lookup("input_message_hashes[1]")
        ))
        .param("project_id", project_id)
        .param("trace_ids", &trace_ids)
        .param("span_ids", &span_ids)
        .fetch_all::<FirstInputRow>()
        .await?;

    let mut prompts = HashMap::with_capacity(rows.len());
    let mut rebuild = Vec::new();
    for row in rows {
        match first_input_system_prompt(&row.first_input, row.deduped) {
            Some(text) => {
                prompts.insert(row.span_id, text);
            }
            None if row.deduped => rebuild.push(row.span_id),
            None => {}
        }
    }
    if rebuild.is_empty() {
        return Ok(prompts);
    }
    let rows = clickhouse
        .query(
            "SELECT span_id, input
             FROM spans_v1(project_id={project_id:UUID}, policy='{}')
             WHERE trace_id IN {trace_ids:Array(UUID)}
               AND span_id IN {span_ids:Array(UUID)}",
        )
        .param("project_id", project_id)
        .param("trace_ids", &trace_ids)
        .param("span_ids", &rebuild)
        .fetch_all::<SpanInputRow>()
        .await?;
    for row in rows {
        if let Some(text) = input_system_prompt(&row.input) {
            prompts.insert(row.span_id, text);
        }
    }
    Ok(prompts)
}

/// A dedup'd first message is one array element, so it is read as a
/// one-message input.
fn first_input_system_prompt(first_input: &str, deduped: bool) -> Option<String> {
    if !deduped {
        return input_system_prompt(first_input);
    }
    let message = serde_json::from_str::<Value>(first_input).ok()?;
    extract_system_message(&Value::Array(vec![message])).map(|(text, _)| text)
}

fn input_system_prompt(input: &str) -> Option<String> {
    let input = serde_json::from_str::<Value>(input).ok()?;
    extract_system_message(&input).map(|(text, _)| text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_deduped_system_message_is_read_from_the_first_message() {
        let first = r#"{"role":"system","content":"You are a GTM assistant."}"#;
        assert_eq!(
            first_input_system_prompt(first, true).as_deref(),
            Some("You are a GTM assistant.")
        );
    }

    #[test]
    fn a_deduped_first_message_from_the_user_needs_a_rebuild() {
        let first = r#"{"role":"user","content":"hi"}"#;
        assert_eq!(first_input_system_prompt(first, true), None);
    }

    #[test]
    fn an_input_stored_whole_is_searched_for_its_system_message() {
        let input = r#"{"messages":[{"role":"user","content":"hi"},{"role":"system","content":"Be brief."}]}"#;
        assert_eq!(
            first_input_system_prompt(input, false).as_deref(),
            Some("Be brief.")
        );
    }
}
