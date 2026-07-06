//! Shared handler bodies + realtime payloads for debugger session blocks.

use actix_web::{HttpResponse, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{DB, debugger_session_blocks, debugger_sessions::debugger_session_exists, evaluations::Evaluation},
    pubsub::PubSub,
    routes::types::ResponseResult,
    traces::realtime::send_block_update,
};

const SESSION_ID_METADATA_KEY: &str = "rollout.session_id";

pub fn session_id_from_metadata(metadata: Option<&Value>) -> Option<Uuid> {
    metadata
        .and_then(|m| m.get(SESSION_ID_METADATA_KEY))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
}

// Realtime `block_update` payloads (mirror the frontend `SessionBlock`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextBlock {
    id: Uuid,
    #[serde(rename = "type")]
    block_type: &'static str,
    created_at: DateTime<Utc>,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvaluationBlock {
    id: Uuid,
    #[serde(rename = "type")]
    block_type: &'static str,
    created_at: DateTime<Utc>,
    evaluation: EvaluationBlockRef,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvaluationBlockRef {
    id: Uuid,
    name: String,
    group_id: String,
    scores: Vec<Value>,
}

// Scores are empty at creation and fill in when the timeline is next loaded.
pub async fn push_evaluation_block(
    pubsub: &PubSub,
    project_id: &Uuid,
    session_id: &Uuid,
    evaluation: &Evaluation,
) {
    let block = EvaluationBlock {
        id: debugger_session_blocks::evaluation_block_id(session_id, &evaluation.id),
        block_type: "evaluation",
        created_at: evaluation.created_at,
        evaluation: EvaluationBlockRef {
            id: evaluation.id,
            name: evaluation.name.clone(),
            group_id: evaluation.group_id.clone(),
            scores: Vec::new(),
        },
    };
    if let Ok(value) = serde_json::to_value(&block) {
        send_block_update(pubsub, project_id, session_id, value).await;
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddBlockRequest {
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: Value,
}

pub async fn handle_list_blocks(
    project_id: Uuid,
    session_id: Uuid,
    db: &web::Data<DB>,
) -> ResponseResult {
    if !debugger_session_exists(&db.pool, &session_id, &project_id).await? {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }

    let blocks =
        debugger_session_blocks::get_blocks_for_session(&db.pool, &project_id, &session_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "blocks": blocks })))
}

// A `text` block is also pushed to the session live.
pub async fn handle_add_block(
    project_id: Uuid,
    session_id: Uuid,
    body: AddBlockRequest,
    db: &web::Data<DB>,
    pubsub: &PubSub,
) -> ResponseResult {
    match debugger_session_blocks::insert_block(
        &db.pool,
        &project_id,
        &session_id,
        &body.block_type,
        &body.content,
    )
    .await?
    {
        Some((id, created_at)) => {
            if let Some(text) = body
                .content
                .get("text")
                .or_else(|| body.content.get("note"))
                .and_then(|v| v.as_str())
            {
                let block = TextBlock {
                    id,
                    block_type: "text",
                    created_at,
                    text: text.to_string(),
                };
                if let Ok(value) = serde_json::to_value(&block) {
                    send_block_update(pubsub, &project_id, &session_id, value).await;
                }
            }
            Ok(HttpResponse::Ok().json(serde_json::json!({ "id": id })))
        }
        None => Ok(HttpResponse::NotFound().json("Session not found")),
    }
}
