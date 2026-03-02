use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::spans::{Span, SpanType},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::client::QuickwitClient,
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
pub fn escape_quickwit_query(query: &str) -> String {
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

pub const QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS: [&str; 3] = ["input", "output", "attributes"];

#[derive(Serialize, Deserialize)]
pub struct QuickwitHit {
    pub trace_id: String,
    pub span_id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitResponse {
    hits: Vec<QuickwitHit>,
}

pub async fn execute_quickwit_search(
    quickwit: &QuickwitClient,
    project_id: Uuid,
    query: &str,
    search_in: Option<Vec<String>>,
    trace_id: Option<String>,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    limit: usize,
    offset: usize,
) -> anyhow::Result<Vec<QuickwitHit>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let escaped_query = escape_quickwit_query(trimmed);

    let mut query_parts = vec![
        format!("project_id:{}", project_id),
        format!("({})", escaped_query),
    ];

    let mut sort_by = "_score,start_time"; // default sort for scores and timestamp in quickwit is desc!

    if let Some(trace_id) = trace_id {
        query_parts.push(format!("trace_id:{}", trace_id));
        sort_by = "start_time";
    }

    let query_string = query_parts.join(" AND ");

    let search_fields = match search_in {
        Some(fields) if !fields.is_empty() => {
            let valid: Vec<&str> = QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS
                .iter()
                .filter(|&&f| fields.iter().any(|requested| requested == f))
                .cloned()
                .collect();

            if valid.is_empty() {
                QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.to_vec()
            } else {
                valid
            }
        }
        _ => QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.to_vec(),
    };

    let mut search_body = json!({
        "query": query_string,
        "sort_by": sort_by,
        "search_field": search_fields.join(","),
        "max_hits": if limit != 0 { limit } else { DEFAULT_SEARCH_MAX_HITS },
    });

    if let Some(start) = start_time {
        search_body["start_timestamp"] = serde_json::Value::Number(start.timestamp().into());
    }
    if let Some(end) = end_time {
        search_body["end_timestamp"] = serde_json::Value::Number(end.timestamp().into());
    }
    if offset != 0 {
        search_body["start_offset"] = serde_json::Value::Number(offset.into());
    }

    let response_value = quickwit.search_spans(search_body).await?;
    let quickwit_response: QuickwitResponse = serde_json::from_value(response_value)?;
    Ok(quickwit_response.hits)
}

#[post("spans/search")]
pub async fn search_spans(
    project_id: web::Path<Uuid>,
    request: web::Json<SearchSpansRequest>,
    quickwit_client: web::Data<Option<QuickwitClient>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    let quickwit_client = match quickwit_client.as_ref() {
        Some(client) => client,
        None => {
            log::warn!("Quickwit search requested but Quickwit client is not available");
            return Ok(HttpResponse::Ok().json(Vec::<String>::new()));
        }
    };

    let hits = execute_quickwit_search(
        quickwit_client,
        project_id,
        &request.search_query,
        request.search_in,
        request.trace_id,
        request.start_time,
        request.end_time,
        request.limit,
        request.offset,
    )
    .await
    .map_err(|e| {
        log::error!("Quickwit search error: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to search spans"))
    })?;

    Ok(HttpResponse::Ok().json(hits))
}
