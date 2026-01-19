use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceAnalysisJob {
    pub id: Uuid,
    pub event_definition_id: Uuid,
    pub project_id: Uuid,
    pub total_traces: i32,
    pub processed_traces: i32,
    pub failed_traces: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_trace_analysis_job(
    pool: &PgPool,
    event_definition_id: Uuid,
    project_id: Uuid,
    total_traces: i32,
) -> Result<TraceAnalysisJob> {
    let job = sqlx::query_as::<_, TraceAnalysisJob>(
        "INSERT INTO trace_analysis_jobs (event_definition_id, project_id, total_traces)
        VALUES ($1, $2, $3)
        RETURNING id, event_definition_id, project_id, total_traces, processed_traces, failed_traces, created_at, updated_at",
    )
    .bind(event_definition_id)
    .bind(project_id)
    .bind(total_traces)
    .fetch_one(pool)
    .await?;

    Ok(job)
}

pub async fn get_trace_analysis_job(
    pool: &PgPool,
    job_id: Uuid,
) -> Result<Option<TraceAnalysisJob>> {
    let job = sqlx::query_as::<_, TraceAnalysisJob>(
        "SELECT id, event_definition_id, project_id, total_traces, processed_traces, failed_traces, created_at, updated_at
        FROM trace_analysis_jobs
        WHERE id = $1",
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await?;

    Ok(job)
}

pub async fn update_trace_analysis_job_statistics(
    pool: &PgPool,
    job_id: Uuid,
    total_traces: i32,
    processed_traces: i32,
    failed_traces: i32,
) -> Result<()> {
    sqlx::query(
        "UPDATE trace_analysis_jobs
        SET total_traces = $2, processed_traces = $3, failed_traces = $4, updated_at = NOW()
        WHERE id = $1",
    )
    .bind(job_id)
    .bind(total_traces)
    .bind(processed_traces)
    .bind(failed_traces)
    .execute(pool)
    .await?;

    Ok(())
}
