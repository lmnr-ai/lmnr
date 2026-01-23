use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SignalJob {
    pub id: Uuid,
    pub signal_id: Uuid,
    pub project_id: Uuid,
    pub total_traces: i32,
    pub processed_traces: i32,
    pub failed_traces: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_signal_job(
    pool: &PgPool,
    signal_id: Uuid,
    project_id: Uuid,
    total_traces: i32,
) -> Result<SignalJob> {
    let job = sqlx::query_as::<_, SignalJob>(
        "INSERT INTO signal_jobs (signal_id, project_id, total_traces)
        VALUES ($1, $2, $3)
        RETURNING id, signal_id, project_id, total_traces, processed_traces, failed_traces, created_at, updated_at",
    )
    .bind(signal_id)
    .bind(project_id)
    .bind(total_traces)
    .fetch_one(pool)
    .await?;

    Ok(job)
}

pub async fn update_signal_job_stats(
    pool: &PgPool,
    job_id: Uuid,
    processed_traces_delta: i32,
    failed_traces_delta: i32,
) -> Result<()> {
    sqlx::query(
        "UPDATE signal_jobs
        SET processed_traces = processed_traces + $2,
            failed_traces = failed_traces + $3,
            updated_at = NOW()
        WHERE id = $1",
    )
    .bind(job_id)
    .bind(processed_traces_delta)
    .bind(failed_traces_delta)
    .execute(pool)
    .await?;

    Ok(())
}
