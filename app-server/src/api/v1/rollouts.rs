use actix_web::{HttpResponse, post, web};
use clickhouse::Row;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sqlx::types::Json;
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    db::{DB, project_api_keys::ProjectApiKey, rollout_playgrounds::get_rollout_playground},
    routes::types::ResponseResult,
};

#[derive(Deserialize)]
pub struct RolloutRequest {
    pub path: String,
    pub index: i32,
}

fn deserialize_json_string<'de, D>(deserializer: D) -> Result<Value, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    serde_json::from_str(&s).map_err(serde::de::Error::custom)
}

#[derive(Row, Serialize, Deserialize, Clone)]
pub struct RolloutSpan {
    pub input: String,
    pub output: String,
    pub name: String,
    #[serde(deserialize_with = "deserialize_json_string")]
    pub attributes: Value,
}

#[derive(Serialize)]
pub struct RolloutResponse {
    pub span: RolloutSpan,
    pub path_to_count: Json<HashMap<String, i32>>,
}

#[post("rollouts/{session_id}")]
pub async fn get_rollout(
    path: web::Path<String>,
    body: web::Json<RolloutRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = Uuid::parse_str(&path.into_inner()).unwrap();
    let project_id = project_api_key.project_id;

    // Fetch rollout playground
    let rollout_playground = match get_rollout_playground(&db.pool, &session_id, &project_id).await
    {
        Ok(rollout_playground) => rollout_playground,
        Err(e) => {
            if let Some(sqlx::Error::RowNotFound) = e.downcast_ref::<sqlx::Error>() {
                return Err(crate::routes::error::Error::NotFound(
                    "No rollout playground was found for given id".to_string(),
                ));
            }
            return Err(e.into());
        }
    };

    // Find the maximum mock index for the given path
    let max_mock_index = match rollout_playground.path_to_count.get(&body.path) {
        Some(path_count) => *path_count,
        None => {
            return Err(crate::routes::error::Error::NotFound(
                "Path not found in rollout playground".to_string(),
            ));
        }
    };

    if body.index > max_mock_index {
        return Err(crate::routes::error::Error::NotFound(
            "Given index is larger than maximum mock index".to_string(),
        ));
    }

    // Find all spans with given trace_id and path
    let spans = clickhouse
        .query(
            "SELECT input, output, name, attributes
            FROM spans 
            WHERE project_id = ? AND trace_id = ? AND path = ?
            ORDER BY start_time ASC",
        )
        .bind(project_id)
        .bind(rollout_playground.trace_id)
        .bind(&body.path)
        .fetch_all::<RolloutSpan>()
        .await?;

    // Return the span at the given index
    let index = body.index as usize;
    if spans.len() <= index {
        return Err(crate::routes::error::Error::NotFound(
            "Index not found in rollout playground".to_string(),
        ));
    }

    let response = RolloutResponse {
        span: spans[index].clone(),
        path_to_count: rollout_playground.path_to_count,
    };

    Ok(HttpResponse::Ok().json(response))
}
