use std::collections::{HashMap, HashSet};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::labeling_queue_items::{
        CHLabelingQueueItem, idempotency_key_exists, insert_labeling_queue_items, now_ch_millis,
    },
    db::{self, DB, project_api_keys::ProjectApiKey},
    routes::types::ResponseResult,
};

/// Namespace UUID mirrored in `frontend/lib/utils.ts` — changing it here breaks
/// cross-runtime idempotency collapsing, so update both sides together.
const LABELING_QUEUE_ITEM_NAMESPACE: Uuid = Uuid::from_u128(0xb8f3c3a2_4a33_4f4b_8c6a_5a9a1f7d2e21);

/// Derive a deterministic item id from `(project_id, queue_id, idempotency_key)`.
/// Concurrent inserts with the same key produce the same RMT primary key and
/// collapse on merge / FINAL; callers with no key get a fresh UUIDv7.
fn queue_item_id_for_idempotency(project_id: Uuid, queue_id: Uuid, idempotency_key: &str) -> Uuid {
    if idempotency_key.is_empty() {
        return Uuid::now_v7();
    }
    Uuid::new_v5(
        &LABELING_QUEUE_ITEM_NAMESPACE,
        format!("{}:{}:{}", project_id, queue_id, idempotency_key).as_bytes(),
    )
}

/// Request structure for a single labeling queue item.
/// For API ingestion, items are created manually without a source reference.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemRequest {
    pub data: serde_json::Value,
    pub target: serde_json::Value,
    /// Optional metadata for the payload (not the queue item metadata).
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    /// Optional idempotency key to prevent duplicate items in the queue.
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
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let queue_id = path.into_inner();
    let request = body.into_inner();
    let db = db.into_inner();
    let clickhouse = clickhouse.as_ref().clone();
    let project_id = project_api_key.project_id;

    // Verify queue exists and belongs to the project.
    // The `labeling_queues` metadata table still lives in Postgres; only the
    // queue items have been migrated to ClickHouse.
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

    let now_ms = now_ch_millis();
    // Same millisecond instant as what we persist to ClickHouse, so the HTTP response's
    // `createdAt` doesn't drift by microseconds from the stored value.
    let now_dt =
        chrono::DateTime::from_timestamp_millis(now_ms as i64).unwrap_or_else(chrono::Utc::now);
    let mut ch_items: Vec<CHLabelingQueueItem> = Vec::with_capacity(request.items.len());
    let mut response: Vec<LabelingQueueItemResponse> = Vec::with_capacity(request.items.len());
    // Dedupe keys appearing multiple times WITHIN this request. The per-item
    // `idempotency_key_exists` check only covers rows already persisted to CH,
    // so two entries carrying the same key in the same batch would both pass
    // it and get queued with identical deterministic ids — RMT eventually
    // collapses those on merge, but until then `getQueueCounts` double-counts.
    let mut seen_keys: HashSet<String> = HashSet::new();

    for item in request.items {
        let idempotency_key = item.idempotency_key.unwrap_or_default();

        if !idempotency_key.is_empty() && !seen_keys.insert(idempotency_key.clone()) {
            continue;
        }

        // If an idempotency key was supplied, check for an existing row in CH.
        // We FINAL the lookup to collapse replacing-merge-tree duplicates.
        if !idempotency_key.is_empty()
            && idempotency_key_exists(clickhouse.clone(), project_id, queue_id, &idempotency_key)
                .await?
        {
            continue;
        }

        let id = queue_item_id_for_idempotency(project_id, queue_id, &idempotency_key);
        let payload = serde_json::json!({
            "data": item.data,
            "target": item.target,
            "metadata": item.metadata,
        })
        .to_string();
        let metadata = "{}".to_string();

        ch_items.push(CHLabelingQueueItem {
            id,
            queue_id,
            project_id,
            payload,
            metadata,
            is_labelled: false,
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
