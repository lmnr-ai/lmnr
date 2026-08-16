//! Signal CRUD. Ungated — writing a row is a DB write; processing is feature-gated.
//!
//! The API exposes a signal's three firing concepts as three sibling fields —
//! `trigger` (WHEN to evaluate), `filters` (WHETHER to run), and `mode` (how to
//! run) — because they are independent choices a user makes separately. Storage
//! is unchanged: they are still one `signal_triggers` row (`value` / `filters` /
//! `mode`), so the evaluator and the browser drawer are untouched.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::cache::keys::SIGNAL_TRIGGERS_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::db::signal_triggers::{TriggerPatch, TriggerRow};
use crate::db::signals::{CreateSignalError, SignalRow, SignalUpdate};
use crate::db::{signal_triggers, signals};

/// Search/sort silently drop non-identifier field names.
static FIELD_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap());

/// Stored condition columns. Not part of the API surface — a `Trigger` maps onto
/// them on the way in and is recovered from them on the way out.
const CONDITION_COLUMN_ROOT_SPAN_FINISHED: &str = "root_span_finished";
const CONDITION_COLUMN_SPAN_NAME: &str = "span_name";

enum ValueRule {
    FiniteNumber,
    OneOf(&'static [&'static str]),
    NonBlankString,
}

struct FilterColumn {
    name: &'static str,
    operators: &'static [&'static str],
    value: ValueRule,
}

/// Keep in lockstep with `evaluate.rs` and `trigger-filter-field.tsx`. Filters
/// are read from the trace's cumulative ClickHouse state, so every column here
/// needs one in `ch/private/trace_stats.rs`.
const FILTER_COLUMNS: &[FilterColumn] = &[
    FilterColumn {
        name: "total_token_count",
        operators: &["eq", "ne", "gt", "gte", "lt", "lte"],
        value: ValueRule::FiniteNumber,
    },
    FilterColumn {
        name: "status",
        operators: &["eq", "ne"],
        value: ValueRule::OneOf(&["error", "success"]),
    },
    FilterColumn {
        name: "span_names",
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

/// WHEN a signal is evaluated. Answerable from a single span batch, which is
/// what makes a signal fire exactly once per trace.
///
/// A closed set rather than a `{column, operator, value}` list: the two variants
/// are the only shapes the evaluator implements, so anything else was silently
/// stored and never fired.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Trigger {
    /// The trace's root span finished. Right for most traces.
    RootSpanFinished,
    /// A span with any of these names finished. For distributed traces where no
    /// single span is observably the root.
    #[serde(rename_all = "camelCase")]
    SpanName { span_names: Vec<String> },
}

impl Trigger {
    /// Stored `signal_triggers.value`. `SpanName` always uses `includes` with an
    /// array, matching what the drawer writes.
    fn to_conditions(&self) -> Value {
        match self {
            Trigger::RootSpanFinished => json!([{
                "column": CONDITION_COLUMN_ROOT_SPAN_FINISHED,
                "operator": "eq",
                // The evaluator compares the string, not a JSON boolean.
                "value": "true",
            }]),
            Trigger::SpanName { span_names } => json!([{
                "column": CONDITION_COLUMN_SPAN_NAME,
                "operator": "includes",
                "value": span_names,
            }]),
        }
    }

    /// Recover the trigger from stored conditions. `None` for an empty list (a
    /// backfill-only signal) and for any shape the evaluator would not fire on
    /// anyway, so the API never reports a trigger that does nothing.
    fn from_conditions(conditions: &Value) -> Option<Self> {
        let entries = conditions.as_array()?;
        // `span_name` first: a legacy row carrying both fires on the named span.
        if let Some(entry) = entries
            .iter()
            .find(|e| e.get("column").and_then(Value::as_str) == Some(CONDITION_COLUMN_SPAN_NAME))
        {
            // Blank entries are dropped (they can't meaningfully match a span),
            // but surviving names are NOT trimmed: the evaluator compares them
            // literally, so a legacy padded name must be reported as stored.
            let span_names = match entry.get("value") {
                Some(Value::Array(names)) => names
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|n| !n.trim().is_empty())
                    .map(str::to_string)
                    .collect(),
                // Legacy single-name shape.
                Some(Value::String(name)) if !name.trim().is_empty() => vec![name.clone()],
                _ => Vec::new(),
            };
            // An all-blank list can never match; report it as no trigger.
            return (!span_names.is_empty()).then_some(Trigger::SpanName { span_names });
        }
        entries
            .iter()
            .any(|e| {
                e.get("column").and_then(Value::as_str) == Some(CONDITION_COLUMN_ROOT_SPAN_FINISHED)
            })
            .then_some(Trigger::RootSpanFinished)
    }

    fn validate(&self) -> Result<(), CrudError> {
        let Trigger::SpanName { span_names } = self else {
            return Ok(());
        };
        if span_names.iter().all(|name| name.trim().is_empty()) {
            return Err(CrudError::Validation(
                "trigger.spanNames requires at least one non-blank span name".to_string(),
            ));
        }
        Ok(())
    }

    /// Drop the blank rows the drawer keeps for typing.
    fn normalized(self) -> Self {
        match self {
            Trigger::SpanName { span_names } => Trigger::SpanName {
                span_names: span_names
                    .into_iter()
                    .map(|name| name.trim().to_string())
                    .filter(|name| !name.is_empty())
                    .collect(),
            },
            other => other,
        }
    }
}

/// How a fired signal runs. Batch is cheaper and slower; realtime costs 2x.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    #[default]
    Batch,
    Realtime,
}

impl Mode {
    fn to_i16(self) -> i16 {
        match self {
            Mode::Batch => 0,
            Mode::Realtime => 1,
        }
    }

    /// Anything other than the realtime discriminant is batch, matching
    /// `SignalMode::from_u8`.
    fn from_i16(value: i16) -> Self {
        if value == 1 {
            Mode::Realtime
        } else {
            Mode::Batch
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
    /// `null` when the signal never fires on its own (backfill only).
    pub trigger: Option<Trigger>,
    pub filters: Vec<Value>,
    pub mode: Mode,
}

impl SignalResponse {
    fn new(row: SignalRow, trigger_row: Option<TriggerRow>) -> Self {
        let sample_rate = row.metadata.get("sampleRate").and_then(Value::as_i64);
        let disabled = row
            .metadata
            .get("disabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let (trigger, filters, mode) = match trigger_row {
            Some(row) => (
                Trigger::from_conditions(&row.conditions),
                row.filters.as_array().cloned().unwrap_or_default(),
                Mode::from_i16(row.mode),
            ),
            None => (None, Vec::new(), Mode::default()),
        };
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            prompt: row.prompt,
            structured_output: row.structured_output_schema,
            sample_rate,
            disabled,
            created_at: row.created_at,
            trigger,
            filters,
            mode,
        }
    }
}

/// Matches `DEFAULT_SIGNAL_TRIGGER_VALUE` / `DEFAULT_SIGNAL_TRIGGER_FILTERS`.
pub fn default_trigger() -> Trigger {
    Trigger::RootSpanFinished
}

/// Keeps trivial traces from being billed.
pub fn default_filters() -> Vec<Value> {
    vec![json!({ "column": "total_token_count", "operator": "gt", "value": "1000" })]
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
    /// Absent = the default trigger; `null` = never fires on its own.
    #[serde(default, deserialize_with = "double_option")]
    pub trigger: Option<Option<Trigger>>,
    /// Absent = the default filters; `[]` = run on every firing trace.
    #[serde(default)]
    pub filters: Option<Vec<Value>>,
    #[serde(default)]
    pub mode: Option<Mode>,
}

pub async fn create_signal(
    pool: &PgPool,
    cache: &Cache,
    project_id: Uuid,
    subscriber_email: Option<&str>,
    mut input: SignalInput,
    clustering_enabled: bool,
) -> Result<SignalResponse, CrudError> {
    validate_signal_input(&mut input)?;

    let trigger = match input.trigger {
        Some(trigger) => trigger.map(Trigger::normalized),
        None => Some(default_trigger()),
    };
    let filters = normalize_filters(input.filters.unwrap_or_else(default_filters))?;
    let mode = input.mode.unwrap_or_default();

    let metadata = build_signal_metadata(input.sample_rate, input.disabled.unwrap_or(false));

    let (signal, trigger_row) = signals::create_signal_with_alerts(
        pool,
        project_id,
        &input.name,
        &input.prompt,
        &input.structured_output,
        &metadata,
        clustering_enabled,
        subscriber_email,
        &conditions_of(trigger.as_ref()),
        &Value::Array(filters),
        mode.to_i16(),
    )
    .await?;

    invalidate_trigger_cache(cache, project_id).await;

    Ok(SignalResponse::new(signal, Some(trigger_row)))
}

/// An absent trigger stores an empty condition list, which `trigger_fires`
/// never matches — the signal runs only via backfill.
fn conditions_of(trigger: Option<&Trigger>) -> Value {
    trigger.map_or_else(|| json!([]), Trigger::to_conditions)
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

    let trigger_row = signal_triggers::get_signal_trigger(pool, project_id, signal_id)
        .await
        .map_err(CrudError::Internal)?;

    Ok(SignalResponse::new(row, trigger_row))
}

pub async fn list_signals(
    pool: &PgPool,
    project_id: Uuid,
    name: Option<&str>,
) -> Result<Vec<SignalResponse>, CrudError> {
    let rows = signals::list_signals(pool, project_id, name)
        .await
        .map_err(CrudError::Internal)?;

    let mut triggers = signal_triggers::get_project_signal_triggers(
        pool,
        project_id,
        &rows.iter().map(|row| row.id).collect::<Vec<_>>(),
    )
    .await
    .map_err(CrudError::Internal)?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let trigger_row = triggers.remove(&row.id);
            SignalResponse::new(row, trigger_row)
        })
        .collect())
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
    /// Absent = leave stored; `null` = stop firing on its own.
    #[serde(default, deserialize_with = "double_option")]
    pub trigger: Option<Option<Trigger>>,
    /// Absent = leave stored; `[]` = run on every firing trace.
    #[serde(default)]
    pub filters: Option<Vec<Value>>,
    #[serde(default)]
    pub mode: Option<Mode>,
}

fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
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

    let trigger = match input.trigger {
        Some(trigger) => {
            let trigger = trigger.map(Trigger::normalized);
            if let Some(trigger) = &trigger {
                trigger.validate()?;
            }
            Some(conditions_of(trigger.as_ref()))
        }
        None => None,
    };
    let filters = match input.filters {
        Some(filters) => Some(Value::Array(normalize_filters(filters)?)),
        None => None,
    };

    let patch = TriggerPatch {
        conditions: trigger,
        filters,
        mode: input.mode.map(Mode::to_i16),
    };

    let sample_rate = input.sample_rate.map(|inner| inner.map(|rate| rate as i16));

    let (updated, trigger_row) = signals::update_signal(
        pool,
        project_id,
        signal_id,
        SignalUpdate {
            prompt: input.prompt,
            structured_output_schema: input.structured_output,
            sample_rate,
            disabled: input.disabled,
        },
        patch,
    )
    .await
    .map_err(CrudError::Internal)?
    .ok_or(CrudError::SignalNotFound)?;

    invalidate_trigger_cache(cache, project_id).await;

    Ok(SignalResponse::new(updated, trigger_row))
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

    Ok(SignalResponse::new(deleted, None))
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
    if let Some(Some(trigger)) = &input.trigger {
        trigger.validate()?;
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

pub fn normalize_filters(filters: Vec<Value>) -> Result<Vec<Value>, CrudError> {
    filters.into_iter().map(normalize_filter).collect()
}

fn filter_parts(filter: &Value) -> Result<(&str, &str, Value), CrudError> {
    let obj = filter
        .as_object()
        .ok_or_else(|| CrudError::Validation("Each filter must be an object".to_string()))?;
    let column = obj
        .get("column")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Filter is missing a column".to_string()))?;
    let operator = obj
        .get("operator")
        .and_then(Value::as_str)
        .ok_or_else(|| CrudError::Validation("Filter is missing an operator".to_string()))?;
    let value = obj.get("value").cloned().unwrap_or(Value::Null);
    Ok((column, operator, value))
}

fn lookup_filter_column(name: &str) -> Result<&'static FilterColumn, CrudError> {
    // A condition column here used to be stored and silently never match; now
    // the trigger is a separate field, so say so rather than listing columns.
    if name == CONDITION_COLUMN_ROOT_SPAN_FINISHED || name == CONDITION_COLUMN_SPAN_NAME {
        return Err(CrudError::Validation(format!(
            "\"{name}\" decides WHEN a signal is evaluated, not whether it runs — set `trigger` instead of a filter"
        )));
    }
    FILTER_COLUMNS
        .iter()
        .find(|c| c.name == name)
        .ok_or_else(|| {
            let names: Vec<&str> = FILTER_COLUMNS.iter().map(|c| c.name).collect();
            CrudError::Validation(format!(
                "Unsupported filter column \"{name}\" (expected {})",
                join_or(&names)
            ))
        })
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

fn normalize_filter(filter: Value) -> Result<Value, CrudError> {
    let (column, operator, value) = filter_parts(&filter)?;
    let spec = lookup_filter_column(column)?;
    if !spec.operators.contains(&operator) {
        return Err(CrudError::Validation(format!(
            "{} operator must be {}",
            spec.name,
            join_or(spec.operators)
        )));
    }
    let normalized_value = normalize_value(spec, value)?;
    Ok(json!({ "column": column, "operator": operator, "value": normalized_value }))
}

fn normalize_value(spec: &FilterColumn, value: Value) -> Result<Value, CrudError> {
    match spec.value {
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

#[cfg(test)]
mod tests;
