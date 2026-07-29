use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// A created signal trigger. `filters` is the stored `value` jsonb (the DB
/// column is `value`; the API surfaces it as `filters`).
pub struct CreatedTrigger {
    pub id: Uuid,
    pub filters: Value,
    pub created_at: DateTime<Utc>,
    pub mode: i16,
}

/// Insert one `signal_triggers` row. `mode`: 0 = batch, 1 = realtime.
/// Cache invalidation of `signal_triggers_v2:{project_id}` is the caller's job
/// (it holds the `Cache` handle) — see the signals CRUD service.
pub async fn create_signal_trigger(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
    filters: &Value,
    mode: i16,
) -> Result<CreatedTrigger> {
    let (id, created_at) = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "INSERT INTO signal_triggers (project_id, signal_id, value, mode)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(filters)
    .bind(mode)
    .fetch_one(pool)
    .await?;

    Ok(CreatedTrigger {
        id,
        filters: filters.clone(),
        created_at,
        mode,
    })
}
