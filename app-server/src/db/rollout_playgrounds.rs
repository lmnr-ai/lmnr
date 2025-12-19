use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, types::Json};
use uuid::Uuid;

use std::collections::HashMap;

#[derive(Deserialize, Serialize, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RolloutPlayground {
    pub id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub path_to_count: Json<HashMap<String, u32>>,
    pub cursor_timestamp: DateTime<Utc>,
}

pub async fn get_rollout_playground(
    pool: &PgPool,
    session_id: &Uuid,
    project_id: &Uuid,
) -> Result<Option<RolloutPlayground>> {
    let result = sqlx::query_as::<_, RolloutPlayground>(
        "SELECT
            rollout_playgrounds.id,
            rollout_playgrounds.project_id,
            rollout_playgrounds.trace_id,
            rollout_playgrounds.path_to_count,
            rollout_playgrounds.cursor_timestamp
        FROM
            rollout_playgrounds
        WHERE
            rollout_playgrounds.id = $1
            and rollout_playgrounds.project_id = $2",
    )
    .bind(session_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(result)
}
