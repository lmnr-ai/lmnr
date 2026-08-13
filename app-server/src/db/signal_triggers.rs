//! `signal_triggers` CRUD.
//!
//! The table carries TWO jsonb `Filter[]` columns with different semantics
//! (LAM-2031), and mixing them silently breaks signals:
//!
//! * `value` — the trigger CONDITIONS: WHEN the signal is evaluated. Decidable
//!   from a single span batch (`root_span_finished`, `span_name`). An EMPTY list
//!   never fires, so a signal with no conditions looks configured but is inert.
//! * `filters` — WHETHER a fired trigger runs. Properties of the whole trace
//!   (`total_token_count`, `status`, `span_names`), read from ClickHouse
//!   `traces_agg`. An empty list passes (run on every trace that fired).
//!
//! The API surfaces `value` as `conditions`, matching the frontend `Trigger`
//! type — the column name is legacy.

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

/// A `signal_triggers` row. `conditions` is the stored `value` column.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TriggerRow {
    pub id: Uuid,
    #[sqlx(rename = "value")]
    pub conditions: Value,
    pub filters: Value,
    pub created_at: DateTime<Utc>,
    pub mode: i16,
}

/// Replace a signal's triggers **inside a caller-supplied transaction**, returning
/// the new rows. Delete-then-insert rather than a per-row diff: trigger rows carry
/// no stable client-facing identity (the CLI addresses signals, not trigger ids),
/// so a wholesale replace is both simpler and atomic.
///
/// Takes the `Transaction` rather than the pool so signal creation / update can
/// commit the signal, its alerts, and its triggers together. Splitting them across
/// two transactions leaves a named signal with no triggers when the second fails —
/// silently inert, and un-retryable because re-creating it hits the unique-name 409.
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

/// A signal's triggers, newest first.
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
