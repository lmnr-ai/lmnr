use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::db::signal_triggers::{self, TriggerPatch, TriggerRow};

/// No FK from alerts.source_id — delete in application code.
const ALERT_TYPE_SIGNAL_EVENT: &str = "SIGNAL_EVENT";
const ALERT_TYPE_NEW_CLUSTER: &str = "NEW_CLUSTER";
const SEVERITY_CRITICAL: i32 = 2;

/// `disabled` is only persisted when true; absence means enabled.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default)]
    pub sample_rate: Option<i16>,
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
impl SignalMetadata {
    pub fn disabled(&self) -> bool {
        self.disabled.unwrap_or(false)
    }
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
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

pub async fn get_signal_row(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Option<SignalRow>> {
    let row = sqlx::query_as::<_, SignalRow>(
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, created_at
         FROM signals
         WHERE id = $1 AND project_id = $2",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SignalRow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum CreateSignalError {
    #[error("{0}")]
    DuplicateName(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub async fn create_signal_with_alerts(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
    prompt: &str,
    structured_output_schema: &Value,
    metadata: &Value,
    clustering_enabled: bool,
    subscriber_email: Option<&str>,
    conditions: &Value,
    filters: &Value,
    mode: i16,
) -> Result<(SignalRow, TriggerRow), CreateSignalError> {
    let mut tx = pool.begin().await.map_err(anyhow::Error::from)?;

    let signal = sqlx::query_as::<_, SignalRow>(
        "INSERT INTO signals (project_id, name, prompt, structured_output_schema, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, created_at",
    )
    .bind(project_id)
    .bind(name)
    .bind(prompt)
    .bind(structured_output_schema)
    .bind(metadata)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23505") => {
            CreateSignalError::DuplicateName(name.to_string())
        }
        _ => CreateSignalError::Other(anyhow::Error::from(e)),
    })?;

    let alert_ids =
        insert_signal_alerts(&mut tx, project_id, signal.id, name, clustering_enabled).await?;

    if let Some(email) = subscriber_email {
        insert_email_alert_targets(&mut tx, project_id, &alert_ids, email).await?;
    }

    let trigger_row = signal_triggers::insert_signal_trigger(
        &mut tx, project_id, signal.id, conditions, filters, mode,
    )
    .await
    .map_err(CreateSignalError::Other)?;

    tx.commit().await.map_err(anyhow::Error::from)?;

    Ok((signal, trigger_row))
}

async fn insert_signal_alerts(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    signal_id: Uuid,
    signal_name: &str,
    clustering_enabled: bool,
) -> Result<Vec<Uuid>, CreateSignalError> {
    let mut alert_ids = Vec::with_capacity(2);

    let event_alert_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO alerts (project_id, name, type, source_id, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(project_id)
    .bind(format!("{signal_name} alert"))
    .bind(ALERT_TYPE_SIGNAL_EVENT)
    .bind(signal_id)
    .bind(json!({
        "severities": [SEVERITY_CRITICAL],
        "skipSimilar": clustering_enabled,
    }))
    .fetch_one(&mut **tx)
    .await
    .map_err(anyhow::Error::from)?;
    alert_ids.push(event_alert_id);

    if clustering_enabled {
        let cluster_alert_id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO alerts (project_id, name, type, source_id, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(project_id)
        .bind(format!("{signal_name} cluster alert"))
        .bind(ALERT_TYPE_NEW_CLUSTER)
        .bind(signal_id)
        .bind(json!({}))
        .fetch_one(&mut **tx)
        .await
        .map_err(anyhow::Error::from)?;
        alert_ids.push(cluster_alert_id);
    }

    Ok(alert_ids)
}

async fn insert_email_alert_targets(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    alert_ids: &[Uuid],
    email: &str,
) -> Result<(), CreateSignalError> {
    for alert_id in alert_ids {
        sqlx::query(
            "INSERT INTO alert_targets (project_id, alert_id, type, email)
             VALUES ($1, $2, 'EMAIL', $3)",
        )
        .bind(project_id)
        .bind(alert_id)
        .bind(email)
        .execute(&mut **tx)
        .await
        .map_err(anyhow::Error::from)?;
    }
    Ok(())
}

#[derive(Debug, Default)]
pub struct SignalUpdate {
    pub prompt: Option<String>,
    pub structured_output_schema: Option<Value>,
    /// Outer `None` = leave stored; `Some(None)` = clear sampling.
    pub sample_rate: Option<Option<i16>>,
    pub disabled: Option<bool>,
}

pub async fn update_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
    update: SignalUpdate,
    trigger_patch: TriggerPatch,
) -> Result<Option<(SignalRow, Option<TriggerRow>)>> {
    let mut tx = pool.begin().await?;

    let existing = sqlx::query_as::<_, SignalRow>(
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, created_at
         FROM signals
         WHERE id = $1 AND project_id = $2
         FOR UPDATE",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(existing) = existing else {
        return Ok(None);
    };

    let metadata = merge_signal_metadata(&existing.metadata, &update);

    let updated = sqlx::query_as::<_, SignalRow>(
        "UPDATE signals
         SET prompt = $3, structured_output_schema = $4, metadata = $5
         WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, created_at",
    )
    .bind(signal_id)
    .bind(project_id)
    .bind(update.prompt.unwrap_or(existing.prompt))
    .bind(
        update
            .structured_output_schema
            .unwrap_or(existing.structured_output_schema),
    )
    .bind(metadata)
    .fetch_one(&mut *tx)
    .await?;

    let trigger_row =
        signal_triggers::patch_signal_trigger(&mut tx, project_id, signal_id, trigger_patch)
            .await?;

    tx.commit().await?;

    Ok(Some((updated, trigger_row)))
}

fn merge_signal_metadata(stored: &Value, update: &SignalUpdate) -> Value {
    let mut map = match stored {
        Value::Object(map) => map.clone(),
        _ => serde_json::Map::new(),
    };

    if let Some(sample_rate) = update.sample_rate {
        match sample_rate {
            Some(rate) => {
                map.insert("sampleRate".to_string(), json!(rate));
            }
            None => {
                map.remove("sampleRate");
            }
        }
    }

    if let Some(disabled) = update.disabled {
        if disabled {
            map.insert("disabled".to_string(), json!(true));
        } else {
            map.remove("disabled");
        }
    }

    Value::Object(map)
}

pub async fn delete_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Option<SignalRow>> {
    let mut tx = pool.begin().await?;

    // Lock before touching signal_triggers — no FK serializes the two paths.
    let locked = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM signals WHERE id = $1 AND project_id = $2 FOR UPDATE",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?;

    if locked.is_none() {
        return Ok(None);
    }

    sqlx::query("DELETE FROM signal_triggers WHERE project_id = $1 AND signal_id = $2")
        .bind(project_id)
        .bind(signal_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "DELETE FROM alerts
         WHERE project_id = $1 AND source_id = $2 AND type = ANY($3)",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(vec![
        ALERT_TYPE_SIGNAL_EVENT.to_string(),
        ALERT_TYPE_NEW_CLUSTER.to_string(),
    ])
    .execute(&mut *tx)
    .await?;

    let deleted = sqlx::query_as::<_, SignalRow>(
        "DELETE FROM signals
         WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, created_at",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(deleted)
}

fn escape_like_pattern(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub async fn list_signals(
    pool: &PgPool,
    project_id: Uuid,
    name: Option<&str>,
) -> Result<Vec<SignalRow>> {
    let pattern = name.map(|n| format!("%{}%", escape_like_pattern(n)));

    let signals = sqlx::query_as::<_, SignalRow>(
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, created_at
         FROM signals
         WHERE project_id = $1
           AND ($2::text IS NULL OR name ILIKE $2 ESCAPE '\\')
         ORDER BY created_at DESC",
    )
    .bind(project_id)
    .bind(pattern)
    .fetch_all(pool)
    .await?;

    Ok(signals)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn like_pattern_escapes_wildcards() {
        assert_eq!(escape_like_pattern("wildcard_test"), r"wildcard\_test");
        assert_eq!(escape_like_pattern("100%"), r"100\%");
        // Escape `\` first or it would escape our own `_`/`%` escapes.
        assert_eq!(escape_like_pattern(r"a\_b"), r"a\\\_b");
        assert_eq!(escape_like_pattern("plain name"), "plain name");
    }

    #[test]
    fn update_preserves_unmentioned_metadata_keys() {
        let stored = json!({ "sampleRate": 30, "disabled": true, "futureKey": "keep" });
        let merged = merge_signal_metadata(&stored, &SignalUpdate::default());
        assert_eq!(merged, stored, "an empty patch must be a no-op");
    }

    #[test]
    fn setting_sample_rate_overwrites() {
        let stored = json!({ "sampleRate": 30, "disabled": true });
        let merged = merge_signal_metadata(
            &stored,
            &SignalUpdate {
                sample_rate: Some(Some(40)),
                ..Default::default()
            },
        );
        assert_eq!(merged, json!({ "sampleRate": 40, "disabled": true }));
    }

    #[test]
    fn clearing_sample_rate_removes_the_key() {
        let stored = json!({ "sampleRate": 30, "disabled": true });
        let cleared = merge_signal_metadata(
            &stored,
            &SignalUpdate {
                sample_rate: Some(None),
                ..Default::default()
            },
        );
        assert_eq!(cleared, json!({ "disabled": true }));
    }

    #[test]
    fn clearing_disabled_removes_the_key() {
        let stored = json!({ "sampleRate": 30, "disabled": true });
        let re_enabled = merge_signal_metadata(
            &stored,
            &SignalUpdate {
                disabled: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(re_enabled, json!({ "sampleRate": 30 }));
    }

    #[test]
    fn non_object_stored_metadata_degrades_to_empty() {
        let merged = merge_signal_metadata(
            &json!("garbage"),
            &SignalUpdate {
                disabled: Some(true),
                ..Default::default()
            },
        );
        assert_eq!(merged, json!({ "disabled": true }));
    }
}
