//! Stored `value` is exposed as `conditions` (legacy column name).

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TriggerRow {
    pub id: Uuid,
    #[sqlx(rename = "value")]
    pub conditions: Value,
    pub filters: Value,
    pub created_at: DateTime<Utc>,
    pub mode: i16,
}

pub async fn replace_signal_triggers(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    signal_id: Uuid,
    triggers: &[(Value, Value, i16)],
) -> Result<Vec<TriggerRow>> {
    sqlx::query("DELETE FROM signal_triggers WHERE project_id = $1 AND signal_id = $2")
        .bind(project_id)
        .bind(signal_id)
        .execute(&mut **tx)
        .await?;

    let mut rows = Vec::with_capacity(triggers.len());
    for (conditions, filters, mode) in triggers {
        let row = sqlx::query_as::<_, TriggerRow>(
            "INSERT INTO signal_triggers (project_id, signal_id, value, filters, mode)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, value, filters, created_at, mode",
        )
        .bind(project_id)
        .bind(signal_id)
        .bind(conditions)
        .bind(filters)
        .bind(mode)
        .fetch_one(&mut **tx)
        .await?;
        rows.push(row);
    }

    Ok(rows)
}

pub async fn get_signal_triggers(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Vec<TriggerRow>> {
    let rows = sqlx::query_as::<_, TriggerRow>(
        "SELECT id, value, filters, created_at, mode
         FROM signal_triggers
         WHERE project_id = $1 AND signal_id = $2
         ORDER BY created_at DESC",
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
