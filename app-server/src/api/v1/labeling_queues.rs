use std::collections::HashMap;

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{self, DB, project_api_keys::ProjectApiKey},
    routes::types::ResponseResult,
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemPayload {
    pub data: serde_json::Value,
    pub target: serde_json::Value,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LabelingQueueItemSource {
    Span,
    Datapoint,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemMetadata {
    pub source: LabelingQueueItemSource,
    #[serde(default)]
    pub dataset_id: Option<String>,
    #[serde(default)]
    pub trace_id: Option<String>,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItemRequest {
    pub payload: LabelingQueueItemPayload,
    pub metadata: LabelingQueueItemMetadata,
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

    // Convert request items to (metadata, payload) tuples for DB insertion
    let items: Vec<(serde_json::Value, serde_json::Value)> = request
        .items
        .into_iter()
        .map(|item| {
            let metadata = serde_json::to_value(&item.metadata)?;
            let payload = serde_json::to_value(&item.payload)?;
            Ok((metadata, payload))
        })
        .collect::<Result<Vec<_>, serde_json::Error>>()?;

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
