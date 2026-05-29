use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        spans::{Span, SpanType},
        trace::trace_exists,
    },
    mq::MessageQueue,
    routes::types::ResponseResult,
    traces::{
        producer::publish_span_messages,
        span_attributes::{ASSOCIATION_PROPERTIES_PREFIX, SPAN_METADATA_ONLY},
        spans::SpanAttributes,
    },
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTraceMetadataRequest {
    pub trace_id: Uuid,
    pub metadata: HashMap<String, Value>,
}

/// `POST /v1/traces/metadata` — merge a metadata patch onto an existing trace.
///
/// The patch is delivered as a virtual span carrying
/// `lmnr.association.properties.metadata.<key>` attributes plus the
/// `lmnr.internal.metadata_only` marker. The consumer (`process_span_messages`)
/// splits these spans out before the regular pipeline and applies them to
/// `traces.metadata` via a UPDATE that takes the same row lock as the regular
/// `upsert_trace_statistics_batch`. The virtual span is never recorded to the
/// `spans` table and contributes nothing to trace stats (start/end/tokens/
/// num_spans/top_span/etc.).
#[post("metadata")]
pub async fn update_trace_metadata(
    req: web::Json<UpdateTraceMetadataRequest>,
    project_api_key: ProjectApiKey,
    spans_message_queue: web::Data<Arc<MessageQueue>>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let project_id = project_api_key.project_id;

    if req.metadata.is_empty() {
        return Ok(HttpResponse::BadRequest().json("metadata cannot be empty"));
    }

    let db = db.into_inner();
    let cache = cache.into_inner();

    if !trace_exists(&db.pool, project_id, req.trace_id).await? {
        return Ok(HttpResponse::NotFound().json("Trace not found"));
    }

    let mut attributes: HashMap<String, Value> = HashMap::with_capacity(req.metadata.len() + 1);
    attributes.insert(SPAN_METADATA_ONLY.to_string(), Value::Bool(true));
    for (key, value) in req.metadata {
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.metadata.{key}"),
            value,
        );
    }

    let now = Utc::now();
    let span = Span {
        span_id: Uuid::new_v4(),
        trace_id: req.trace_id,
        project_id,
        parent_span_id: None,
        name: "lmnr.trace.metadata".to_string(),
        attributes: SpanAttributes::new(attributes),
        input: None,
        output: None,
        span_type: SpanType::Default,
        start_time: now,
        end_time: now,
        status: None,
        events: vec![],
        tags: None,
        input_url: None,
        output_url: None,
        size_bytes: 0,
    };

    let messages = vec![RabbitMqSpanMessage {
        span,
        pre_processed: false,
        input_dedup: None,
    }];

    publish_span_messages(
        messages,
        project_id,
        spans_message_queue.as_ref().clone(),
        db,
        cache,
    )
    .await
    .map_err(|e| {
        log::error!("Failed to publish trace metadata patch: {:?}", e);
        anyhow::anyhow!("Failed to publish trace metadata patch")
    })?;

    Ok(HttpResponse::Ok().finish())
}
