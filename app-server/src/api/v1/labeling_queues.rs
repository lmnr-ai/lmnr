use std::collections::{HashMap, HashSet};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::labeling_queue_items::{CHLabelingQueueItem, insert_labeling_queue_items},
    auth::ProjectAuthContext,
    db::{self, DB},
    routes::types::ResponseResult,
};

/// `edit` is deliberately absent — the handler seeds it from `target` on insert.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemRequest {
    pub data: serde_json::Value,
    pub target: serde_json::Value,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLabelingQueueItemsRequest {
    pub items: Vec<LabelingQueueItemRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemResponse {
    pub id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// /v1/labeling_queues/{queue_id}/items
#[post("/{queue_id}/items")]
pub async fn create_labeling_queues_items(
    path: web::Path<Uuid>,
    body: web::Json<CreateLabelingQueueItemsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_auth_ctx: ProjectAuthContext,
) -> ResponseResult {
    let queue_id = path.into_inner();
    let request = body.into_inner();
    let db = db.into_inner();
    let clickhouse = clickhouse.as_ref().clone();
    let project_id = project_auth_ctx.project_id;

    if !db::labeling_queues::queue_exists(&db.pool, queue_id, project_id).await? {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Queue not found"
        })));
    }

    if request.items.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No items provided"
        })));
    }

    let now_dt = chrono::Utc::now();
    let now_ms = now_dt.timestamp_millis() as u64;

    let mut ch_items: Vec<CHLabelingQueueItem> = Vec::with_capacity(request.items.len());
    let mut response: Vec<LabelingQueueItemResponse> = Vec::with_capacity(request.items.len());
    let mut seen_keys: HashSet<String> = HashSet::new();

    for item in request.items {
        let idempotency_key = item.idempotency_key.unwrap_or_default();

        // UUIDv5 over (queue_id, idempotency_key) so same-key retries collapse on RMT FINAL.
        // In-batch dedupe avoids emitting the same id twice in one response; cross-batch
        // retries collapse naturally via the deterministic id + ReplacingMergeTree.
        let id = if idempotency_key.is_empty() {
            Uuid::now_v7()
        } else {
            if !seen_keys.insert(idempotency_key.clone()) {
                continue;
            }
            Uuid::new_v5(&queue_id, idempotency_key.as_bytes())
        };

        let payload = serde_json::json!({
            "data": item.data,
            "target": item.target,
            "metadata": item.metadata,
        })
        .to_string();
        let edit = serde_json::to_string(&item.target).unwrap_or_else(|_| "null".to_string());

        ch_items.push(CHLabelingQueueItem {
            id,
            queue_id,
            project_id,
            payload,
            edit,
            metadata: "{}".to_string(),
            status: 0,
            idempotency_key,
            created_at: now_ms,
            updated_at: now_ms,
        });

        response.push(LabelingQueueItemResponse {
            id,
            created_at: now_dt,
        });
    }

    insert_labeling_queue_items(clickhouse, ch_items).await?;

    Ok(HttpResponse::Created().json(response))
}
