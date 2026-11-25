//! Typed access to `metric_alert_states` and `metric_alert_incidents`.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgConnection, PgPool, types::Json};
use uuid::Uuid;

/// Value of `alerts.type` for metric rules. The rule itself is `alerts.metadata`.
pub const METRIC_ALERT_TYPE: &str = "METRIC";

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MetricAlertRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub project_name: String,
    pub workspace_id: Uuid,
    pub name: String,
    pub metadata: Value,
}

/// Every metric rule in every project. The scheduler is the only caller; all
/// other access is scoped to one project.
pub async fn get_all_metric_alerts(pool: &PgPool) -> anyhow::Result<Vec<MetricAlertRow>> {
    let rows = sqlx::query_as::<_, MetricAlertRow>(
        "SELECT a.id, a.project_id, p.name AS project_name, p.workspace_id, a.name, a.metadata
         FROM alerts a
         JOIN projects p ON p.id = a.project_id
         WHERE a.type = $1
         ORDER BY a.project_id, a.id",
    )
    .bind(METRIC_ALERT_TYPE)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Evaluation state of one rule for one group. `group_key` is empty for rules
/// that are not split.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct MetricAlertStateRow {
    pub alert_id: Uuid,
    pub group_key: String,
    pub project_id: Uuid,
    pub level: String,
    pub streak_level: String,
    pub streak_count: i32,
    pub last_processed_at: Option<DateTime<Utc>>,
    pub last_value: Option<f64>,
    /// The open incident, or the most recent one while it can still reopen.
    pub current_incident_id: Option<Uuid>,
    /// Identifies the rule version this state was computed for.
    pub rule_fingerprint: String,
}

pub async fn get_states(
    pool: &PgPool,
    project_id: &Uuid,
    alert_id: &Uuid,
) -> anyhow::Result<Vec<MetricAlertStateRow>> {
    let rows = sqlx::query_as::<_, MetricAlertStateRow>(
        "SELECT alert_id, group_key, project_id, level, streak_level, streak_count,
                last_processed_at, last_value, current_incident_id, rule_fingerprint
         FROM metric_alert_states
         WHERE alert_id = $1 AND project_id = $2",
    )
    .bind(alert_id)
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Writes the state unless a newer observation was already stored. Returns
/// whether the row was written.
pub async fn upsert_state(
    conn: &mut PgConnection,
    state: &MetricAlertStateRow,
) -> anyhow::Result<bool> {
    let result = sqlx::query(
        "INSERT INTO metric_alert_states (
             alert_id, group_key, project_id, level, streak_level, streak_count,
             last_processed_at, last_value, current_incident_id, rule_fingerprint, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (alert_id, group_key) DO UPDATE SET
             level = EXCLUDED.level,
             streak_level = EXCLUDED.streak_level,
             streak_count = EXCLUDED.streak_count,
             last_processed_at = EXCLUDED.last_processed_at,
             last_value = EXCLUDED.last_value,
             current_incident_id = EXCLUDED.current_incident_id,
             rule_fingerprint = EXCLUDED.rule_fingerprint,
             updated_at = now()
         WHERE metric_alert_states.project_id = EXCLUDED.project_id
           AND (metric_alert_states.rule_fingerprint <> EXCLUDED.rule_fingerprint
                OR metric_alert_states.last_processed_at IS NULL
                OR metric_alert_states.last_processed_at < EXCLUDED.last_processed_at)",
    )
    .bind(state.alert_id)
    .bind(&state.group_key)
    .bind(state.project_id)
    .bind(&state.level)
    .bind(&state.streak_level)
    .bind(state.streak_count)
    .bind(state.last_processed_at)
    .bind(state.last_value)
    .bind(state.current_incident_id)
    .bind(&state.rule_fingerprint)
    .execute(conn)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete_states(
    conn: &mut PgConnection,
    project_id: &Uuid,
    alert_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM metric_alert_states WHERE alert_id = $1 AND project_id = $2")
        .bind(alert_id)
        .bind(project_id)
        .execute(conn)
        .await?;

    Ok(())
}

#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct MetricAlertIncidentRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub alert_id: Uuid,
    pub group_key: String,
    pub level: String,
    pub peak_level: String,
    pub peak_value: f64,
    pub opened_at: DateTime<Utc>,
    pub escalated_at: Option<DateTime<Utc>>,
    pub reopened_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub last_notified_at: Option<DateTime<Utc>>,
    /// Slack channel id to the `ts` of the message that opened the thread.
    pub slack_threads: Json<HashMap<String, String>>,
}

pub async fn get_incidents_by_ids(
    pool: &PgPool,
    project_id: &Uuid,
    incident_ids: &[Uuid],
) -> anyhow::Result<Vec<MetricAlertIncidentRow>> {
    if incident_ids.is_empty() {
        return Ok(vec![]);
    }
    let rows = sqlx::query_as::<_, MetricAlertIncidentRow>(
        "SELECT id, project_id, alert_id, group_key, level, peak_level, peak_value,
                opened_at, escalated_at, reopened_at, resolved_at, last_notified_at, slack_threads
         FROM metric_alert_incidents
         WHERE project_id = $1 AND id = ANY($2)",
    )
    .bind(project_id)
    .bind(incident_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_incident(
    pool: &PgPool,
    project_id: &Uuid,
    incident_id: &Uuid,
) -> anyhow::Result<Option<MetricAlertIncidentRow>> {
    let row = sqlx::query_as::<_, MetricAlertIncidentRow>(
        "SELECT id, project_id, alert_id, group_key, level, peak_level, peak_value,
                opened_at, escalated_at, reopened_at, resolved_at, last_notified_at, slack_threads
         FROM metric_alert_incidents
         WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(incident_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub struct NewIncident<'a> {
    pub project_id: Uuid,
    pub alert_id: Uuid,
    pub group_key: &'a str,
    pub level: &'a str,
    pub value: f64,
    pub opened_at: DateTime<Utc>,
}

pub async fn insert_incident(
    conn: &mut PgConnection,
    incident: &NewIncident<'_>,
) -> anyhow::Result<Uuid> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO metric_alert_incidents (
             project_id, alert_id, group_key, level, peak_level, peak_value, opened_at
         )
         VALUES ($1, $2, $3, $4, $4, $5, $6)
         RETURNING id",
    )
    .bind(incident.project_id)
    .bind(incident.alert_id)
    .bind(incident.group_key)
    .bind(incident.level)
    .bind(incident.value)
    .bind(incident.opened_at)
    .fetch_one(conn)
    .await?;

    Ok(id)
}

/// The mutable part of an incident, written back after each check.
pub struct IncidentUpdate<'a> {
    pub level: &'a str,
    pub peak_level: &'a str,
    pub peak_value: f64,
    pub escalated_at: Option<DateTime<Utc>>,
    pub reopened_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub last_notified_at: Option<DateTime<Utc>>,
}

pub async fn update_incident(
    conn: &mut PgConnection,
    project_id: &Uuid,
    incident_id: &Uuid,
    update: &IncidentUpdate<'_>,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE metric_alert_incidents
         SET level = $3, peak_level = $4, peak_value = $5,
             escalated_at = $6, reopened_at = $7, resolved_at = $8, last_notified_at = $9
         WHERE id = $1 AND project_id = $2",
    )
    .bind(incident_id)
    .bind(project_id)
    .bind(update.level)
    .bind(update.peak_level)
    .bind(update.peak_value)
    .bind(update.escalated_at)
    .bind(update.reopened_at)
    .bind(update.resolved_at)
    .bind(update.last_notified_at)
    .execute(conn)
    .await?;

    Ok(())
}

/// Closes every open incident of a rule, used when an edited rule starts over.
pub async fn resolve_open_incidents(
    conn: &mut PgConnection,
    project_id: &Uuid,
    alert_id: &Uuid,
    resolved_at: DateTime<Utc>,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE metric_alert_incidents SET resolved_at = $3
         WHERE alert_id = $1 AND project_id = $2 AND resolved_at IS NULL",
    )
    .bind(alert_id)
    .bind(project_id)
    .bind(resolved_at)
    .execute(conn)
    .await?;

    Ok(())
}

/// Records the Slack message that opened the incident's thread in a channel.
/// The first writer wins, so a retried delivery cannot move the thread.
pub async fn set_slack_thread(
    pool: &PgPool,
    project_id: &Uuid,
    incident_id: &Uuid,
    channel_id: &str,
    message_ts: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE metric_alert_incidents
         SET slack_threads = jsonb_build_object($3::text, $4::text) || slack_threads
         WHERE id = $1 AND project_id = $2",
    )
    .bind(incident_id)
    .bind(project_id)
    .bind(channel_id)
    .bind(message_ts)
    .execute(pool)
    .await?;

    Ok(())
}

/// Points the incident's thread in a channel at a new message, for when the
/// one that opened it is gone.
pub async fn replace_slack_thread(
    pool: &PgPool,
    project_id: &Uuid,
    incident_id: &Uuid,
    channel_id: &str,
    message_ts: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE metric_alert_incidents
         SET slack_threads = slack_threads || jsonb_build_object($3::text, $4::text)
         WHERE id = $1 AND project_id = $2",
    )
    .bind(incident_id)
    .bind(project_id)
    .bind(channel_id)
    .bind(message_ts)
    .execute(pool)
    .await?;

    Ok(())
}
