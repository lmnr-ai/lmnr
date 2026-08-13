//! Signal CRUD service: validation + orchestration over the `db` layer.
//!
//! Ungated by the `signals` cargo feature — creating a signal row is a plain DB
//! write; signal *processing* is what that feature gates. The route surface
//! (`api/v1/cli/signals.rs`) is a thin shell over these functions.
//!
//! Validation deliberately mirrors what the browser drawer enforces client-side,
//! so a payload the UI would reject can't be smuggled in (and stored verbatim)
//! through the CLI.

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

/// Payload-schema field names must be identifiers: the Quickwit search path and
/// the ClickHouse sort path both re-enforce this regex at query time, so a field
/// named anything else is silently unsearchable and unsortable.
static FIELD_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap());

/// Trigger CONDITION columns — WHEN a signal is evaluated (decidable from one
/// span batch). Must stay in lockstep with `evaluate.rs::evaluate_trigger_condition`;
/// a column absent there never fires, silently disabling the signal.
const TRIGGER_COLUMN_ROOT_SPAN_FINISHED: &str = "root_span_finished";
const TRIGGER_COLUMN_SPAN_NAME: &str = "span_name";

/// FILTER columns — WHETHER a fired trigger runs (cumulative trace state).
/// `span_names` is PLURAL and is a different column from the `span_name` trigger.
const FILTER_COLUMN_TOTAL_TOKEN_COUNT: &str = "total_token_count";
const FILTER_COLUMN_STATUS: &str = "status";
const FILTER_COLUMN_SPAN_NAMES: &str = "span_names";

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

/// Map a `CrudError` onto an HTTP response with a JSON `{ error }` body, matching
/// the shape the Next.js signal routes return.
pub fn error_response(e: CrudError) -> actix_web::HttpResponse {
    use actix_web::HttpResponse;
    match e {
        CrudError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        // The variant holds the bare name; the actionable message is the Display
        // impl — format the error, not the payload.
        e @ CrudError::DuplicateName(_) => {
            HttpResponse::Conflict().json(json!({ "error": e.to_string() }))
        }
        e @ CrudError::SignalNotFound => {
            HttpResponse::NotFound().json(json!({ "error": e.to_string() }))
        }
        CrudError::Internal(err) => {
            // DB errors carry schema detail — log, don't leak.
            log::error!("signal crud error: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

/// A trigger as it arrives on the wire. `conditions` is WHEN to evaluate,
/// `filters` is WHETHER to run — see `db/signal_triggers.rs`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TriggerInput {
    pub conditions: Vec<Value>,
    #[serde(default)]
    pub filters: Vec<Value>,
    /// 0 = batch, 1 = realtime.
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
        // Absence of these keys is the canonical "enabled / no sampling" state.
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

/// A trigger whose conditions/filters are validated and normalized. `mode` stays
/// optional so the caller applies its own default at insert time.
#[derive(Debug)]
pub struct NormalizedTrigger {
    conditions: Vec<Value>,
    filters: Vec<Value>,
    mode: Option<i16>,
}

/// The frontend's default trigger seed (`DEFAULT_SIGNAL_TRIGGER_VALUE` /
/// `DEFAULT_SIGNAL_TRIGGER_FILTERS`): fire when the root span finishes, run only
/// when the trace spent >1000 tokens (keeps trivial traces from being billed).
/// Byte-identical to the UI's seed so a CLI-created signal is indistinguishable.
pub fn default_triggers() -> Vec<TriggerInput> {
    vec![TriggerInput {
        conditions: vec![
            json!({ "column": TRIGGER_COLUMN_ROOT_SPAN_FINISHED, "operator": "eq", "value": "true" }),
        ],
        filters: vec![
            json!({ "column": FILTER_COLUMN_TOTAL_TOKEN_COUNT, "operator": "gt", "value": "1000" }),
        ],
        mode: None,
    }]
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

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

/// Validate + create a signal with its triggers and auto-created alerts.
///
/// Triggers are validated BEFORE the signal is inserted so a bad trigger returns
/// 400 without leaving an orphan signal behind (which would then 409 on retry).
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

    // Signal + alerts + triggers commit together: a signal persisted without its
    // triggers is silently inert and can't be retried (the unique name 409s).
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

/// Flatten normalized triggers into the `(conditions, filters, mode)` tuples the
/// db layer inserts, applying `default_mode` to any trigger that omitted one.
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

/// Best-effort, matching every other cache invalidation: a Redis blip must not
/// fail the write (the entry TTLs out anyway).
async fn invalidate_trigger_cache(cache: &Cache, project_id: Uuid) {
    if let Err(e) = cache
        .remove(&format!("{SIGNAL_TRIGGERS_CACHE_KEY}:{project_id}"))
        .await
    {
        log::warn!("failed to invalidate signal trigger cache for {project_id}: {e}");
    }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

pub async fn get_signal(
    pool: &PgPool,
    project_id: Uuid,
    signal_id: Uuid,
) -> Result<SignalResponse, CrudError> {
    let signals = signals::list_signals(pool, project_id, None)
        .await
        .map_err(CrudError::Internal)?;
    let row = signals
        .into_iter()
        .find(|s| s.id == signal_id)
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

    // Triggers are fetched per signal: these lists are small (a handful of
    // signals per project) and the CLI needs the trigger shape to render.
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

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/// A partial patch. Every field is optional: absent means "leave as stored", so
/// updating only the prompt can't silently clear sampling or re-enable a
/// deactivated signal.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSignalInput {
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub structured_output: Option<Value>,
    /// Outer `None` = leave stored; explicit `null` = clear sampling.
    #[serde(default, deserialize_with = "double_option")]
    pub sample_rate: Option<Option<i64>>,
    #[serde(default)]
    pub disabled: Option<bool>,
    /// Absent = leave the signal's triggers alone; present = replace them
    /// wholesale (`[]` removes every trigger, making the signal inert).
    #[serde(default)]
    pub triggers: Option<Vec<TriggerInput>>,
}

/// Distinguish an absent key from an explicit `null` — serde's `Option` alone
/// collapses both to `None`, which would make "clear the sample rate"
/// indistinguishable from "don't touch it".
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

    // Validate triggers before touching the signal so a bad trigger can't leave
    // a half-applied update behind.
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

    // Metadata + triggers commit together, so a failed trigger replace can't
    // half-apply the metadata update.
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
        // No replacement requested — report the signal's current triggers.
        None => signal_triggers::get_signal_triggers(pool, project_id, signal_id)
            .await
            .map_err(CrudError::Internal)?,
    };

    // Always invalidate: `disabled` and sampling are read from the cached
    // trigger payload, so even a prompt-only edit must not serve a stale entry.
    invalidate_trigger_cache(cache, project_id).await;

    Ok(SignalResponse::new(
        updated,
        trigger_rows
            .into_iter()
            .map(TriggerResponse::from)
            .collect(),
    ))
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/// Delete a signal, its alerts, and its ClickHouse footprint.
///
/// The CH purge runs AFTER the Postgres delete commits and is best-effort
/// (logged, never surfaced) — mirroring `purgeSignalsFromClickhouse`: a CH hiccup
/// must not block the delete, and the rows are unreachable once the signal is gone.
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

/// Purge a signal's ClickHouse rows. Link rows must go BEFORE `signal_events`:
/// they're resolved by `event_id` against it.
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
        // The first statement's subquery re-binds project_id.
        if i == 0 {
            query = query.bind(project_id);
        }
        if let Err(e) = query.bind(signal_id).execute().await {
            log::error!("failed to purge signal {signal_id} from ClickHouse: {e:?}");
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Build the `signals.metadata` jsonb: `{}` unless a value is set. `disabled` is
/// persisted only when true — absence is the canonical "active" state.
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
    // Trim for STORAGE, not just for the empty check: " Foo" and "Foo" are
    // distinct to the unique constraint, and the derived alert would be named
    // " Foo alert".
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

/// Validate the payload schema against the same constraints the drawer enforces.
fn validate_structured_output(schema: &Value) -> Result<(), CrudError> {
    let obj = schema
        .as_object()
        .ok_or_else(|| CrudError::Validation("structuredOutput must be an object".to_string()))?;

    if obj.get("type").and_then(Value::as_str) != Some("object") {
        return Err(CrudError::Validation(
            "structuredOutput.type must be \"object\"".to_string(),
        ));
    }

    // Reject unknown keys so a payload the UI would refuse can't be stored verbatim.
    if let Some(k) = obj
        .keys()
        .find(|k| !matches!(k.as_str(), "type" | "properties" | "required"))
    {
        return Err(CrudError::Validation(format!(
            "structuredOutput has unexpected key \"{k}\""
        )));
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

        if let Some(k) = prop
            .keys()
            .find(|k| !matches!(k.as_str(), "type" | "description" | "enum"))
        {
            return Err(CrudError::Validation(format!(
                "Property \"{field_name}\" has unexpected key \"{k}\""
            )));
        }

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
            // The drawer models an enum as a string field with values, so a
            // non-string enum has no representable UI equivalent.
            if ty != "string" {
                return Err(CrudError::Validation(
                    "enum values are only allowed on string properties".to_string(),
                ));
            }
            let arr = enum_val.as_array().ok_or_else(|| {
                CrudError::Validation(format!("Property \"{field_name}\" enum must be an array"))
            })?;
            let values: Option<Vec<&str>> = arr.iter().map(Value::as_str).collect();
            let values = values
                .filter(|vs| !vs.is_empty() && vs.iter().all(|s| !s.is_empty() && *s == s.trim()));
            let Some(values) = values else {
                return Err(CrudError::Validation(format!(
                    "Property \"{field_name}\" enum must be a non-empty array of non-empty, trimmed strings"
                )));
            };
            let mut seen = HashSet::new();
            if !values.iter().all(|s| seen.insert(*s)) {
                return Err(CrudError::Validation(format!(
                    "Property \"{field_name}\" enum values must be unique"
                )));
            }
        }
    }

    // `required` must list exactly the property names — the drawer marks every
    // field required, and a schema whose `required` disagrees would let the LLM
    // omit a field the readers assume is present.
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

/// Validate + normalize a trigger without touching the DB, so a bad one is a 400
/// before anything is written.
pub fn normalize_trigger(input: TriggerInput) -> Result<NormalizedTrigger, CrudError> {
    // `SignalMode::from_u8` folds anything != 1 into Batch, so an out-of-range
    // value would persist a trigger outside both evaluator paths.
    if let Some(mode) = input.mode
        && !(0..=1).contains(&mode)
    {
        return Err(CrudError::Validation(
            "mode must be 0 (batch) or 1 (realtime)".to_string(),
        ));
    }

    // An empty condition list never fires (`trigger_fires` returns false), which
    // would produce a signal that looks configured but is silently inert.
    if input.conditions.is_empty() {
        return Err(CrudError::Validation(
            "A trigger must have at least one condition".to_string(),
        ));
    }

    let conditions = input
        .conditions
        .into_iter()
        .map(normalize_trigger_condition)
        .collect::<Result<Vec<_>, _>>()?;

    // Empty filters is legitimate: run on every trace the trigger fires for.
    let filters = input
        .filters
        .into_iter()
        .map(normalize_trigger_filter)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(NormalizedTrigger {
        conditions,
        filters,
        mode: input.mode,
    })
}

/// Pull `column` / `operator` off a wire filter, rejecting anything malformed.
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

/// Normalize one trigger CONDITION. Only the two condition columns are accepted;
/// a filter column here is rejected rather than silently never firing.
fn normalize_trigger_condition(filter: Value) -> Result<Value, CrudError> {
    let (column, operator, value) = filter_parts(&filter)?;

    let normalized_value = match column {
        TRIGGER_COLUMN_ROOT_SPAN_FINISHED => {
            require(
                matches!(operator, "eq"),
                "root_span_finished operator must be eq",
            )?;
            require(
                value.as_str() == Some("true"),
                "root_span_finished value must be the string \"true\"",
            )?;
            value
        }
        TRIGGER_COLUMN_SPAN_NAME => {
            // `includes` is what the frontend sends for the multi-name shape;
            // `eq`/`ne` cover the single-name (and legacy) shape.
            require(
                matches!(operator, "eq" | "ne" | "includes"),
                "span_name operator must be eq, ne, or includes",
            )?;
            normalize_span_name_value(&value, operator)?
        }
        FILTER_COLUMN_TOTAL_TOKEN_COUNT | FILTER_COLUMN_STATUS | FILTER_COLUMN_SPAN_NAMES => {
            return Err(CrudError::Validation(format!(
                "\"{column}\" is a filter column, not a trigger condition — pass it in `filters`"
            )));
        }
        other => {
            return Err(CrudError::Validation(format!(
                "Unsupported trigger condition column \"{other}\" (expected {TRIGGER_COLUMN_ROOT_SPAN_FINISHED} or {TRIGGER_COLUMN_SPAN_NAME})"
            )));
        }
    };

    Ok(json!({ "column": column, "operator": operator, "value": normalized_value }))
}

/// A span-name condition is one name or a list of names. Blanks are dropped
/// (the evaluator ignores them too), and an all-blank list is rejected outright
/// rather than persisted as a condition that can never match.
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

    // `includes` is array-valued in the shared FilterSchema; eq/ne are scalar.
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

/// Normalize one FILTER. Only the three filter columns are accepted; a condition
/// column here would silently never pass.
fn normalize_trigger_filter(filter: Value) -> Result<Value, CrudError> {
    let (column, operator, value) = filter_parts(&filter)?;

    let enum_ops = ["eq", "ne"];
    let numeric_ops = ["eq", "ne", "gt", "gte", "lt", "lte"];

    let normalized_value = match column {
        FILTER_COLUMN_TOTAL_TOKEN_COUNT => {
            require(
                numeric_ops.contains(&operator),
                "total_token_count operator must be a comparison (eq, ne, gt, gte, lt, lte)",
            )?;
            match &value {
                Value::Number(_) => value,
                Value::String(s) => {
                    // Trim before validating AND storing: the evaluator's
                    // `parse::<f64>()` does not trim, so a stored " 1000 " would
                    // evaluate false. Finite only — Rust parses "NaN"/"inf", and
                    // a NaN threshold makes every comparison false.
                    let trimmed = s.trim();
                    require(
                        !trimmed.is_empty() && trimmed.parse::<f64>().is_ok_and(|v| v.is_finite()),
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
        FILTER_COLUMN_STATUS => {
            require(
                enum_ops.contains(&operator),
                "status operator must be eq or ne",
            )?;
            // The evaluator derives status from `has_error`, so these are the
            // only two values that can ever match.
            require(
                matches!(value.as_str(), Some("error") | Some("success")),
                "status value must be \"error\" or \"success\"",
            )?;
            value
        }
        FILTER_COLUMN_SPAN_NAMES => {
            require(
                enum_ops.contains(&operator),
                "span_names operator must be eq (include) or ne (do not include)",
            )?;
            // Set-containment against one name. A blank target would match
            // everything under `ne` (the shared FilterSchema accepts
            // whitespace-only), so the evaluator rejects it — reject here too.
            let s = value
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    CrudError::Validation(
                        "span_names value must be a non-blank span name".to_string(),
                    )
                })?;
            Value::String(s.to_string())
        }
        TRIGGER_COLUMN_ROOT_SPAN_FINISHED | TRIGGER_COLUMN_SPAN_NAME => {
            return Err(CrudError::Validation(format!(
                "\"{column}\" is a trigger condition, not a filter — pass it in `conditions`"
            )));
        }
        other => {
            return Err(CrudError::Validation(format!(
                "Unsupported filter column \"{other}\" (expected {FILTER_COLUMN_TOTAL_TOKEN_COUNT}, {FILTER_COLUMN_STATUS}, or {FILTER_COLUMN_SPAN_NAMES})"
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

#[cfg(test)]
mod tests;
