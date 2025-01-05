use std::collections::HashMap;

use actix_web::{post, web, HttpResponse};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        project_api_keys::ProjectApiKey,
        spans::{Span, SpanType},
        trace::TraceType,
        DB,
    },
    evaluations::utils::LabelingQueueEntry,
    routes::types::ResponseResult,
    traces::span_attributes::ASSOCIATION_PROPERTIES_PREFIX,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadSpan {
    #[serde(default = "Uuid::new_v4")]
    id: Uuid,
    #[serde(default)]
    name: String,
    #[serde(default = "Utc::now")]
    start_time: DateTime<Utc>,
    #[serde(default = "Utc::now")]
    end_time: DateTime<Utc>,
    #[serde(default)]
    attributes: HashMap<String, Value>,
    #[serde(default)]
    span_type: SpanType,
    #[serde(default)]
    input: Option<Value>,
    #[serde(default)]
    output: Option<Value>,
    #[serde(default)]
    trace_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadSpansRequest {
    spans: Vec<UploadSpan>,
    #[serde(default)]
    queue_name: Option<String>,
}

#[post("/spans/upload")]
async fn upload_spans(
    project_api_key: ProjectApiKey,
    req: web::Json<UploadSpansRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let db = db.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let queue_name = req.queue_name;
    let request_spans = req.spans;
    let cache = cache.into_inner();

    let queue_id = if let Some(queue_name) = queue_name {
        let Some(queue) = crate::db::labeling_queues::get_labeling_queue_by_name(
            &db.pool,
            &queue_name,
            &project_id,
        )
        .await?
        else {
            return Ok(HttpResponse::NotFound().body(format!("Queue not found: {}", queue_name)));
        };
        Some(queue.id)
    } else {
        None
    };

    let mut span_ids = Vec::with_capacity(request_spans.len());

    for request_span in request_spans {
        let mut attributes = request_span.attributes;
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.trace_type"),
            // Temporary, in order not to show spans in the default trace view
            serde_json::to_value(TraceType::EVENT).unwrap(),
        );
        let mut span = Span {
            span_id: request_span.id,
            trace_id: request_span.trace_id.unwrap_or(Uuid::new_v4()),
            parent_span_id: None,
            name: request_span.name,
            start_time: request_span.start_time,
            end_time: request_span.end_time,
            attributes: serde_json::to_value(attributes).unwrap(),
            span_type: request_span.span_type,
            input: request_span.input,
            output: request_span.output,
            events: None,
            labels: None,
        };

        let span_usage = crate::traces::utils::get_llm_usage_for_span(
            &mut span.get_attributes(),
            db.clone(),
            cache.clone(),
        )
        .await;

        crate::traces::utils::record_span_to_db(db.clone(), &span_usage, &project_id, &mut span)
            .await?;
        span_ids.push(span.span_id);
    }
    if let Some(queue_id) = queue_id {
        let queue_entries = span_ids
            .iter()
            .map(|span_id| LabelingQueueEntry {
                span_id: span_id.clone(),
                action: Value::Null,
            })
            .collect::<Vec<_>>();
        crate::db::labeling_queues::push_to_labeling_queue(&db.pool, &queue_id, &queue_entries)
            .await?;
    }

    Ok(HttpResponse::Ok().body("Spans uploaded successfully"))
}
