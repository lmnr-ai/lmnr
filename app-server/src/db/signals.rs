use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

/// Alert types auto-created alongside a signal. `source_id` on those rows points
/// at the signal, but there is deliberately NO FK, so deleting a signal must
/// delete them in application code.
const ALERT_TYPE_SIGNAL_EVENT: &str = "SIGNAL_EVENT";
const ALERT_TYPE_NEW_CLUSTER: &str = "NEW_CLUSTER";
/// Mirrors the frontend `SEVERITY_LEVEL.CRITICAL`.
const SEVERITY_CRITICAL: i32 = 2;

/// User-controlled signal settings stored in the `metadata` jsonb column.
/// `disabled` is only persisted when true; absence means enabled (active).
///
/// Read by the signals-gated evaluator; the CRUD path below manipulates the raw
/// jsonb so it can preserve keys it doesn't model.
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
    /// Enabled by default when the `disabled` key is absent (historical signals).
    pub fn disabled(&self) -> bool {
        self.disabled.unwrap_or(false)
    }
}

/// Signal with prompt and schema, as the signals-gated evaluator reads it.
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

/// A signal row as returned by the CRUD surface. `metadata` is kept raw here so
/// updates can merge over stored keys they don't understand.
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

/// Distinguishes the unique-name violation from every other failure so the route
/// can answer 409 instead of 500. `signals_project_id_name_key` is a UNIQUE
/// constraint on `(project_id, name)`.
#[derive(Debug, thiserror::Error)]
pub enum CreateSignalError {
    #[error("{0}")]
    DuplicateName(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// Insert a signal plus its triggers, the alerts, and the creator email targets
/// the UI creates — all in ONE transaction.
///
/// Triggers are written here rather than by a follow-up call because a signal
/// committed without them is silently inert AND un-retryable: re-creating it hits
/// the unique-name 409, so the caller is stuck with a broken signal.
///
/// `clustering_enabled` mirrors the frontend `Feature.CLUSTERING` gate: it adds
/// the `NEW_CLUSTER` alert and sets `skipSimilar`. With clustering off,
/// `skipSimilar` MUST be false or the backend silently drops notifications.
pub async fn create_signal_with_alerts(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
    prompt: &str,
    structured_output_schema: &Value,
    metadata: &Value,
    clustering_enabled: bool,
    subscriber_email: Option<&str>,
    triggers: &[(Value, Value, i16)],
) -> Result<(SignalRow, Vec<crate::db::signal_triggers::TriggerRow>), CreateSignalError> {
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
        // 23505 = unique_violation. Only one unique constraint exists on this
        // table, so the name is the only thing that can collide.
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

    let trigger_rows = crate::db::signal_triggers::replace_signal_triggers(
        &mut tx, project_id, signal.id, triggers,
    )
    .await
    .map_err(CreateSignalError::Other)?;

    tx.commit().await.map_err(anyhow::Error::from)?;

    Ok((signal, trigger_rows))
}

/// The alert set the UI auto-creates for a new signal: a CRITICAL `SIGNAL_EVENT`
/// alert always, plus a `NEW_CLUSTER` alert when clustering is on.
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

/// Subscribe one email to every alert just created for the signal.
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

/// Fields an update may change. `None` means "leave as stored" — the CLI sends a
/// partial patch, so absent fields must not clobber (an update without
/// `disabled` must not silently re-enable a deactivated signal).
#[derive(Debug, Default)]
pub struct SignalUpdate {
    pub prompt: Option<String>,
    pub structured_output_schema: Option<Value>,
    /// Outer `None` = leave stored; `Some(None)` = clear the sampling rate.
    pub sample_rate: Option<Option<i16>>,
    pub disabled: Option<bool>,
}

/// Update a signal in place, merging metadata over the stored jsonb, and
/// optionally replace its triggers **in the same transaction**. Returns `None`
/// when the signal doesn't exist in this project (404, not 500).
///
/// `triggers: Some(_)` replaces the whole set; `None` leaves them untouched (and
/// the returned vec is then read separately by the caller). Sharing one
/// transaction means a failed trigger replace can't half-apply the metadata
/// update, and — because `signal_triggers` has no FK — can't reintroduce orphan
/// rows against a concurrently-deleted signal: the `FOR UPDATE` row lock below is
/// held for the whole transaction, so the delete either waits or finds nothing.
///
/// Name is deliberately NOT updatable: it is the unique key the alert names and
/// the onboarding template diff derive from, and the UI doesn't rename either.
pub async fn update_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
    update: SignalUpdate,
    triggers: Option<&[(Value, Value, i16)]>,
) -> Result<
    Option<(
        SignalRow,
        Option<Vec<crate::db::signal_triggers::TriggerRow>>,
    )>,
> {
    let mut tx = pool.begin().await?;

    // Lock the row so a concurrent update can't have its metadata keys dropped
    // by this read-modify-write.
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

    let trigger_rows = match triggers {
        Some(triggers) => Some(
            crate::db::signal_triggers::replace_signal_triggers(
                &mut tx, project_id, signal_id, triggers,
            )
            .await?,
        ),
        None => None,
    };

    tx.commit().await?;

    Ok(Some((updated, trigger_rows)))
}

/// Merge an update over stored metadata, preserving keys the update doesn't
/// mention. `sampleRate` / `disabled` are REMOVED rather than set to null/false
/// when cleared — absence is the canonical "enabled / no sampling" state, and
/// that's the shape every reader (and the frontend) expects.
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

/// Delete a signal, its triggers, and its auto-created alerts in one
/// transaction. Returns the deleted row, or `None` when it didn't exist in this
/// project.
///
/// NOTHING here cascades — verified against the live schema: `signal_triggers`
/// has NO foreign key on `signal_id` at all, and `alerts.source_id` deliberately
/// has none either (it may reference other entity types). Both must be deleted
/// in application code or they survive as orphans (staging already holds orphan
/// trigger rows, since the frontend delete path has the same gap).
/// `alert_targets` DOES cascade from `alerts`. The signal's ClickHouse footprint
/// is purged by the caller.
pub async fn delete_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Option<SignalRow>> {
    let mut tx = pool.begin().await?;

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

/// Escape the LIKE metacharacters in a user-supplied substring so it matches
/// LITERALLY. `_` is especially important: it is a single-char wildcard and is
/// common in signal names, so an unescaped `wildcard_test` also matches
/// `wildcardXtestX...`. Pairs with the explicit `ESCAPE '\'` in the query below
/// (the backslash default is not guaranteed under every `standard_conforming_strings`
/// setting). Mirrors `getSignals` in `frontend/lib/actions/signals/index.ts`.
fn escape_like_pattern(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// List a project's signals, newest first. `name` filters case-insensitively on
/// a LITERAL substring so the CLI can resolve a signal by name without an exact
/// match.
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

    /// `_` is a single-char LIKE wildcard and is common in signal names, so an
    /// unescaped `wildcard_test` also matches `wildcardXtestX…`. `%` would match
    /// everything.
    #[test]
    fn like_pattern_escapes_wildcards() {
        assert_eq!(escape_like_pattern("wildcard_test"), r"wildcard\_test");
        assert_eq!(escape_like_pattern("100%"), r"100\%");
        // The backslash itself must be escaped FIRST, or escaping `_` afterwards
        // would produce a pattern whose backslash escapes our own escape.
        assert_eq!(escape_like_pattern(r"a\_b"), r"a\\\_b");
        assert_eq!(escape_like_pattern("plain name"), "plain name");
    }

    #[test]
    fn update_preserves_unmentioned_metadata_keys() {
        let stored = json!({ "sampleRate": 30, "disabled": true, "futureKey": "keep" });
        let merged = merge_signal_metadata(&stored, &SignalUpdate::default());
        assert_eq!(merged, stored, "an empty patch must be a no-op");
    }

    /// Clearing REMOVES the key rather than writing null/false: every reader treats
    /// absence as the default, and a literal `disabled: false` is not the shape the
    /// frontend writes.
    #[test]
    fn clearing_metadata_removes_keys() {
        let stored = json!({ "sampleRate": 30, "disabled": true });

        let cleared_sampling = merge_signal_metadata(
            &stored,
            &SignalUpdate {
                sample_rate: Some(None),
                ..Default::default()
            },
        );
        assert_eq!(cleared_sampling, json!({ "disabled": true }));

        let re_enabled = merge_signal_metadata(
            &stored,
            &SignalUpdate {
                disabled: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(re_enabled, json!({ "sampleRate": 30 }));
    }

    /// Non-object stored metadata (corruption / a hand-edited row) must not panic.
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
