use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    access_policy::{self, Actor},
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{
        DB,
        spans::{Span, SpanType},
    },
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    quickwit::client::QuickwitClient,
    routes::ResponseResult,
    search::snippets::SearchSpanHit,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, spans::SpanAttributes},
};

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
        size_bytes: 0,
    };

    let rabbitmq_span_message = RabbitMqSpanMessage {
        span,
        pre_processed: false,
        input_dedup: None,
        output_dedup: None,
        tool_dedup: None,
    };
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

/// `actor` is mandatory, as on `/sql/query`: this route is only reachable
/// from the frontend server, which always knows who is reading.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSpansRequest {
    #[serde(default)]
    pub trace_ids: Option<Vec<String>>,
    pub search_query: String,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: usize,
    pub offset: usize,
    #[serde(default)]
    pub get_snippets: bool,
    pub actor: Actor,
}

#[post("spans/search")]
pub async fn search_spans(
    project_id: web::Path<Uuid>,
    request: web::Json<SearchSpansRequest>,
    quickwit_client: web::Data<Option<QuickwitClient>>,
    clickhouse: web::Data<clickhouse::Client>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    // Hits come from the index, which holds redacted text. Snippets are cut
    // from raw `spans`/`unique_content` rows, so under a masking policy they
    // are withheld rather than masked (docs/internal/rbac.md).
    let policy = access_policy::for_actor_or_masked(
        &request.actor,
        project_id,
        db.into_inner(),
        cache.into_inner(),
    )
    .await;
    let get_snippets = request.get_snippets && !policy.mask_pii;

    let trimmed_query = request.search_query.trim();
    if trimmed_query.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<SearchSpanHit>::new()));
    }

    let quickwit_client = match quickwit_client.as_ref() {
        Some(client) => client,
        None => {
            log::warn!("Quickwit search requested but Quickwit client is not available");
            return Ok(HttpResponse::Ok().json(Vec::<SearchSpanHit>::new()));
        }
    };

    let results = crate::search::search_spans(
        quickwit_client,
        &clickhouse,
        project_id,
        trimmed_query,
        request.trace_ids.as_deref(),
        request.limit,
        request.offset,
        request.start_time,
        request.end_time,
        get_snippets,
    )
    .await?;

    Ok(HttpResponse::Ok().json(results))
}
