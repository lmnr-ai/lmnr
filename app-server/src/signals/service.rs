//! Signal creation service, owned by app-server so both clients that need it — the
//! browser drawer (via the trusted Next.js proxy) and `lmnr-cli` (via `/v1/cli`)
//! — share ONE implementation. Ungated by the `signals` cargo feature: creating
//! a signal row is a plain DB write (signal processing is what's enterprise); it
//! is gated at runtime by the frontend's `Feature.SIGNALS`, same as before.
//!
//! Strict validation mirrors the create-signal drawer's client-side constraints
//! (identifier field names, string/number/boolean property types, enum on
//! strings only, `required` = all property names, and the four UI trigger
//! columns with their pinned operators/values). Enforcing them here means both
//! clients get the same guarantees the drawer used to enforce only in the browser.

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::sync::LazyLock;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::cache::keys::SIGNAL_TRIGGERS_CACHE_KEY;
use crate::db::signals::CreateSignalError;
use crate::db::{signal_triggers, signals};

// Same identifier rule the drawer enforces per schema field (schema-field-row.tsx)
// and that the Rust search/sort paths re-enforce at query time — a non-identifier
// field name is silently unsearchable/unsortable.
static FIELD_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap());

#[derive(Debug, thiserror::Error)]
pub enum CrudError {
    #[error("{0}")]
    Validation(String),
    #[error("A signal named \"{0}\" already exists in this project")]
    DuplicateName(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<CreateSignalError> for CrudError {
    fn from(e: CreateSignalError) -> Self {
        match e {
            CreateSignalError::DuplicateName(name) => CrudError::DuplicateName(name),
            CreateSignalError::Other(e) => CrudError::Internal(e),
        }
    }
}

/// The signal payload shared by both route surfaces. Triggers are NOT part of
/// this — the drawer posts them separately; the CLI wraps this plus triggers.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalInput {
    pub name: String,
    pub prompt: String,
    pub structured_output: Value,
    #[serde(default)]
    pub sample_rate: Option<i64>,
    #[serde(default)]
    pub disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerInput {
    pub filters: Vec<Value>,
    /// 0 = batch, 1 = realtime.
    #[serde(default)]
    pub mode: Option<i16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub prompt: String,
    pub structured_output: Value,
    pub sample_rate: Option<i64>,
    pub disabled: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerResponse {
    pub id: Uuid,
    pub filters: Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub mode: i16,
}

/// Validate + create a signal (with its auto-created alerts/targets). Mirrors the
/// frontend `createSignal`. `subscriber_email` is resolved per surface (session
/// email for the browser proxy, user-id lookup for the CLI).
pub async fn create_signal(
    pool: &PgPool,
    project_id: Uuid,
    subscriber_email: Option<&str>,
    input: SignalInput,
) -> Result<SignalResponse, CrudError> {
    validate_signal_input(&input)?;

    let sample_rate = input.sample_rate;
    let disabled = input.disabled.unwrap_or(false);
    let metadata = build_signal_metadata(sample_rate, disabled);

    // Match the frontend: the NEW_CLUSTER alert + skipSimilar are gated on the
    // frontend's Feature.CLUSTERING (CLUSTERING_ENABLED env), NOT app-server's
    // Feature::Clustering (which aliases has_llm_provider).
    let clustering_enabled = crate::env::clustering::ENABLED.get();

    let (id, created_at) = signals::create_signal_with_alerts(
        pool,
        project_id,
        &input.name,
        &input.prompt,
        &input.structured_output,
        &metadata,
        clustering_enabled,
        subscriber_email,
    )
    .await?;

    Ok(SignalResponse {
        id,
        project_id,
        name: input.name,
        prompt: input.prompt,
        structured_output: input.structured_output,
        sample_rate,
        disabled,
        created_at,
    })
}

/// A trigger whose filters have already been validated + normalized. `mode` is
/// still optional so each surface can apply its own default at insert time
/// (the drawer defaults to 0/batch, the CLI to 1/realtime).
pub struct NormalizedTrigger {
    filters: Vec<Value>,
    mode: Option<i16>,
}

/// Validate + normalize a trigger's filters WITHOUT touching the DB, so callers
/// (the CLI) can reject a bad trigger with a 400 before creating the signal.
pub fn normalize_trigger(input: TriggerInput) -> Result<NormalizedTrigger, CrudError> {
    Ok(NormalizedTrigger {
        filters: validate_and_normalize_trigger_filters(input.filters)?,
        mode: input.mode,
    })
}

/// Insert a pre-normalized trigger, then invalidate the trigger cache so the
/// (enterprise) evaluator re-reads it. `default_mode` is used when the trigger
/// omits `mode`.
pub async fn insert_trigger(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    signal_id: Uuid,
    trigger: NormalizedTrigger,
    default_mode: i16,
) -> Result<TriggerResponse, CrudError> {
    let mode = trigger.mode.unwrap_or(default_mode);

    let created = signal_triggers::create_signal_trigger(
        pool,
        project_id,
        signal_id,
        &Value::Array(trigger.filters),
        mode,
    )
    .await
    .map_err(CrudError::Internal)?;

    // Best-effort invalidation, same posture as other cache invalidations — a
    // Redis blip must not fail the write (the entry TTLs out anyway).
    let _ = cache
        .remove(&format!("{SIGNAL_TRIGGERS_CACHE_KEY}:{project_id}"))
        .await;

    Ok(TriggerResponse {
        id: created.id,
        filters: created.filters,
        created_at: created.created_at,
        mode: created.mode,
    })
}

/// Validate + insert one trigger in a single call (the browser-drawer path,
/// which posts triggers one at a time). Drawer default mode is 0 (batch).
pub async fn create_trigger(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    signal_id: Uuid,
    input: TriggerInput,
) -> Result<TriggerResponse, CrudError> {
    let normalized = normalize_trigger(input)?;
    insert_trigger(pool, cache, project_id, signal_id, normalized, 0).await
}

/// Map a `CrudError` to an HTTP response with a JSON `{ error }` body, matching
/// the shape the Next.js routes returned. Shared by both route surfaces.
pub fn error_response(e: CrudError) -> actix_web::HttpResponse {
    use actix_web::HttpResponse;
    match e {
        CrudError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        CrudError::DuplicateName(m) => HttpResponse::Conflict().json(json!({ "error": m })),
        CrudError::Internal(err) => {
            // Don't leak internal error details (DB errors carry schema info).
            log::error!("signal crud error: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

/// The frontend `getDefaultTriggers` seed (realtime; batch is feature-disabled),
/// used when the CLI omits `triggers`.
pub fn default_triggers() -> Vec<TriggerInput> {
    vec![TriggerInput {
        filters: vec![
            json!({ "column": "root_span_finished", "operator": "eq", "value": "true" }),
            json!({ "column": "total_token_count", "operator": "gt", "value": 1000 }),
        ],
        mode: Some(1),
    }]
}

/// Build the `signals.metadata` jsonb exactly as the frontend does: `{}` unless
/// a sampleRate is set, and `disabled` persisted only when true.
fn build_signal_metadata(sample_rate: Option<i64>, disabled: bool) -> Value {
    let mut map = serde_json::Map::new();
    if let Some(rate) = sample_rate {
        map.insert("sampleRate".to_string(), json!(rate));
    }
    if disabled {
        map.insert("disabled".to_string(), json!(true));
    }
    Value::Object(map)
}

fn validate_signal_input(input: &SignalInput) -> Result<(), CrudError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(CrudError::Validation("Name is required".to_string()));
    }
    if input.name.len() > 255 {
        return Err(CrudError::Validation(
            "Name must be less than 255 characters".to_string(),
        ));
    }
    if input.prompt.is_empty() {
        return Err(CrudError::Validation("Prompt is required".to_string()));
    }
    if let Some(rate) = input.sample_rate
        && !(1..=95).contains(&rate)
    {
        return Err(CrudError::Validation(
            "sampleRate must be between 1 and 95".to_string(),
        ));
    }
    validate_structured_output(&input.structured_output)
}

/// Mirrors `StructuredOutputSchema` from the deleted Next.js CLI route.
fn validate_structured_output(schema: &Value) -> Result<(), CrudError> {
    let obj = schema
        .as_object()
        .ok_or_else(|| CrudError::Validation("structuredOutput must be an object".to_string()))?;

    if obj.get("type").and_then(Value::as_str) != Some("object") {
        return Err(CrudError::Validation(
            "structuredOutput.type must be \"object\"".to_string(),
        ));
    }

    let properties = obj
        .get("properties")
        .and_then(Value::as_object)
        .ok_or_else(|| CrudError::Validation("structuredOutput.properties is required".to_string()))?;

    if properties.is_empty() {
        return Err(CrudError::Validation(
            "At least one payload field is required".to_string(),
        ));
    }

    for (field_name, prop) in properties {
        if !FIELD_NAME_RE.is_match(field_name) {
            return Err(CrudError::Validation(
                "Field names must be valid identifiers".to_string(),
            ));
        }
        let prop = prop.as_object().ok_or_else(|| {
            CrudError::Validation(format!("Property \"{field_name}\" must be an object"))
        })?;

        let ty = prop.get("type").and_then(Value::as_str).ok_or_else(|| {
            CrudError::Validation(format!("Property \"{field_name}\" is missing a type"))
        })?;
        if !matches!(ty, "string" | "number" | "boolean") {
            return Err(CrudError::Validation(format!(
                "Property \"{field_name}\" type must be string, number, or boolean"
            )));
        }

        if !prop.get("description").is_some_and(Value::is_string) {
            return Err(CrudError::Validation(format!(
                "Property \"{field_name}\" is missing a description"
            )));
        }

        if let Some(enum_val) = prop.get("enum") {
            if ty != "string" {
                return Err(CrudError::Validation(
                    "enum values are only allowed on string properties".to_string(),
                ));
            }
            let arr = enum_val.as_array().ok_or_else(|| {
                CrudError::Validation(format!("Property \"{field_name}\" enum must be an array"))
            })?;
            if arr.is_empty()
                || !arr
                    .iter()
                    .all(|v| v.as_str().is_some_and(|s| !s.is_empty()))
            {
                return Err(CrudError::Validation(format!(
                    "Property \"{field_name}\" enum must be a non-empty array of non-empty strings"
                )));
            }
        }
    }

    // `required` must list exactly the property names (set-equal, no extras/dupes).
    let required = obj
        .get("required")
        .and_then(Value::as_array)
        .ok_or_else(|| CrudError::Validation("structuredOutput.required is required".to_string()))?;
    let required_names: Vec<&str> = required.iter().filter_map(Value::as_str).collect();
    if required_names.len() != required.len()
        || required_names.len() != properties.len()
        || !properties.keys().all(|k| required_names.contains(&k.as_str()))
    {
        return Err(CrudError::Validation(
            "`required` must list exactly the property names".to_string(),
        ));
    }

    Ok(())
}

/// Mirrors `TriggerFilterSchema` from the deleted Next.js CLI route: the four UI
/// trigger columns with their pinned operators/values. Numeric-string values for
/// `total_token_count` are trimmed before storage (the Rust evaluator's
/// `parse::<f64>()` does not trim, so a stored `" 1000 "` would evaluate false).
fn validate_and_normalize_trigger_filters(
    filters: Vec<Value>,
) -> Result<Vec<Value>, CrudError> {
    if filters.is_empty() {
        return Err(CrudError::Validation(
            "A trigger must have at least one filter".to_string(),
        ));
    }

    filters.into_iter().map(normalize_trigger_filter).collect()
}

fn normalize_trigger_filter(filter: Value) -> Result<Value, CrudError> {
    let obj = filter
        .as_object()
        .ok_or_else(|| CrudError::Validation("Each trigger filter must be an object".to_string()))?;
    let column = obj
        .get("column")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Trigger filter is missing a column".to_string()))?;
    let operator = obj
        .get("operator")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Trigger filter is missing an operator".to_string()))?;
    let value = obj.get("value").cloned().unwrap_or(Value::Null);

    let enum_ops = ["eq", "ne"];
    let numeric_ops = ["eq", "ne", "gt", "gte", "lt", "lte"];

    let normalized_value = match column {
        "span_name" => {
            require(enum_ops.contains(&operator), "span_name operator must be eq or ne")?;
            let s = value.as_str().filter(|s| !s.is_empty()).ok_or_else(|| {
                CrudError::Validation("span_name value must be a non-empty string".to_string())
            })?;
            Value::String(s.to_string())
        }
        "status" => {
            require(enum_ops.contains(&operator), "status operator must be eq or ne")?;
            require(value.as_str() == Some("error"), "status value must be \"error\"")?;
            value
        }
        "root_span_finished" => {
            require(
                enum_ops.contains(&operator),
                "root_span_finished operator must be eq or ne",
            )?;
            require(
                value.as_str() == Some("true"),
                "root_span_finished value must be \"true\"",
            )?;
            value
        }
        "total_token_count" => {
            require(
                numeric_ops.contains(&operator),
                "total_token_count operator must be a comparison",
            )?;
            match &value {
                Value::Number(_) => value,
                Value::String(s) => {
                    // Trim before validating AND storing (see fn docs). Finite
                    // only: Rust's parse accepts "NaN"/"inf" (JS's Number.isFinite
                    // rejected them), and a NaN threshold makes every comparison
                    // false (or always-true for ne) in the evaluator.
                    let trimmed = s.trim();
                    require(
                        !trimmed.is_empty()
                            && trimmed.parse::<f64>().is_ok_and(|v| v.is_finite()),
                        "total_token_count value must be a finite number",
                    )?;
                    Value::String(trimmed.to_string())
                }
                _ => {
                    return Err(CrudError::Validation(
                        "total_token_count value must be a number".to_string(),
                    ));
                }
            }
        }
        other => {
            return Err(CrudError::Validation(format!(
                "Unsupported trigger column \"{other}\""
            )));
        }
    };

    Ok(json!({ "column": column, "operator": operator, "value": normalized_value }))
}

fn require(cond: bool, msg: &str) -> Result<(), CrudError> {
    if cond {
        Ok(())
    } else {
        Err(CrudError::Validation(msg.to_string()))
    }
}
