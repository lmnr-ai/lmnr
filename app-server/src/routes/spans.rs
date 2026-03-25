use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::spans::{Span, SpanType},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{SPANS_INDEX_ID, client::QuickwitClient},
    routes::{ResponseResult, error::Error, search_snippets},
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, spans::SpanAttributes},
};

const DEFAULT_SEARCH_MAX_HITS: usize = 500;
const DEFAULT_SEARCH_TIME_RANGE: chrono::Duration = chrono::Duration::days(7);

// TODO: maybe remove all punctuation similar to the default tokenizer in the index?
const QUICKWIT_RESERVED_CHARACTERS: &[char] = &['"', '?', '`', '~', '!', '\\'];
// Quickwit documentation is very brief on this, it lists all of the reserved characters
// with a note that you can escape them with a backslash. However, some of them break
// the query parsing when escaped, so we need to remove them.
const QUICKWIT_RESERVED_UNESCAPABLE_CHARACTERS: &[char] = &[
    ':', '^', '{', '}', '[', ']', '(', ')',
    // The below characters won't break parsing but change the meaning of the query
    // even when escaped, so safest to remove them.
    '+', '\u{002D}', // - hyphen-minus
    '\u{2013}', // – en dash
    '\u{2014}', // — em dash
];

const PARALLEL_SNIPPETS_QUERIES: usize = 32;

/// Escape special characters for Quickwit query syntax and wrap in quotes for phrase search.
fn escape_quickwit_query(query: &str) -> String {
    let escaped: String = query
        .chars()
        .flat_map(|c| {
            if QUICKWIT_RESERVED_CHARACTERS.contains(&c) {
                vec!['\\', c]
            } else if QUICKWIT_RESERVED_UNESCAPABLE_CHARACTERS.contains(&c) {
                vec![' ']
            } else {
                vec![c]
            }
        })
        .collect();
    format!("\"{escaped}\"")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpanRequest {
    pub name: String,
    pub span_type: Option<SpanType>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub attributes: Option<HashMap<String, Value>>,
    pub trace_id: Option<Uuid>,
    pub parent_span_id: Option<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpanResponse {
    pub span_id: Uuid,
    pub trace_id: Uuid,
}

#[post("spans")]
pub async fn create_span(
    project_id: web::Path<Uuid>,
    request: web::Json<CreateSpanRequest>,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    let span_id = Uuid::new_v4();
    let trace_id = request.trace_id.unwrap_or_else(Uuid::new_v4);

    let span = Span {
        span_id,
        trace_id,
        project_id,
        parent_span_id: request.parent_span_id,
        name: request.name,
        attributes: SpanAttributes::new(request.attributes.unwrap_or_default()),
        input: None,
        output: None,
        span_type: request.span_type.unwrap_or(SpanType::LLM),
        start_time: request.start_time,
        end_time: request.end_time,
        status: None,
        events: vec![],
        tags: None,
        input_url: None,
        output_url: None,
        size_bytes: 0,
    };

    let rabbitmq_span_message = RabbitMqSpanMessage { span };
    let mq_message = serde_json::to_vec(&vec![rabbitmq_span_message]).unwrap();

    if mq_message.len() >= mq_max_payload() {
        log::warn!(
            "[SPANS ROUTE] MQ payload limit exceeded. Project ID: [{}], payload size: [{}]",
            project_id,
            mq_message.len()
        );
        // Don't return error for now, skip publishing
    } else {
        spans_message_queue
            .publish(
                &mq_message,
                OBSERVATIONS_EXCHANGE,
                OBSERVATIONS_ROUTING_KEY,
                None,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to publish span to queue: {:?}", e);
                anyhow::anyhow!("Failed to publish span")
            })?;
    }
    let response = CreateSpanResponse { span_id, trace_id };

    Ok(HttpResponse::Ok().json(response))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSpansRequest {
    #[serde(default)]
    pub trace_id: Option<String>,
    pub search_query: String,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: usize,
    pub offset: usize,
    #[serde(default)]
    pub get_snippets: bool,
    #[serde(default)]
    pub one_snippet_per_trace: bool,
}

const QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS: [&str; 2] = ["input", "output"];

#[derive(Serialize, Deserialize)]
struct QuickwitHit {
    trace_id: String,
    span_id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitResponse {
    hits: Vec<QuickwitHit>,
}

#[derive(Serialize)]
struct SnippetInfo {
    text: String,
    highlight: [usize; 2],
}

#[derive(Serialize)]
struct SearchSpanHit {
    trace_id: String,
    span_id: String,
    input_snippet: Option<SnippetInfo>,
    output_snippet: Option<SnippetInfo>,
}

#[derive(clickhouse::Row, Deserialize)]
struct SpanSnippetRow {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    input_matched_text: String,
    input_snippet: String,
    output_matched_text: String,
    output_snippet: String,
}

#[post("spans/search")]
pub async fn search_spans(
    project_id: web::Path<Uuid>,
    request: web::Json<SearchSpansRequest>,
    quickwit_client: web::Data<Option<QuickwitClient>>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    let trimmed_query = request.search_query.trim();
    if trimmed_query.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<SearchSpanHit>::new()));
    }

    // Escape characters reserved by quickwit
    let escaped_query = escape_quickwit_query(trimmed_query);

    // If Quickwit is not available, return empty results (graceful degradation)
    let quickwit_client = match quickwit_client.as_ref() {
        Some(client) => client,
        None => {
            log::warn!("Quickwit search requested but Quickwit client is not available");
            return Ok(HttpResponse::Ok().json(Vec::<SearchSpanHit>::new()));
        }
    };

    let mut query_parts = vec![
        format!("project_id:{}", project_id),
        format!("({})", escaped_query),
    ];

    let sort_by = "start_time";

    if let Some(ref trace_id) = request.trace_id {
        query_parts.push(format!("trace_id:{}", trace_id));
    }

    let query_string = query_parts.join(" AND ");

    let mut search_body = json!({
        "query": query_string,
        "sort_by": sort_by,
    });

    let search_fields = QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.join(",");
    search_body["search_field"] = serde_json::Value::String(search_fields);

    // Handle pagination
    if request.limit != 0 {
        search_body["max_hits"] = serde_json::Value::Number(request.limit.into())
    } else {
        search_body["max_hits"] = serde_json::Value::Number(DEFAULT_SEARCH_MAX_HITS.into());
    }

    if request.offset != 0 {
        search_body["start_offset"] = serde_json::Value::Number(request.offset.into());
    }

    let effective_start = request
        .start_time
        .unwrap_or_else(|| Utc::now() - DEFAULT_SEARCH_TIME_RANGE);
    let effective_end = request.end_time.unwrap_or_else(Utc::now);

    search_body["start_timestamp"] = serde_json::Value::Number(effective_start.timestamp().into());
    if request.end_time.is_some() {
        search_body["end_timestamp"] = serde_json::Value::Number(effective_end.timestamp().into());
    }

    let t0: std::time::Instant = std::time::Instant::now();
    let hits = search_index(quickwit_client, &SPANS_INDEX_ID, search_body).await?;
    log::debug!(
        "[search_spans] quickwit: {}ms, {} hits",
        t0.elapsed().as_millis(),
        hits.len()
    );

    if hits.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<SearchSpanHit>::new()));
    }

    if !request.get_snippets {
        let results: Vec<SearchSpanHit> = hits
            .into_iter()
            .map(|h| SearchSpanHit {
                trace_id: h.trace_id,
                span_id: h.span_id,
                input_snippet: None,
                output_snippet: None,
            })
            .collect();

        log::debug!("[search_spans] total: {}ms", t0.elapsed().as_millis());
        return Ok(HttpResponse::Ok().json(results));
    }

    let snippet_pairs: Vec<(Uuid, Uuid)> = if request.one_snippet_per_trace {
        let mut seen_traces = HashSet::new();
        hits.iter()
            .filter(|h| seen_traces.insert(h.trace_id.clone()))
            .filter_map(|h| {
                let trace_id = Uuid::parse_str(&h.trace_id).ok()?;
                let span_id = Uuid::parse_str(&h.span_id).ok()?;
                Some((trace_id, span_id))
            })
            .collect()
    } else {
        hits.iter()
            .filter_map(|h| {
                let trace_id = Uuid::parse_str(&h.trace_id).ok()?;
                let span_id = Uuid::parse_str(&h.span_id).ok()?;
                Some((trace_id, span_id))
            })
            .collect()
    };

    let (match_regex, context_regex) = match search_snippets::build_search_regexes(trimmed_query) {
        Some(regexes) => regexes,
        None => {
            let results: Vec<SearchSpanHit> = hits
                .into_iter()
                .map(|h| SearchSpanHit {
                    trace_id: h.trace_id,
                    span_id: h.span_id,
                    input_snippet: None,
                    output_snippet: None,
                })
                .collect();
            return Ok(HttpResponse::Ok().json(results));
        }
    };

    let snippet_rows = fetch_span_snippets(
        &clickhouse,
        project_id,
        &snippet_pairs,
        &match_regex,
        &context_regex,
    )
    .await;

    let context_size = search_snippets::SNIPPET_CONTEXT_CHARS;

    let snippet_map: HashMap<String, SpanSnippetRow> = snippet_rows
        .into_iter()
        .map(|row| (row.span_id.to_string(), row))
        .collect();

    let enriched_hits: Vec<SearchSpanHit> = hits
        .into_iter()
        .map(|hit| {
            if let Some(row) = snippet_map.get(&hit.span_id) {
                let input_snippet = search_snippets::post_process_snippet(
                    &row.input_snippet,
                    &row.input_matched_text,
                    context_size,
                )
                .map(|(text, highlight)| SnippetInfo { text, highlight });

                let output_snippet = search_snippets::post_process_snippet(
                    &row.output_snippet,
                    &row.output_matched_text,
                    context_size,
                )
                .map(|(text, highlight)| SnippetInfo { text, highlight });

                SearchSpanHit {
                    trace_id: hit.trace_id,
                    span_id: hit.span_id,
                    input_snippet,
                    output_snippet,
                }
            } else {
                SearchSpanHit {
                    trace_id: hit.trace_id,
                    span_id: hit.span_id,
                    input_snippet: None,
                    output_snippet: None,
                }
            }
        })
        .collect();

    log::debug!("[search_spans] total: {}ms", t0.elapsed().as_millis());

    Ok(HttpResponse::Ok().json(enriched_hits))
}

async fn search_index(
    client: &QuickwitClient,
    index_id: &str,
    body: serde_json::Value,
) -> Result<Vec<QuickwitHit>, Error> {
    let response_value = client.search_index(index_id, body).await.map_err(|e| {
        log::error!("Quickwit search error (index {}): {:?}", index_id, e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to search spans"))
    })?;

    let quickwit_response: QuickwitResponse =
        serde_json::from_value(response_value).map_err(|e| {
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to parse Quickwit response: {}", e))
        })?;

    Ok(quickwit_response.hits)
}

async fn fetch_span_snippets(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    pairs: &[(Uuid, Uuid)],
    match_regex: &str,
    context_regex: &str,
) -> Vec<SpanSnippetRow> {
    if pairs.is_empty() {
        return Vec::new();
    }

    let match_escaped = search_snippets::escape_clickhouse_string(match_regex);
    let context_escaped = search_snippets::escape_clickhouse_string(context_regex);

    let chunk_size = (pairs.len() + PARALLEL_SNIPPETS_QUERIES - 1) / PARALLEL_SNIPPETS_QUERIES;
    let futures: Vec<_> = pairs
        .chunks(chunk_size.max(1))
        .map(|chunk| {
            let tuples = build_key_tuples(chunk);
            let query = build_snippet_query(project_id, &match_escaped, &context_escaped, &tuples);
            async move {
                let t_start = std::time::Instant::now();
                clickhouse
                    .query(&query)
                    .fetch_all::<SpanSnippetRow>()
                    .await
                    .inspect(|rows| {
                        log::debug!(
                            "[search_spans] clickhouse snippets: {}ms, {} rows",
                            t_start.elapsed().as_millis(),
                            rows.len()
                        );
                    })
                    .unwrap_or_else(|e| {
                        log::error!("Failed to fetch span snippets from ClickHouse: {:?}", e);
                        Vec::new()
                    })
            }
        })
        .collect();

    let results = futures_util::future::join_all(futures).await;
    results.into_iter().flatten().collect()
}

fn build_key_tuples(pairs: &[(Uuid, Uuid)]) -> String {
    pairs
        .iter()
        .map(|(trace_id, span_id)| format!("('{trace_id}', '{span_id}')"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn build_snippet_query(
    project_id: Uuid,
    match_regex: &str,
    context_regex: &str,
    key_tuples: &str,
) -> String {
    let input_cols = build_regex_columns("input", match_regex, context_regex);
    let output_cols = build_regex_columns("output", match_regex, context_regex);

    format!(
        "SELECT span_id,
                input_matched_text, input_snippet,
                output_matched_text, output_snippet
         FROM (
           SELECT span_id, {input_cols}, {output_cols}
           FROM spans_v2
           WHERE project_id = '{project_id}'
             AND (trace_id, span_id) IN ({key_tuples})
           ORDER BY start_time ASC
         )"
    )
}

fn build_regex_columns(field: &str, match_regex: &str, context_regex: &str) -> String {
    format!(
        "extract({field}, '{match_regex}') AS {field}_matched_text,
         extract({field}, '{context_regex}') AS {field}_snippet"
    )
}
