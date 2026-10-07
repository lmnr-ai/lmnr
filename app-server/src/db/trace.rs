use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
    PLAYGROUND,
}

// Frontend `traceType` union — must stay the variant name, not the CH u8.
impl std::fmt::Display for TraceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TraceType::DEFAULT => write!(f, "DEFAULT"),
            TraceType::EVENT => write!(f, "EVENT"),
            TraceType::EVALUATION => write!(f, "EVALUATION"),
            TraceType::PLAYGROUND => write!(f, "PLAYGROUND"),
        }
    }
}

pub async fn insert_shared_traces(
    pool: &PgPool,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> Result<()> {
    if trace_ids.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO shared_traces (project_id, id) SELECT $1, id FROM UNNEST($2::uuid[]) AS t(id)
        ON CONFLICT (id) DO UPDATE SET project_id = $1",
    )
    .bind(project_id)
    .bind(trace_ids)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_shared_traces(
    pool: &PgPool,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> Result<()> {
    if trace_ids.is_empty() {
        return Ok(());
    }

    sqlx::query("DELETE FROM shared_traces WHERE project_id = $1 AND id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(pool)
        .await?;

    Ok(())
}
