use std::collections::HashMap;

use actix_web::{post, web, HttpResponse};
use chrono::Utc;
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
    features::{is_feature_enabled, Feature},
    routes::types::ResponseResult,
    traces::span_attributes::ASSOCIATION_PROPERTIES_PREFIX,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushItem {
    #[serde(default = "Uuid::new_v4")]
    id: Uuid,
    #[serde(default)]
    name: String,
    #[serde(default)]
    attributes: HashMap<String, Value>,
    #[serde(default)]
    input: Option<Value>,
    #[serde(default)]
    output: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushToQueueRequest {
    items: Vec<PushItem>,
    queue_name: String,
}

#[post("/queues/push")]
async fn push_to_queue(
    project_api_key: ProjectApiKey,
    req: web::Json<PushToQueueRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let db = db.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let queue_name = req.queue_name;
    let request_items = req.items;
    let cache = cache.into_inner();

    let Some(queue) =
        crate::db::labeling_queues::get_labeling_queue_by_name(&db.pool, &queue_name, &project_id)
            .await?
    else {
        return Ok(HttpResponse::NotFound().body(format!("Queue not found: {}", queue_name)));
    };

    let mut span_ids = Vec::with_capacity(request_items.len());
    let num_spans = request_items.len();
    crate::db::stats::add_spans_to_project_usage_stats(&db.pool, &project_id, num_spans as i64)
        .await?;
    if is_feature_enabled(Feature::UsageLimit) {
        if let Ok(limits_exceeded) =
            crate::traces::limits::update_workspace_limit_exceeded_by_project_id(
                db.clone(),
                cache.clone(),
                project_id,
            )
            .await
        {
            if limits_exceeded.spans {
                return Ok(HttpResponse::TooManyRequests().body("Workspace span limit exceeded"));
            }
        }
    }

    for request_item in request_items {
        let mut attributes = request_item.attributes;
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.trace_type"),
            // Temporary, in order not to show spans in the default trace view
            serde_json::to_value(TraceType::EVENT).unwrap(),
        );
        let mut span = Span {
            span_id: request_item.id,
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: request_item.name,
            start_time: Utc::now(),
            end_time: Utc::now(),
            attributes: serde_json::to_value(attributes).unwrap(),
            span_type: SpanType::DEFAULT,
            input: request_item.input,
            output: request_item.output,
            events: None,
            labels: None,
            // TODO: store the input and output in storage if they are too large
            input_url: None,
            output_url: None,
        };

        let span_usage = crate::traces::utils::get_llm_usage_for_span(
            &mut span.get_attributes(),
            db.clone(),
            cache.clone(),
        )
        .await;

        crate::traces::utils::record_span_to_db(db.clone(), &span_usage, &project_id, &mut span, &Vec::new())
            .await?;
        span_ids.push(span.span_id);
    }

    let queue_entries = span_ids
        .iter()
        .map(|span_id| LabelingQueueEntry {
            span_id: span_id.clone(),
            action: Value::Null,
        })
        .collect::<Vec<_>>();
    crate::db::labeling_queues::push_to_labeling_queue(&db.pool, &queue.id, &queue_entries).await?;

    Ok(HttpResponse::Ok().body("Items uploaded successfully"))
}
