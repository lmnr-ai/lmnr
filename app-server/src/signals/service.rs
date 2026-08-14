//! Signal CRUD. Ungated — writing a row is a DB write; processing is feature-gated.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::cache::keys::SIGNAL_TRIGGERS_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::db::signals::{CreateSignalError, SignalRow, SignalUpdate};
use crate::db::{signal_triggers, signals};

/// Search/sort silently drop non-identifier field names.
static FIELD_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap());

/// Wrong slot → stored but never matches (`evaluate.rs` has no arm).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Slot {
    Condition,
    Filter,
}

enum ValueRule {
    /// Evaluator compares the string `"true"`, not a JSON boolean.
    StringTrue,
    SpanNames,
    FiniteNumber,
    OneOf(&'static [&'static str]),
    NonBlankString,
}

struct Column {
    name: &'static str,
    slot: Slot,
    operators: &'static [&'static str],
    value: ValueRule,
}

/// Keep in lockstep with `evaluate.rs` and `trigger-filter-field.tsx`.
const COLUMNS: &[Column] = &[
    Column {
        name: "root_span_finished",
        slot: Slot::Condition,
        operators: &["eq"],
        value: ValueRule::StringTrue,
    },
    Column {
        name: "span_name",
        slot: Slot::Condition,
        operators: &["eq", "ne", "includes"],
        value: ValueRule::SpanNames,
    },
    Column {
        name: "total_token_count",
        slot: Slot::Filter,
        operators: &["eq", "ne", "gt", "gte", "lt", "lte"],
        value: ValueRule::FiniteNumber,
    },
    Column {
        name: "status",
        slot: Slot::Filter,
        operators: &["eq", "ne"],
        value: ValueRule::OneOf(&["error", "success"]),
    },
    Column {
        name: "span_names",
        slot: Slot::Filter,
        operators: &["eq", "ne"],
        value: ValueRule::NonBlankString,
    },
];

const SIGNAL_NAME_MAX_LEN: usize = 255;

#[derive(Debug, thiserror::Error)]
pub enum CrudError {
    #[error("{0}")]
    Validation(String),
    #[error("A signal named \"{0}\" already exists in this project")]
    DuplicateName(String),
    #[error("Signal not found")]
    SignalNotFound,
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

pub fn error_response(e: CrudError) -> actix_web::HttpResponse {
    use actix_web::HttpResponse;
    match e {
        CrudError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        // Display impl, not the payload — DuplicateName's field is the bare name.
        e @ CrudError::DuplicateName(_) => {
            HttpResponse::Conflict().json(json!({ "error": e.to_string() }))
        }
        e @ CrudError::SignalNotFound => {
            HttpResponse::NotFound().json(json!({ "error": e.to_string() }))
        }
        CrudError::Internal(err) => {
            log::error!("signal crud error: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TriggerInput {
    pub conditions: Vec<Value>,
    #[serde(default)]
    pub filters: Vec<Value>,
    #[serde(default)]
    pub mode: Option<i16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerResponse {
    pub id: Uuid,
    pub conditions: Value,
    pub filters: Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub mode: i16,
}

impl From<signal_triggers::TriggerRow> for TriggerResponse {
    fn from(row: signal_triggers::TriggerRow) -> Self {
        Self {
            id: row.id,
            conditions: row.conditions,
            filters: row.filters,
            created_at: row.created_at,
            mode: row.mode,
        }
    }
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
    pub triggers: Vec<TriggerResponse>,
}

impl SignalResponse {
    fn new(row: SignalRow, triggers: Vec<TriggerResponse>) -> Self {
        let sample_rate = row.metadata.get("sampleRate").and_then(Value::as_i64);
        let disabled = row
            .metadata
            .get("disabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            prompt: row.prompt,
            structured_output: row.structured_output_schema,
            sample_rate,
            disabled,
            created_at: row.created_at,
            triggers,
        }
    }
}

#[derive(Debug)]
pub struct NormalizedTrigger {
    conditions: Vec<Value>,
    filters: Vec<Value>,
    mode: Option<i16>,
}

/// Matches `DEFAULT_SIGNAL_TRIGGER_VALUE` / `DEFAULT_SIGNAL_TRIGGER_FILTERS`.
pub fn default_triggers() -> Vec<TriggerInput> {
    vec![TriggerInput {
        conditions: vec![
            json!({ "column": "root_span_finished", "operator": "eq", "value": "true" }),
        ],
        filters: vec![json!({ "column": "total_token_count", "operator": "gt", "value": "1000" })],
        mode: None,
    }]
}

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

pub async fn create_signal(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    subscriber_email: Option<&str>,
    mut input: SignalInput,
    triggers: Option<Vec<TriggerInput>>,
    clustering_enabled: bool,
) -> Result<SignalResponse, CrudError> {
    validate_signal_input(&mut input)?;

    let triggers = triggers.unwrap_or_else(default_triggers);
    let normalized = triggers
        .into_iter()
        .map(normalize_trigger)
        .collect::<Result<Vec<_>, _>>()?;

    let metadata = build_signal_metadata(input.sample_rate, input.disabled.unwrap_or(false));

    let (signal, rows) = signals::create_signal_with_alerts(
        pool,
        project_id,
        &input.name,
        &input.prompt,
        &input.structured_output,
        &metadata,
        clustering_enabled,
        subscriber_email,
        &trigger_payload(&normalized, 0),
    )
    .await?;

    invalidate_trigger_cache(cache, project_id).await;

    Ok(SignalResponse::new(
        signal,
        rows.into_iter().map(TriggerResponse::from).collect(),
    ))
}

fn trigger_payload(triggers: &[NormalizedTrigger], default_mode: i16) -> Vec<(Value, Value, i16)> {
    triggers
        .iter()
        .map(|t| {
            (
                Value::Array(t.conditions.clone()),
                Value::Array(t.filters.clone()),
                t.mode.unwrap_or(default_mode),
            )
        })
        .collect()
}

async fn invalidate_trigger_cache(cache: &Cache, project_id: Uuid) {
    if let Err(e) = cache
        .remove(&format!("{SIGNAL_TRIGGERS_CACHE_KEY}:{project_id}"))
        .await
    {
        log::warn!("failed to invalidate signal trigger cache for {project_id}: {e}");
    }
}

pub async fn get_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<SignalResponse, CrudError> {
    let row = signals::get_signal_row(pool, project_id, signal_id)
        .await
        .map_err(CrudError::Internal)?
        .ok_or(CrudError::SignalNotFound)?;

    let triggers = signal_triggers::get_signal_triggers(pool, project_id, signal_id)
        .await
        .map_err(CrudError::Internal)?;

    Ok(SignalResponse::new(
        row,
        triggers.into_iter().map(TriggerResponse::from).collect(),
    ))
}

pub async fn list_signals(
    pool: &PgPool,
    project_id: Uuid,
    name: Option<&str>,
) -> Result<Vec<SignalResponse>, CrudError> {
    let rows = signals::list_signals(pool, project_id, name)
        .await
        .map_err(CrudError::Internal)?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let triggers = signal_triggers::get_signal_triggers(pool, project_id, row.id)
            .await
            .map_err(CrudError::Internal)?;
        out.push(SignalResponse::new(
            row,
            triggers.into_iter().map(TriggerResponse::from).collect(),
        ));
    }

    Ok(out)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSignalInput {
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub structured_output: Option<Value>,
    /// Absent = leave stored; `null` = clear. Plain `Option` collapses both.
    #[serde(default, deserialize_with = "double_option")]
    pub sample_rate: Option<Option<i64>>,
    #[serde(default)]
    pub disabled: Option<bool>,
    /// Absent = leave triggers; `[]` = clear them.
    #[serde(default)]
    pub triggers: Option<Vec<TriggerInput>>,
}

fn double_option<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer).map(Some)
}

pub async fn update_signal(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    signal_id: Uuid,
    input: UpdateSignalInput,
) -> Result<SignalResponse, CrudError> {
    if let Some(prompt) = &input.prompt
        && prompt.trim().is_empty()
    {
        return Err(CrudError::Validation("Prompt is required".to_string()));
    }
    if let Some(schema) = &input.structured_output {
        validate_structured_output(schema)?;
    }
    if let Some(Some(rate)) = input.sample_rate {
        validate_sample_rate(rate)?;
    }

    let normalized = match input.triggers {
        Some(triggers) => Some(
            triggers
                .into_iter()
                .map(normalize_trigger)
                .collect::<Result<Vec<_>, _>>()?,
        ),
        None => None,
    };

    let sample_rate = input.sample_rate.map(|inner| inner.map(|rate| rate as i16));

    let payload = normalized
        .as_ref()
        .map(|triggers| trigger_payload(triggers, 0));

    let (updated, replaced) = signals::update_signal(
        pool,
        project_id,
        signal_id,
        SignalUpdate {
            prompt: input.prompt,
            structured_output_schema: input.structured_output,
            sample_rate,
            disabled: input.disabled,
        },
        payload.as_deref(),
    )
    .await
    .map_err(CrudError::Internal)?
    .ok_or(CrudError::SignalNotFound)?;

    let trigger_rows = match replaced {
        Some(rows) => rows,
        None => signal_triggers::get_signal_triggers(pool, project_id, signal_id)
            .await
            .map_err(CrudError::Internal)?,
    };

    invalidate_trigger_cache(cache, project_id).await;

    Ok(SignalResponse::new(
        updated,
        trigger_rows
            .into_iter()
            .map(TriggerResponse::from)
            .collect(),
    ))
}

pub async fn delete_signal(
    pool: &PgPool,
    cache: &Cache,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<SignalResponse, CrudError> {
    let deleted = signals::delete_signal(pool, project_id, signal_id)
        .await
        .map_err(CrudError::Internal)?
        .ok_or(CrudError::SignalNotFound)?;

    invalidate_trigger_cache(cache, project_id).await;
    purge_signal_from_clickhouse(clickhouse, project_id, signal_id).await;

    Ok(SignalResponse::new(deleted, Vec::new()))
}

/// Link rows first — they're resolved by `event_id` against `signal_events`.
async fn purge_signal_from_clickhouse(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    signal_id: Uuid,
) {
    let statements = [
        "DELETE FROM events_to_clusters
         WHERE project_id = ?
           AND event_id IN (
             SELECT id FROM signal_events WHERE project_id = ? AND signal_id = ?
           )",
        "DELETE FROM signal_event_clusters WHERE project_id = ? AND signal_id = ?",
        "DELETE FROM signal_events WHERE project_id = ? AND signal_id = ?",
    ];

    for (i, statement) in statements.iter().enumerate() {
        let mut query = clickhouse.query(statement).bind(project_id);
        if i == 0 {
            query = query.bind(project_id);
        }
        if let Err(e) = query.bind(signal_id).execute().await {
            log::error!("failed to purge signal {signal_id} from ClickHouse: {e:?}");
            return;
        }
    }
}

/// Persist `disabled` only when true; absence means active.
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

fn validate_sample_rate(rate: i64) -> Result<(), CrudError> {
    if !(1..=95).contains(&rate) {
        return Err(CrudError::Validation(
            "sampleRate must be between 1 and 95".to_string(),
        ));
    }
    Ok(())
}

fn validate_signal_input(input: &mut SignalInput) -> Result<(), CrudError> {
    let trimmed = input.name.trim();
    if trimmed.is_empty() {
        return Err(CrudError::Validation("Name is required".to_string()));
    }
    if trimmed.chars().count() > SIGNAL_NAME_MAX_LEN {
        return Err(CrudError::Validation(format!(
            "Name must be at most {SIGNAL_NAME_MAX_LEN} characters"
        )));
    }
    if trimmed.len() != input.name.len() {
        input.name = trimmed.to_string();
    }

    if input.prompt.trim().is_empty() {
        return Err(CrudError::Validation("Prompt is required".to_string()));
    }
    if let Some(rate) = input.sample_rate {
        validate_sample_rate(rate)?;
    }
    validate_structured_output(&input.structured_output)
}

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
        .ok_or_else(|| {
            CrudError::Validation("structuredOutput.properties is required".to_string())
        })?;

    if properties.is_empty() {
        return Err(CrudError::Validation(
            "At least one payload field is required".to_string(),
        ));
    }

    for (field_name, prop) in properties {
        if !FIELD_NAME_RE.is_match(field_name) {
            return Err(CrudError::Validation(format!(
                "Field name \"{field_name}\" must be a valid identifier (^[a-zA-Z_][a-zA-Z0-9_]*$)"
            )));
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

        if let Some(enum_val) = prop.get("enum") {
            validate_enum_values(field_name, enum_val)?;
        }
    }

    let required = obj
        .get("required")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            CrudError::Validation("structuredOutput.required is required".to_string())
        })?;
    let required_names: Vec<&str> = required.iter().filter_map(Value::as_str).collect();
    if required_names.len() != required.len()
        || required_names.len() != properties.len()
        || !properties
            .keys()
            .all(|k| required_names.contains(&k.as_str()))
    {
        return Err(CrudError::Validation(
            "`required` must list exactly the property names".to_string(),
        ));
    }

    Ok(())
}

fn validate_enum_values(field_name: &str, enum_val: &Value) -> Result<(), CrudError> {
    let arr = enum_val.as_array().ok_or_else(|| {
        CrudError::Validation(format!("Property \"{field_name}\" enum must be an array"))
    })?;
    let values: Option<Vec<&str>> = arr.iter().map(Value::as_str).collect();
    let Some(values) = values.filter(|vs| !vs.is_empty() && vs.iter().all(|s| !s.is_empty()))
    else {
        return Err(CrudError::Validation(format!(
            "Property \"{field_name}\" enum must be a non-empty array of non-empty strings"
        )));
    };
    let mut seen = HashSet::new();
    if !values.iter().all(|s| seen.insert(*s)) {
        return Err(CrudError::Validation(format!(
            "Property \"{field_name}\" enum values must be unique"
        )));
    }
    Ok(())
}

pub fn normalize_trigger(input: TriggerInput) -> Result<NormalizedTrigger, CrudError> {
    if let Some(mode) = input.mode
        && !(0..=1).contains(&mode)
    {
        return Err(CrudError::Validation(
            "mode must be 0 (batch) or 1 (realtime)".to_string(),
        ));
    }

    if input.conditions.is_empty() {
        return Err(CrudError::Validation(
            "A trigger must have at least one condition".to_string(),
        ));
    }

    let conditions = input
        .conditions
        .into_iter()
        .map(|v| normalize_entry(v, Slot::Condition))
        .collect::<Result<Vec<_>, _>>()?;

    let filters = input
        .filters
        .into_iter()
        .map(|v| normalize_entry(v, Slot::Filter))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(NormalizedTrigger {
        conditions,
        filters,
        mode: input.mode,
    })
}

fn filter_parts(filter: &Value) -> Result<(&str, &str, Value), CrudError> {
    let obj = filter
        .as_object()
        .ok_or_else(|| CrudError::Validation("Each trigger entry must be an object".to_string()))?;
    let column = obj
        .get("column")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Trigger entry is missing a column".to_string()))?;
    let operator = obj
        .get("operator")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Trigger entry is missing an operator".to_string()))?;
    let value = obj.get("value").cloned().unwrap_or(Value::Null);
    Ok((column, operator, value))
}

fn lookup_column(name: &str, expected: Slot) -> Result<&'static Column, CrudError> {
    match COLUMNS.iter().find(|c| c.name == name) {
        Some(col) if col.slot == expected => Ok(col),
        Some(col) => Err(wrong_slot_error(col)),
        None => Err(unknown_column_error(name, expected)),
    }
}

fn wrong_slot_error(col: &Column) -> CrudError {
    match col.slot {
        Slot::Filter => CrudError::Validation(format!(
            "\"{}\" is a filter column, not a trigger condition — pass it in `filters`",
            col.name
        )),
        Slot::Condition => CrudError::Validation(format!(
            "\"{}\" is a trigger condition, not a filter — pass it in `conditions`",
            col.name
        )),
    }
}

fn unknown_column_error(name: &str, expected: Slot) -> CrudError {
    let names: Vec<&str> = COLUMNS
        .iter()
        .filter(|c| c.slot == expected)
        .map(|c| c.name)
        .collect();
    let expected_list = join_or(&names);
    match expected {
        Slot::Condition => CrudError::Validation(format!(
            "Unsupported trigger condition column \"{name}\" (expected {expected_list})"
        )),
        Slot::Filter => CrudError::Validation(format!(
            "Unsupported filter column \"{name}\" (expected {expected_list})"
        )),
    }
}

fn join_or(names: &[&str]) -> String {
    match names {
        [] => String::new(),
        [one] => (*one).to_string(),
        [a, b] => format!("{a} or {b}"),
        rest => {
            let (last, head) = rest.split_last().unwrap();
            format!("{}, or {last}", head.join(", "))
        }
    }
}

fn normalize_entry(filter: Value, slot: Slot) -> Result<Value, CrudError> {
    let (column, operator, value) = filter_parts(&filter)?;
    let spec = lookup_column(column, slot)?;
    if !spec.operators.contains(&operator) {
        return Err(CrudError::Validation(format!(
            "{} operator must be {}",
            spec.name,
            join_or(spec.operators)
        )));
    }
    let normalized_value = normalize_value(spec, operator, value)?;
    Ok(json!({ "column": column, "operator": operator, "value": normalized_value }))
}

fn normalize_value(spec: &Column, operator: &str, value: Value) -> Result<Value, CrudError> {
    match spec.value {
        ValueRule::StringTrue => {
            if value.as_str() != Some("true") {
                return Err(CrudError::Validation(format!(
                    "{} value must be the string \"true\"",
                    spec.name
                )));
            }
            Ok(value)
        }
        ValueRule::SpanNames => normalize_span_name_value(&value, operator),
        ValueRule::FiniteNumber => match &value {
            Value::Number(_) => Ok(value),
            Value::String(s) => {
                // Evaluator `parse::<f64>()` does not trim; "NaN"/"inf" parse as numbers.
                let trimmed = s.trim();
                if trimmed.is_empty() || !trimmed.parse::<f64>().is_ok_and(|v| v.is_finite()) {
                    return Err(CrudError::Validation(format!(
                        "{} value must be a finite number",
                        spec.name
                    )));
                }
                Ok(Value::String(trimmed.to_string()))
            }
            _ => Err(CrudError::Validation(format!(
                "{} value must be a number",
                spec.name
            ))),
        },
        ValueRule::OneOf(allowed) => {
            if !value.as_str().is_some_and(|s| allowed.contains(&s)) {
                return Err(CrudError::Validation(format!(
                    "{} value must be {}",
                    spec.name,
                    allowed
                        .iter()
                        .map(|s| format!("\"{s}\""))
                        .collect::<Vec<_>>()
                        .join(" or ")
                )));
            }
            Ok(value)
        }
        ValueRule::NonBlankString => {
            let s = value
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    CrudError::Validation(format!(
                        "{} value must be a non-blank span name",
                        spec.name
                    ))
                })?;
            Ok(Value::String(s.to_string()))
        }
    }
}

fn normalize_span_name_value(value: &Value, operator: &str) -> Result<Value, CrudError> {
    let names: Vec<String> = match value {
        Value::Array(items) => {
            let strings: Option<Vec<&str>> = items.iter().map(Value::as_str).collect();
            let strings = strings.ok_or_else(|| {
                CrudError::Validation("span_name values must all be strings".to_string())
            })?;
            strings
                .into_iter()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        }
        Value::String(name) => {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        _ => {
            return Err(CrudError::Validation(
                "span_name value must be a string or an array of strings".to_string(),
            ));
        }
    };

    if names.is_empty() {
        return Err(CrudError::Validation(
            "span_name requires at least one non-blank span name".to_string(),
        ));
    }

    if operator == "includes" {
        Ok(json!(names))
    } else if names.len() > 1 {
        Err(CrudError::Validation(
            "span_name with multiple names must use the `includes` operator".to_string(),
        ))
    } else {
        Ok(json!(names[0]))
    }
}

#[cfg(test)]
mod tests;
