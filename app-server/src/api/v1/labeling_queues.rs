use std::collections::{HashMap, HashSet};

use actix_web::{HttpResponse, post, web};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::labeling_queue_items::{
        CHLabelingQueueItem, existing_creations, insert_labeling_queue_items,
    },
    db::{self, DB, project_api_keys::ProjectApiKey},
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
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    handle_create_items(
        path.into_inner(),
        body.into_inner(),
        &db.pool,
        clickhouse.as_ref().clone(),
        project_api_key.project_id,
    )
    .await
}

async fn handle_create_items(
    queue_id: Uuid,
    request: CreateLabelingQueueItemsRequest,
    pool: &sqlx::PgPool,
    clickhouse: clickhouse::Client,
    project_id: Uuid,
) -> ResponseResult {
    // Hold this lock across the ClickHouse lookup and insert. Another API
    // worker retrying a key waits until the first request has finished writing.
    let keyed = request.items.iter().any(|item| {
        item.idempotency_key
            .as_ref()
            .is_some_and(|key| !key.is_empty())
    });
    let mut queue_lock = if keyed {
        Some(pool.begin().await?)
    } else {
        None
    };
    let exists = match &mut queue_lock {
        Some(tx) => db::labeling_queues::lock_queue(tx, queue_id, project_id).await?,
        None => db::labeling_queues::queue_exists(pool, queue_id, project_id).await?,
    };
    if !exists {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Queue not found"
        })));
    }

    if request.items.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No items provided"
        })));
    }

    let mut seen = HashSet::new();
    let mut keyed_ids = Vec::new();
    let mut items = Vec::with_capacity(request.items.len());
    for item in request.items {
        let key = item.idempotency_key.as_deref().unwrap_or_default();
        let id = if key.is_empty() {
            Uuid::now_v7()
        } else {
            let id = Uuid::new_v5(&queue_id, key.as_bytes());
            if !seen.insert(id) {
                continue;
            }
            keyed_ids.push(id);
            id
        };
        items.push((id, item));
    }
    let existing = existing_creations(&clickhouse, project_id, queue_id, &keyed_ids).await?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut ch_items = Vec::new();
    let mut response = Vec::with_capacity(items.len());

    for (id, item) in items {
        let created_at =
            chrono::DateTime::from_timestamp_millis(existing.get(&id).copied().unwrap_or(now_ms))
                .context("Invalid labeling queue item timestamp")?;
        response.push(LabelingQueueItemResponse { id, created_at });
        if existing.contains_key(&id) {
            continue;
        }

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
            idempotency_key: item.idempotency_key.unwrap_or_default(),
            created_at: now_ms as u64,
            updated_at: now_ms as u64,
        });
    }

    insert_labeling_queue_items(clickhouse, ch_items).await?;
    if let Some(tx) = queue_lock {
        tx.commit().await?;
    }

    Ok(HttpResponse::Created().json(response))
}

#[cfg(test)]
mod tests {
    use actix_web::body::to_bytes;
    use serde_json::{Value, json};

    use super::*;

    // The PostgreSQL fixture needs labeling_queues(id, project_id). Apply
    // ClickHouse migration 42 to the disposable ClickHouse database first.
    #[actix_web::test]
    #[ignore = "requires disposable PostgreSQL and ClickHouse fixtures"]
    async fn keyed_replay_preserves_approval_and_returns_original_creation() {
        let pool = sqlx::PgPool::connect(&std::env::var("TEST_LABELING_POSTGRES_URL").unwrap())
            .await
            .unwrap();
        let clickhouse = clickhouse::Client::default()
            .with_url(std::env::var("TEST_LABELING_CLICKHOUSE_URL").unwrap())
            .with_user("default")
            .with_password(std::env::var("TEST_LABELING_CLICKHOUSE_PASSWORD").unwrap())
            .with_validation(false);
        let project_id = Uuid::new_v4();
        let queue_id = Uuid::new_v4();
        sqlx::query("INSERT INTO labeling_queues (id, project_id) VALUES ($1, $2)")
            .bind(queue_id)
            .bind(project_id)
            .execute(&pool)
            .await
            .unwrap();
        let create = |items| {
            let request = serde_json::from_value(json!({ "items": items })).unwrap();
            handle_create_items(queue_id, request, &pool, clickhouse.clone(), project_id)
        };
        let response_json = |response: HttpResponse| async move {
            assert_eq!(response.status(), 201);
            serde_json::from_slice::<Value>(&to_bytes(response.into_body()).await.unwrap()).unwrap()
        };
        let initial_request = json!([{ "data": {}, "target": "seed", "idempotencyKey": "same" }]);
        let original = response_json(create(initial_request.clone()).await.unwrap()).await;
        let id = Uuid::parse_str(original[0]["id"].as_str().unwrap()).unwrap();

        let read_row = || {
            clickhouse
                .query("SELECT ?fields FROM labeling_queue_items FINAL WHERE project_id = ? AND queue_id = ? AND id = ?")
                .bind(project_id)
                .bind(queue_id)
                .bind(id)
                .fetch_one::<CHLabelingQueueItem>()
        };
        let mut approved = read_row().await.unwrap();
        approved.edit = json!("reviewed").to_string();
        approved.status = 1;
        approved.idempotency_key.clear();
        approved.updated_at += 1;
        insert_labeling_queue_items(clickhouse.clone(), vec![approved])
            .await
            .unwrap();

        let replay = response_json(
            create(json!([
                initial_request[0],
                initial_request[0],
                { "data": {}, "target": "new", "idempotencyKey": "new" }
            ]))
            .await
            .unwrap(),
        )
        .await;
        assert_eq!(replay.as_array().unwrap().len(), 2);
        assert_eq!(replay[0], original[0]);
        let stored = read_row().await.unwrap();
        assert_eq!(stored.edit, json!("reviewed").to_string());
        assert_eq!(stored.status, 1);

        let new_request =
            json!([{ "data": {}, "target": "concurrent", "idempotencyKey": "concurrent" }]);
        let (left, right) = tokio::join!(create(new_request.clone()), create(new_request));
        assert_eq!(
            response_json(left.unwrap()).await,
            response_json(right.unwrap()).await
        );
    }
}
