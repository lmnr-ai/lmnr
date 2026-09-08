use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::db::signal_triggers::{self, TriggerPatch, TriggerRow};
use crate::traces::input_dedup::canonical_json;

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
    /// Stamped onto every event and run. `#[serde(default)]` → 0
    #[serde(default)]
    pub version: i32,
    /// Both set or both `NULL` (DB CHECK). `None` = env-var `LlmClient` routing.
    #[serde(default)]
    pub llm_profile_id: Option<Uuid>,
    #[serde(default)]
    pub llm_model: Option<String>,
}

/// Live-trace snapshot — judge plus admission/ops knobs. Alerts stay off this blob.
///
/// `signal_versions.definition` is always serialized from this struct, never
/// hand-built JSON: new fields get added here with `#[serde(default)]` so old
/// snapshots keep deserializing, and every writer stays in sync by construction.
/// `trigger`/`filters` are the stored Filter[] JSON (`signal_triggers.value` /
/// `filters`), not the CLI tagged `Trigger` enum — shapes that enum cannot
/// express (`span_name` + `ne`) must round-trip without becoming
/// `rootSpanFinished`.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalDefinition {
    #[serde(default)]
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub trigger: Value,
    pub filters: Value,
    pub mode: String,
    #[serde(default)]
    pub sample_rate: Option<i64>,
    #[serde(default)]
    pub disabled: bool,
    /// Both `None` = env-var `LlmClient` routing. Cloud signals stay `None`.
    #[serde(default)]
    pub llm_profile_id: Option<Uuid>,
    #[serde(default)]
    pub llm_model: Option<String>,
}

impl SignalDefinition {
    /// Newest trigger row, or the 0109 defaults when the signal has none.
    pub fn from_parts(
        name: String,
        prompt: String,
        structured_output_schema: Value,
        trigger: Option<&TriggerRow>,
        metadata: &Value,
        llm_profile_id: Option<Uuid>,
        llm_model: Option<String>,
    ) -> Self {
        let (trigger_value, filters, mode) = match trigger {
            Some(row) => (row.conditions.clone(), row.filters.clone(), row.mode),
            None => (
                json!([{
                    "column": "root_span_finished",
                    "operator": "eq",
                    "value": "true",
                }]),
                json!([]),
                1,
            ),
        };
        Self {
            name,
            prompt,
            structured_output_schema,
            trigger: trigger_value,
            filters,
            mode: if mode == 0 {
                "batch".to_string()
            } else {
                "realtime".to_string()
            },
            sample_rate: metadata.get("sampleRate").and_then(Value::as_i64),
            disabled: metadata
                .get("disabled")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            llm_profile_id,
            llm_model,
        }
    }
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_signal(
    pool: &PgPool,
    signal_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Signal>> {
    let signal = sqlx::query_as::<_, Signal>(
        "SELECT id, name, prompt, structured_output_schema, metadata, version, llm_profile_id, llm_model
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
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version
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
    pub llm_profile_id: Option<Uuid>,
    pub llm_model: Option<String>,
    pub created_at: DateTime<Utc>,
    /// Denormalized pointer at the newest `signal_versions.version` row.
    pub version: i32,
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
    llm_route: Option<&(Uuid, String)>,
) -> Result<(SignalRow, TriggerRow), CreateSignalError> {
    let mut tx = pool.begin().await.map_err(anyhow::Error::from)?;

    let signal = sqlx::query_as::<_, SignalRow>(
        "INSERT INTO signals (project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version",
    )
    .bind(project_id)
    .bind(name)
    .bind(prompt)
    .bind(structured_output_schema)
    .bind(metadata)
    .bind(llm_route.map(|(id, _)| *id))
    .bind(llm_route.map(|(_, model)| model.as_str()))
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

    // v1 of the snapshot. Existing signals got theirs from the 0109 backfill.
    insert_signal_version_if_changed(
        &mut tx,
        project_id,
        signal.id,
        &SignalDefinition::from_parts(
            name.to_string(),
            prompt.to_string(),
            structured_output_schema.clone(),
            Some(&trigger_row),
            metadata,
            signal.llm_profile_id,
            signal.llm_model.clone(),
        ),
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
    pub name: Option<String>,
    pub prompt: Option<String>,
    pub structured_output_schema: Option<Value>,
    /// Outer `None` = leave stored; `Some(None)` = clear sampling.
    pub sample_rate: Option<Option<i16>>,
    pub disabled: Option<bool>,
    /// `None` = leave stored. Callers validate the pair before writing; the
    /// composite FK is the backstop.
    pub llm_route: Option<(Uuid, String)>,
}

pub async fn update_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
    update: SignalUpdate,
    trigger_patch: TriggerPatch,
) -> Result<Option<(SignalRow, Option<TriggerRow>)>, CreateSignalError> {
    let mut tx = pool.begin().await.map_err(anyhow::Error::from)?;

    let existing = sqlx::query_as::<_, SignalRow>(
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version
         FROM signals
         WHERE id = $1 AND project_id = $2
         FOR UPDATE",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(anyhow::Error::from)?;

    let Some(existing) = existing else {
        return Ok(None);
    };

    let metadata = merge_signal_metadata(&existing.metadata, &update);
    let name = update.name.unwrap_or(existing.name);
    let prompt = update.prompt.unwrap_or(existing.prompt);
    let structured_output_schema = update
        .structured_output_schema
        .unwrap_or(existing.structured_output_schema);

    // Trigger write before mint so one Save is one snapshot. Minting and the
    // `version` bump below must not get separated: `version` is the one
    // denormalized field here, and we already hold `FOR UPDATE`.
    let trigger_row =
        signal_triggers::patch_signal_trigger(&mut tx, project_id, signal_id, trigger_patch)
            .await
            .map_err(CreateSignalError::Other)?;

    let llm_profile_id = update
        .llm_route
        .as_ref()
        .map(|(id, _)| *id)
        .or(existing.llm_profile_id);
    let llm_model = update
        .llm_route
        .as_ref()
        .map(|(_, model)| model.clone())
        .or(existing.llm_model);

    let definition = SignalDefinition::from_parts(
        name,
        prompt,
        structured_output_schema,
        trigger_row.as_ref(),
        &metadata,
        llm_profile_id,
        llm_model.clone(),
    );

    let new_version = insert_signal_version_if_changed(&mut tx, project_id, signal_id, &definition)
        .await
        .map_err(CreateSignalError::Other)?;

    let updated = sqlx::query_as::<_, SignalRow>(
        "UPDATE signals
         SET name = $3, prompt = $4, structured_output_schema = $5, metadata = $6,
             llm_profile_id = $7, llm_model = $8,
             version = COALESCE($9, version)
         WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version",
    )
    .bind(signal_id)
    .bind(project_id)
    .bind(&definition.name)
    .bind(&definition.prompt)
    .bind(&definition.structured_output_schema)
    .bind(metadata)
    .bind(llm_profile_id)
    .bind(llm_model)
    .bind(new_version)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23505") => {
            CreateSignalError::DuplicateName(definition.name.clone())
        }
        _ => CreateSignalError::Other(anyhow::Error::from(e)),
    })?;

    tx.commit().await.map_err(anyhow::Error::from)?;

    Ok(Some((updated, trigger_row)))
}

/// AND-list of filters: order is not semantic; nested `value` arrays (span
/// names) are sets. Sorted in place.
fn sort_filter_list(value: &mut Value) {
    let Value::Array(items) = value else {
        return;
    };
    for item in items.iter_mut() {
        if let Some(Value::Array(inner)) = item.get_mut("value") {
            inner.sort_by_cached_key(canonical_json);
        }
    }
    items.sort_by_cached_key(canonical_json);
}

/// Comparison form: sets sorted, ops absences filled. Store verbatim; only
/// this form is compared. Object key order needs no handling: `Value` compares
/// objects as maps.
fn comparable(definition: &Value) -> Value {
    let mut definition = definition.clone();
    let Some(obj) = definition.as_object_mut() else {
        return definition;
    };

    if let Some(Value::Array(required)) = obj
        .get_mut("structuredOutputSchema")
        .and_then(|schema| schema.get_mut("required"))
    {
        required.sort_by_cached_key(canonical_json);
    }

    if !matches!(obj.get("name"), Some(Value::String(_))) {
        obj.insert("name".to_string(), json!(""));
    }

    match obj.get_mut("trigger") {
        Some(trigger) => sort_filter_list(trigger),
        None => {
            obj.insert("trigger".to_string(), json!([]));
        }
    }
    match obj.get_mut("filters") {
        Some(filters) => sort_filter_list(filters),
        None => {
            obj.insert("filters".to_string(), json!([]));
        }
    }

    match obj.get("mode").and_then(Value::as_str) {
        Some("batch") => {}
        _ => {
            obj.insert("mode".to_string(), json!("realtime"));
        }
    }

    match obj.get("disabled") {
        Some(Value::Bool(true)) => {}
        _ => {
            obj.insert("disabled".to_string(), json!(false));
        }
    }

    match obj.get("sampleRate") {
        Some(Value::Number(_)) => {}
        _ => {
            obj.insert("sampleRate".to_string(), Value::Null);
        }
    }

    for key in ["llmProfileId", "llmModel"] {
        match obj.get(key) {
            Some(Value::String(_)) | Some(Value::Null) => {}
            _ => {
                obj.insert(key.to_string(), Value::Null);
            }
        }
    }

    definition
}

/// Appends `definition` as the next version iff it differs from the newest one.
/// Returns the minted version, or `None` when the definition is unchanged.
///
/// Callers must already hold `SELECT … FOR UPDATE` on the signals row, which is
/// what serializes concurrent editors against the `(signal_id, version)` PK.
async fn insert_signal_version_if_changed(
    tx: &mut Transaction<'_, Postgres>,
    project_id: Uuid,
    signal_id: Uuid,
    definition: &SignalDefinition,
) -> Result<Option<i32>> {
    let incoming = serde_json::to_value(definition)?;

    let latest = sqlx::query_as::<_, (i32, Value)>(
        "SELECT version, definition
         FROM signal_versions
         WHERE project_id = $1 AND signal_id = $2
         ORDER BY version DESC
         LIMIT 1",
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_optional(&mut **tx)
    .await?;

    let version = match latest {
        Some((_, stored)) if comparable(&stored) == comparable(&incoming) => {
            return Ok(None);
        }
        Some((version, _)) => version + 1,
        None => 1,
    };

    sqlx::query(
        "INSERT INTO signal_versions (project_id, signal_id, version, definition)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(project_id)
    .bind(signal_id)
    .bind(version)
    .bind(incoming)
    .execute(&mut **tx)
    .await?;

    Ok(Some(version))
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
         RETURNING id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version",
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
        "SELECT id, project_id, name, prompt, structured_output_schema, metadata, llm_profile_id, llm_model, created_at, version
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

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SignalVersionRow {
    pub version: i32,
    pub definition: Value,
    pub created_at: DateTime<Utc>,
}

/// Oldest first. `project_id` is in the WHERE so a signal id from a URL
/// cannot read another project's prompts.
pub async fn list_signal_versions(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<Vec<SignalVersionRow>> {
    let rows = sqlx::query_as::<_, SignalVersionRow>(
        "SELECT version, definition, created_at
         FROM signal_versions
         WHERE project_id = $1 AND signal_id = $2
         ORDER BY version ASC",
    )
    .bind(project_id)
    .bind(signal_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
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
    fn definition_matches_the_backfilled_v1_shape() {
        let definition = SignalDefinition {
            name: "Failure Detector".to_string(),
            prompt: "find issues".to_string(),
            structured_output_schema: json!({ "type": "object" }),
            trigger: json!([{
                "column": "root_span_finished",
                "operator": "eq",
                "value": "true",
            }]),
            filters: json!([]),
            mode: "realtime".to_string(),
            sample_rate: None,
            disabled: false,
            llm_profile_id: None,
            llm_model: None,
        };
        assert_eq!(
            serde_json::to_value(&definition).unwrap(),
            json!({
                "name": "Failure Detector",
                "prompt": "find issues",
                "structuredOutputSchema": { "type": "object" },
                "trigger": [{ "column": "root_span_finished", "operator": "eq", "value": "true" }],
                "filters": [],
                "mode": "realtime",
                "sampleRate": null,
                "disabled": false,
                "llmProfileId": null,
                "llmModel": null,
            })
        );
    }

    fn base_definition() -> Value {
        json!({
            "name": "s",
            "prompt": "p",
            "structuredOutputSchema": { "type": "object" },
            "trigger": [{ "column": "root_span_finished", "operator": "eq", "value": "true" }],
            "filters": [],
            "mode": "realtime",
            "sampleRate": null,
            "disabled": false,
            "llmProfileId": null,
            "llmModel": null,
        })
    }

    #[test]
    fn comparable_sorts_sets_and_fills_absences() {
        let definition = |required: Value, properties: Value| json!({ "prompt": "p", "structuredOutputSchema": { "properties": properties, "required": required } });
        let stored = definition(
            json!(["verdict", "reason"]),
            json!({ "verdict": {}, "reason": {} }),
        );
        let resaved = definition(
            json!(["reason", "verdict"]),
            json!({ "reason": {}, "verdict": {} }),
        );
        assert_ne!(stored, resaved);
        assert_eq!(comparable(&stored), comparable(&resaved));
        assert_ne!(
            comparable(&stored),
            comparable(&definition(
                json!(["verdict"]),
                json!({ "verdict": {}, "reason": {} })
            ))
        );
        for schema in [json!({ "type": "object" }), json!("not an object")] {
            assert!(
                comparable(&json!({ "prompt": "p", "structuredOutputSchema": schema }))
                    .pointer("/structuredOutputSchema/required")
                    .is_none()
            );
        }

        let mut filters_a = base_definition();
        let mut filters_b = base_definition();
        filters_a["filters"] = json!([
            { "column": "status", "operator": "eq", "value": "error" },
            { "column": "total_token_count", "operator": "gt", "value": "1000" },
        ]);
        filters_b["filters"] = json!([
            { "column": "total_token_count", "operator": "gt", "value": "1000" },
            { "column": "status", "operator": "eq", "value": "error" },
        ]);
        assert_eq!(comparable(&filters_a), comparable(&filters_b));

        let mut names_a = base_definition();
        let mut names_b = base_definition();
        names_a["trigger"] =
            json!([{ "column": "span_name", "operator": "includes", "value": ["b", "a"] }]);
        names_b["trigger"] =
            json!([{ "column": "span_name", "operator": "includes", "value": ["a", "b"] }]);
        assert_eq!(comparable(&names_a), comparable(&names_b));

        let base = base_definition();
        for key in ["disabled", "sampleRate", "mode", "llmProfileId", "llmModel"] {
            let mut absent = base.clone();
            absent.as_object_mut().unwrap().remove(key);
            assert_eq!(comparable(&base), comparable(&absent), "{key}");
        }
        let mut unnamed = base.clone();
        unnamed.as_object_mut().unwrap().remove("name");
        let mut empty_name = base.clone();
        empty_name["name"] = json!("");
        assert_eq!(comparable(&unnamed), comparable(&empty_name));

        for (key, value) in [
            ("disabled", json!(true)),
            ("sampleRate", json!(40)),
            ("mode", json!("batch")),
            ("name", json!("other")),
            (
                "llmProfileId",
                json!("00000000-0000-0000-0000-000000000001"),
            ),
            ("llmModel", json!("gpt-4.1")),
            (
                "trigger",
                json!([{ "column": "span_name", "operator": "includes", "value": ["foo"] }]),
            ),
            (
                "filters",
                json!([{ "column": "total_token_count", "operator": "gt", "value": "1000" }]),
            ),
        ] {
            let mut changed = base.clone();
            changed[key] = value;
            assert_ne!(comparable(&base), comparable(&changed), "{key}");
        }
    }

    #[test]
    fn merge_signal_metadata_patches_known_keys() {
        let stored = json!({ "sampleRate": 30, "disabled": true, "futureKey": "keep" });
        assert_eq!(
            merge_signal_metadata(&stored, &SignalUpdate::default()),
            stored
        );
        assert_eq!(
            merge_signal_metadata(
                &stored,
                &SignalUpdate {
                    sample_rate: Some(Some(40)),
                    ..Default::default()
                },
            ),
            json!({ "sampleRate": 40, "disabled": true, "futureKey": "keep" }),
        );
        assert_eq!(
            merge_signal_metadata(
                &json!({ "sampleRate": 30, "disabled": true }),
                &SignalUpdate {
                    sample_rate: Some(None),
                    ..Default::default()
                },
            ),
            json!({ "disabled": true }),
        );
        assert_eq!(
            merge_signal_metadata(
                &json!({ "sampleRate": 30, "disabled": true }),
                &SignalUpdate {
                    disabled: Some(false),
                    ..Default::default()
                },
            ),
            json!({ "sampleRate": 30 }),
        );
        assert_eq!(
            merge_signal_metadata(
                &json!("garbage"),
                &SignalUpdate {
                    disabled: Some(true),
                    ..Default::default()
                },
            ),
            json!({ "disabled": true }),
        );
    }
}
