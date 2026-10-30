//! Alert CRUD for the CLI (`alerts::`). The frontend writes the same tables through Drizzle
//! (`lib/actions/alerts`, `lib/actions/alert-filters`). `alert_targets` and `alert_filters`
//! cascade from `alerts`.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, FromRow)]
pub struct AlertRow {
    pub id: Uuid,
    pub name: String,
    pub r#type: String,
    pub source_id: Uuid,
    pub signal_name: Option<String>,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct AlertTargetRow {
    pub alert_id: Uuid,
    pub r#type: String,
    pub channel_id: Option<String>,
    pub channel_name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, FromRow)]
pub struct AlertFilterRow {
    pub alert_id: Uuid,
    pub value: Value,
}

/// One target to insert; the caller fills exactly the columns its `type` uses.
pub struct NewAlertTarget<'a> {
    pub r#type: &'a str,
    pub integration_id: Option<Uuid>,
    pub channel_id: Option<&'a str>,
    pub channel_name: Option<&'a str>,
    pub email: Option<&'a str>,
}

/// Alerts in the project, optionally narrowed to one signal and/or one alert id.
pub async fn query_alerts(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Option<Uuid>,
    alert_id: Option<Uuid>,
) -> sqlx::Result<Vec<AlertRow>> {
    sqlx::query_as::<_, AlertRow>(
        "SELECT a.id, a.name, a.type, a.source_id, s.name AS signal_name, a.metadata, a.created_at
         FROM alerts a
         LEFT JOIN signals s ON s.id = a.source_id AND s.project_id = a.project_id
         WHERE a.project_id = $1
           AND ($2::uuid IS NULL OR a.source_id = $2)
           AND ($3::uuid IS NULL OR a.id = $3)
         ORDER BY a.created_at",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(alert_id)
    .fetch_all(pool)
    .await
}

pub async fn get_targets(
    pool: &PgPool,
    project_id: Uuid,
    alert_ids: &[Uuid],
) -> sqlx::Result<Vec<AlertTargetRow>> {
    sqlx::query_as::<_, AlertTargetRow>(
        "SELECT alert_id, type, channel_id, channel_name, email FROM alert_targets
         WHERE project_id = $1 AND alert_id = ANY($2)
         ORDER BY created_at",
    )
    .bind(project_id)
    .bind(alert_ids)
    .fetch_all(pool)
    .await
}

pub async fn get_filters(
    pool: &PgPool,
    project_id: Uuid,
    alert_ids: &[Uuid],
) -> sqlx::Result<Vec<AlertFilterRow>> {
    sqlx::query_as::<_, AlertFilterRow>(
        "SELECT alert_id, value FROM alert_filters
         WHERE project_id = $1 AND alert_id = ANY($2)
         ORDER BY created_at",
    )
    .bind(project_id)
    .bind(alert_ids)
    .fetch_all(pool)
    .await
}

/// The signal's name and payload schema, or `None` when it isn't in this project.
pub async fn get_signal_schema(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> sqlx::Result<Option<(String, Value)>> {
    sqlx::query_as::<_, (String, Value)>(
        "SELECT name, structured_output_schema FROM signals WHERE id = $1 AND project_id = $2",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await
}

pub async fn insert_alert(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    name: &str,
    alert_type: &str,
    source_id: Uuid,
    metadata: &Value,
) -> sqlx::Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO alerts (project_id, name, type, source_id, metadata)
         VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(project_id)
    .bind(name)
    .bind(alert_type)
    .bind(source_id)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await
}

/// Locks the alert row for a read-modify-write; `None` when it isn't in this project.
pub async fn lock_alert(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
) -> sqlx::Result<Option<(String, Uuid, Value)>> {
    sqlx::query_as::<_, (String, Uuid, Value)>(
        "SELECT type, source_id, metadata FROM alerts
         WHERE id = $1 AND project_id = $2 FOR UPDATE",
    )
    .bind(alert_id)
    .bind(project_id)
    .fetch_optional(&mut **tx)
    .await
}

pub async fn update_alert(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
    name: Option<&str>,
    metadata: &Value,
) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE alerts SET name = COALESCE($3, name), metadata = $4
         WHERE id = $1 AND project_id = $2",
    )
    .bind(alert_id)
    .bind(project_id)
    .bind(name)
    .bind(metadata)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn insert_targets(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
    targets: &[NewAlertTarget<'_>],
) -> sqlx::Result<()> {
    for target in targets {
        sqlx::query(
            "INSERT INTO alert_targets
             (project_id, alert_id, type, integration_id, channel_id, channel_name, email)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(project_id)
        .bind(alert_id)
        .bind(target.r#type)
        .bind(target.integration_id)
        .bind(target.channel_id)
        .bind(target.channel_name)
        .bind(target.email)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// Removes the caller's own email target. Other members' email targets are never touched.
pub async fn delete_email_target(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
    email: &str,
) -> sqlx::Result<()> {
    sqlx::query(
        "DELETE FROM alert_targets
         WHERE alert_id = $1 AND project_id = $2 AND type = 'EMAIL' AND email = $3",
    )
    .bind(alert_id)
    .bind(project_id)
    .bind(email)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn delete_slack_targets(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
) -> sqlx::Result<()> {
    sqlx::query(
        "DELETE FROM alert_targets WHERE alert_id = $1 AND project_id = $2 AND type = 'SLACK'",
    )
    .bind(alert_id)
    .bind(project_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Replaces every filter group on the alert.
pub async fn replace_filters(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_id: Uuid,
    groups: &[Value],
) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM alert_filters WHERE alert_id = $1 AND project_id = $2")
        .bind(alert_id)
        .bind(project_id)
        .execute(&mut **tx)
        .await?;
    for group in groups {
        sqlx::query("INSERT INTO alert_filters (alert_id, project_id, value) VALUES ($1, $2, $3)")
            .bind(alert_id)
            .bind(project_id)
            .bind(group)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

/// Returns whether a row was deleted. Targets and filters cascade.
pub async fn delete_alert(pool: &PgPool, project_id: Uuid, alert_id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM alerts WHERE id = $1 AND project_id = $2")
        .bind(alert_id)
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
