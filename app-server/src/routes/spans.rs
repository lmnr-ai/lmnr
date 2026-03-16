use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::spans::{Span, SpanType},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::{OLD_SPANS_INDEX_ID, client::QuickwitClient, spans_index_id},
    routes::{ResponseResult, error::Error},
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, spans::SpanAttributes},
};

const DEFAULT_SEARCH_MAX_HITS: usize = 500;
// TODO: maybe remove all punctuation similar to the default tokenizer in the index?
const QUICKWIT_RESERVED_CHARACTERS: &[char] = &['?', '`', '~', '!', '\\'];
// Quickwit documentation is very brief on this, it lists all of the reserved characters
// with a note that you can escape them with a backslash. However, some of them break
// the query parsing when escaped, so we need to remove them.
const QUICKWIT_RESERVED_UNESCAPABLE_CHARACTERS: &[char] = &[
    '"', ':', '^', '{', '}', '[', ']', '(', ')',
    // The below characters won't break parsing but change the meaning of the query
    // even when escaped, so safest to remove them.
    '+', '\u{002D}', // - hyphen-minus
    '\u{2013}', // – en dash
    '\u{2014}', // — em dash
];

/// Escape special characters for Quickwit query syntax
fn escape_quickwit_query(query: &str) -> String {
    query
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
        .collect()
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
    #[serde(default)]
    pub search_in: Option<Vec<String>>,
    pub limit: usize,
    pub offset: usize,
}

const QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS: [&str; 2] = ["input", "output"];

// Old spans indexed before this timestamp live in the old "spans" index.
// Adjust this right before deploying the new index.
fn new_index_cutover_ts() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, 16, 0, 0, 0).unwrap()
}

#[derive(Serialize, Deserialize)]
struct QuickwitHit {
    trace_id: String,
    span_id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitResponse {
    hits: Vec<QuickwitHit>,
}

#[post("spans/search")]
pub async fn search_spans(
    project_id: web::Path<Uuid>,
    request: web::Json<SearchSpansRequest>,
    quickwit_client: web::Data<Option<QuickwitClient>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    let trimmed_query = request.search_query.trim();
    if trimmed_query.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<String>::new()));
    }

    // Escape characters reserved by quickwit
    let escaped_query = escape_quickwit_query(trimmed_query);

    // If Quickwit is not available, return empty results (graceful degradation)
    let quickwit_client = match quickwit_client.as_ref() {
        Some(client) => client,
        None => {
            log::warn!("Quickwit search requested but Quickwit client is not available");
            return Ok(HttpResponse::Ok().json(Vec::<String>::new()));
        }
    };

    let mut query_parts = vec![
        format!("project_id:{}", project_id),
        format!("({})", escaped_query),
    ];

    let sort_by = "start_time";

    if let Some(trace_id) = request.trace_id {
        query_parts.push(format!("trace_id:{}", trace_id));
    }

    let query_string = query_parts.join(" AND ");

    let mut search_body = json!({
        "query": query_string,
        "sort_by": sort_by,
    });

    // Handle search fields
    let search_fields = if let Some(search_in) = request.search_in {
        if search_in.is_empty() {
            QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.to_vec()
        } else {
            let valid_fields: Vec<&str> = QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS
                .iter()
                .filter(|&&f| search_in.iter().any(|requested| requested == f))
                .cloned()
                .collect();

            if valid_fields.is_empty() {
                QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.to_vec()
            } else {
                valid_fields
            }
        }
    } else {
        QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.to_vec()
    };

    // Quickwit expects search_field as a comma-separated string, not an array
    let search_field_str = search_fields.join(",");
    search_body["search_field"] = serde_json::Value::String(search_field_str);

    // Handle pagination
    if request.limit != 0 {
        search_body["max_hits"] = serde_json::Value::Number(request.limit.into())
    } else {
        search_body["max_hits"] = serde_json::Value::Number(DEFAULT_SEARCH_MAX_HITS.into());
    }

    if request.offset != 0 {
        search_body["start_offset"] = serde_json::Value::Number(request.offset.into());
    }

    // TEMPORARY: Determine which index to query based on the timestamp
    // TODO: Remove this logic once we have switched to the new index completely.
    let cutover = new_index_cutover_ts();
    let start = request.start_time;
    let end = request.end_time;

    let old_start = start;
    let old_end = Some(end.map_or(cutover, |e| e.min(cutover)));
    let new_start = Some(start.map_or(cutover, |s| s.max(cutover)));
    let new_end = end;

    let has_old_interval = !matches!((old_start, old_end), (Some(s), Some(e)) if s >= e);
    let has_new_interval = !matches!((new_start, new_end), (Some(s), Some(e)) if s >= e);

    let max_hits = search_body["max_hits"].as_u64().unwrap_or(DEFAULT_SEARCH_MAX_HITS as u64) as usize;

    let mut hits = if has_new_interval {
        let mut body = search_body.clone();
        set_body_timestamps(&mut body, new_start, new_end);
        search_index(quickwit_client, spans_index_id(), body).await?
    } else {
        vec![]
    };

    if has_old_interval && hits.len() < max_hits {
        let mut body = search_body;
        body["max_hits"] = serde_json::Value::Number((max_hits - hits.len()).into());
        set_body_timestamps(&mut body, old_start, old_end);
        hits.extend(search_index(quickwit_client, OLD_SPANS_INDEX_ID, body).await?);
    }

    Ok(HttpResponse::Ok().json(hits))
}

fn set_body_timestamps(
    body: &mut serde_json::Value,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) {
    if let Some(s) = start {
        body["start_timestamp"] = serde_json::Value::Number(s.timestamp().into());
    }
    if let Some(e) = end {
        body["end_timestamp"] = serde_json::Value::Number(e.timestamp().into());
    }
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
