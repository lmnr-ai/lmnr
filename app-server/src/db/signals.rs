use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::notifications::AlertType;

/// User-controlled signal settings stored in the `metadata` jsonb column.
/// `disabled` is only persisted when true; absence means enabled (active).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default)]
    pub sample_rate: Option<i16>,
}

impl SignalMetadata {
    /// Enabled by default when the `disabled` key is absent (historical signals).
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub fn disabled(&self) -> bool {
        self.disabled.unwrap_or(false)
    }
}

/// Signal with prompt and schema
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Signal {
    #[serde(default)]
    pub id: Uuid,
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
    #[serde(default)]
    #[sqlx(json)]
    pub metadata: SignalMetadata,
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_signal(
    pool: &PgPool,
    signal_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Signal>> {
    let signal = sqlx::query_as::<_, Signal>(
        "SELECT id, name, prompt, structured_output_schema, metadata
        FROM signals
        WHERE id = $1 AND project_id = $2",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(signal)
}

#[derive(Debug, thiserror::Error)]
pub enum CreateSignalError {
    #[error("A signal named \"{0}\" already exists in this project")]
    DuplicateName(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// Creates a signal plus its auto-created alerts and (optional) email targets in
/// one transaction, mirroring the frontend `createSignal` action exactly:
///   - 1 `signals` row (unique on `(project_id, name)` → `DuplicateName`).
///   - 1 `SIGNAL_EVENT` alert (`severities: [2]`, `skipSimilar: clustering_enabled`);
///     +1 `NEW_CLUSTER` alert (`metadata: {}`) iff `clustering_enabled`.
///   - 1 EMAIL `alert_targets` row per created alert iff `subscriber_email` is set.
/// Triggers are NOT created here — they are a separate write (see `signal_triggers`).
pub async fn create_signal_with_alerts(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
    prompt: &str,
    structured_output_schema: &Value,
    metadata: &Value,
    clustering_enabled: bool,
    subscriber_email: Option<&str>,
) -> Result<(Uuid, DateTime<Utc>), CreateSignalError> {
    let mut tx = pool.begin().await.map_err(anyhow::Error::from)?;

    let insert_signal = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "INSERT INTO signals (project_id, name, prompt, structured_output_schema, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at",
    )
    .bind(project_id)
    .bind(name)
    .bind(prompt)
    .bind(structured_output_schema)
    .bind(metadata)
    .fetch_one(&mut *tx)
    .await;

    let (signal_id, created_at) = match insert_signal {
        Ok(row) => row,
        Err(e) => {
            if e.as_database_error().is_some_and(|db| db.is_unique_violation()) {
                return Err(CreateSignalError::DuplicateName(name.to_string()));
            }
            return Err(anyhow::Error::from(e).into());
        }
    };

    // SIGNAL_EVENT alert: severity CRITICAL (2). skipSimilar depends on the
    // clustering service — false when disabled so the backend doesn't silently
    // drop notifications.
    let mut alert_ids = vec![
        insert_alert(
            &mut tx,
            project_id,
            &format!("{name} alert"),
            AlertType::SignalEvent,
            signal_id,
            &serde_json::json!({ "severities": [2], "skipSimilar": clustering_enabled }),
        )
        .await?,
    ];

    if clustering_enabled {
        alert_ids.push(
            insert_alert(
                &mut tx,
                project_id,
                &format!("{name} cluster alert"),
                AlertType::NewCluster,
                signal_id,
                &serde_json::json!({}),
            )
            .await?,
        );
    }

    if let Some(email) = subscriber_email {
        for alert_id in &alert_ids {
            sqlx::query(
                "INSERT INTO alert_targets (alert_id, project_id, type, email)
                 VALUES ($1, $2, 'EMAIL', $3)",
            )
            .bind(alert_id)
            .bind(project_id)
            .bind(email)
            .execute(&mut *tx)
            .await
            .map_err(anyhow::Error::from)?;
        }
    }

    tx.commit().await.map_err(anyhow::Error::from)?;

    Ok((signal_id, created_at))
}

async fn insert_alert(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    project_id: Uuid,
    name: &str,
    alert_type: AlertType,
    source_id: Uuid,
    metadata: &Value,
) -> Result<Uuid, anyhow::Error> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO alerts (project_id, name, type, source_id, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(project_id)
    .bind(name)
    .bind(alert_type.as_str())
    .bind(source_id)
    .bind(metadata)
    .fetch_one(&mut **tx)
    .await?;
    Ok(id)
}
