//! A signal's firing config: one row per signal, with the condition list in the
//! legacy `value` column exposed here as `conditions`.

use std::collections::HashMap;

use anyhow::Result;
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TriggerRow {
    pub id: Uuid,
    #[sqlx(rename = "value")]
    pub conditions: Value,
    pub filters: Value,
    pub mode: i16,
}

/// Fields to overwrite; `None` keeps the stored value.
#[derive(Debug, Default)]
pub struct TriggerPatch {
    pub conditions: Option<Value>,
    pub filters: Option<Value>,
    pub mode: Option<i16>,
}

impl TriggerPatch {
    pub fn is_empty(&self) -> bool {
        self.conditions.is_none() && self.filters.is_none() && self.mode.is_none()
    }
}

pub async fn insert_signal_trigger(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    signal_id: Uuid,
    conditions: &Value,
    filters: &Value,
    mode: i16,
) -> Result<TriggerRow> {
    let row = sqlx::query_as::<_, TriggerRow>(
        "INSERT INTO signal_triggers (project_id, signal_id, value, filters, mode)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, value, filters, mode",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(conditions)
    .bind(filters)
    .bind(mode)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row)
}

/// Merge `patch` into the newest row. Does not create one.
pub async fn patch_signal_trigger(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    signal_id: Uuid,
    patch: TriggerPatch,
) -> Result<Option<TriggerRow>> {
    let existing = sqlx::query_as::<_, TriggerRow>(
        "SELECT id, value, filters, mode
         FROM signal_triggers
         WHERE project_id = $1 AND signal_id = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE",
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_optional(&mut **tx)
    .await?;

    let Some(existing) = existing else {
        return Ok(None);
    };

    if patch.is_empty() {
        return Ok(Some(existing));
    }

    // Collapse duplicates a pre-split signal accumulated onto the row we locked,
    // so the one-trigger-per-signal contract holds afterwards.
    sqlx::query(
        "DELETE FROM signal_triggers WHERE project_id = $1 AND signal_id = $2 AND id <> $3",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(existing.id)
    .execute(&mut **tx)
    .await?;

    let row = sqlx::query_as::<_, TriggerRow>(
        "UPDATE signal_triggers
         SET value = $3, filters = $4, mode = $5
         WHERE project_id = $1 AND id = $2
         RETURNING id, value, filters, mode",
    )
    .bind(project_id)
    .bind(existing.id)
    .bind(patch.conditions.unwrap_or(existing.conditions))
    .bind(patch.filters.unwrap_or(existing.filters))
    .bind(patch.mode.unwrap_or(existing.mode))
    .fetch_one(&mut **tx)
    .await?;

    Ok(Some(row))
}

pub async fn get_signal_trigger(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Option<TriggerRow>> {
    let row = sqlx::query_as::<_, TriggerRow>(
        "SELECT id, value, filters, mode
         FROM signal_triggers
         WHERE project_id = $1 AND signal_id = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 1",
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

#[derive(Debug, sqlx::FromRow)]
struct SignalTriggerRow {
    signal_id: Uuid,
    id: Uuid,
    #[sqlx(rename = "value")]
    conditions: Value,
    filters: Value,
    mode: i16,
}

/// One trigger per requested signal, resolved the same way as
/// `get_signal_trigger`. Rows inserted in one transaction share a `created_at`,
/// so `id` breaks the tie — without it a signal could report a different trigger
/// per request.
pub async fn get_project_signal_triggers(
    pool: &PgPool,
    project_id: Uuid,
    signal_ids: &[Uuid],
) -> Result<HashMap<Uuid, TriggerRow>> {
    if signal_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = sqlx::query_as::<_, SignalTriggerRow>(
        "SELECT DISTINCT ON (signal_id)
             signal_id, id, value, filters, mode
         FROM signal_triggers
         WHERE project_id = $1 AND signal_id = ANY($2)
         ORDER BY signal_id, created_at DESC, id DESC",
    )
    .bind(project_id)
    .bind(signal_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.signal_id,
                TriggerRow {
                    id: row.id,
                    conditions: row.conditions,
                    filters: row.filters,
                    mode: row.mode,
                },
            )
        })
        .collect())
}
