use std::collections::HashMap;

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{self, DB, labeling_queues::NewLabelingQueueItem, project_api_keys::ProjectApiKey},
    routes::types::ResponseResult,
};

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
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let queue_id = path.into_inner();
    let request = body.into_inner();
    let db = db.into_inner();
    let project_id = project_api_key.project_id;

    // Verify queue exists and belongs to the project
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

    // Convert request items to LabelingQueueItemData for DB insertion
    // Queue item metadata is empty for API-ingested items (no source)
    let items: Vec<NewLabelingQueueItem> = request
        .items
        .into_iter()
        .map(|item| NewLabelingQueueItem {
            metadata: serde_json::json!({}),
            payload: serde_json::json!({
                "data": item.data,
                "target": item.target,
                "metadata": item.metadata,
            }),
        })
        .collect();

    let created_items =
        db::labeling_queues::insert_labeling_queue_items(&db.pool, queue_id, items).await?;

    let response: Vec<LabelingQueueItemResponse> = created_items
        .into_iter()
        .map(|item| LabelingQueueItemResponse {
            id: item.id,
            created_at: item.created_at,
        })
        .collect();

    Ok(HttpResponse::Created().json(response))
}
