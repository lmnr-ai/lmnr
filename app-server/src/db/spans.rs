use std::str::FromStr;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::traces::spans::{SpanAttributes, convert_attribute, should_keep_attribute};

use super::utils::sanitize_value;

const PREVIEW_CHARACTERS: usize = 50;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "span_type")]
pub enum SpanType {
    #[default]
    DEFAULT,
    LLM,
    PIPELINE,
    EXECUTOR,
    EVALUATOR,
    #[allow(non_camel_case_types)]
    HUMAN_EVALUATOR,
    EVALUATION,
    TOOL,
}

impl FromStr for SpanType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().trim() {
            "DEFAULT" | "SPAN" => Ok(SpanType::DEFAULT),
            "LLM" => Ok(SpanType::LLM),
            "PIPELINE" => Ok(SpanType::PIPELINE),
            "EXECUTOR" => Ok(SpanType::EXECUTOR),
            "EVALUATOR" => Ok(SpanType::EVALUATOR),
            "HUMAN_EVALUATOR" => Ok(SpanType::HUMAN_EVALUATOR),
            "EVALUATION" => Ok(SpanType::EVALUATION),
            "TOOL" => Ok(SpanType::TOOL),
            _ => Err(anyhow::anyhow!("Invalid span type: {}", s)),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, Default, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub span_id: Uuid,
    pub trace_id: Uuid,
    pub parent_span_id: Option<Uuid>,
    pub name: String,
    pub attributes: SpanAttributes,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub span_type: SpanType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub events: Option<Value>,
    pub status: Option<String>,
    pub labels: Option<Value>,
    pub input_url: Option<String>,
    pub output_url: Option<String>,
}

struct SpanDBValues {
    sanitized_input: Option<Value>,
    sanitized_output: Option<Value>,
    input_preview: Option<String>,
    output_preview: Option<String>,
    attributes_value: Value,
}

pub async fn record_span(pool: &PgPool, span: &Span, project_id: &Uuid) -> Result<()> {
    let values = prepare_span_db_values(span);

    sqlx::query(
        "INSERT INTO spans
            (span_id,
            trace_id,
            parent_span_id,
            start_time,
            end_time,
            name,
            attributes,
            input,
            output,
            span_type,
            input_preview,
            output_preview,
            input_url,
            output_url,
            status,
            project_id
        )
        VALUES(
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16)
        ON CONFLICT (span_id, project_id) DO UPDATE SET
            trace_id = EXCLUDED.trace_id,
            parent_span_id = EXCLUDED.parent_span_id,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            name = EXCLUDED.name,
            attributes = EXCLUDED.attributes,
            input = EXCLUDED.input,
            output = EXCLUDED.output,
            span_type = EXCLUDED.span_type,
            input_preview = EXCLUDED.input_preview,
            output_preview = EXCLUDED.output_preview,
            input_url = EXCLUDED.input_url,
            output_url = EXCLUDED.output_url,
            status = EXCLUDED.status
    ",
    )
    .bind(&span.span_id)
    .bind(&span.trace_id)
    .bind(&span.parent_span_id as &Option<Uuid>)
    .bind(&span.start_time)
    .bind(&span.end_time)
    .bind(&span.name)
    .bind(&values.attributes_value)
    .bind(&values.sanitized_input as &Option<Value>)
    .bind(&values.sanitized_output as &Option<Value>)
    .bind(&span.span_type as &SpanType)
    .bind(&values.input_preview)
    .bind(&values.output_preview)
    .bind(&span.input_url as &Option<String>)
    .bind(&span.output_url as &Option<String>)
    .bind(&span.status)
    .bind(&project_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_root_span_id(
    pool: &PgPool,
    trace_id: &Uuid,
    project_id: &Uuid,
) -> Result<Option<Uuid>> {
    let span_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT span_id FROM spans
        WHERE trace_id = $1
        AND project_id = $2
        AND parent_span_id IS NULL
        ORDER BY start_time ASC
        LIMIT 1",
    )
    .bind(trace_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(span_id)
}

pub async fn is_span_in_project(pool: &PgPool, span_id: &Uuid, project_id: &Uuid) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM spans WHERE span_id = $1 AND project_id = $2)",
    )
    .bind(span_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

fn prepare_span_db_values(span: &Span) -> SpanDBValues {
    let sanitized_input = match &span.input {
        Some(v) => Some(sanitize_value(v)),
        None => None,
    };

    let sanitized_output = match &span.output {
        Some(v) => Some(sanitize_value(v)),
        None => None,
    };

    let input_preview = generate_preview(&sanitized_input);
    let output_preview = generate_preview(&sanitized_output);

    let attributes_value = serde_json::Value::Object(
        span.attributes
            .raw_attributes
            .iter()
            .filter_map(|(k, v)| {
                if should_keep_attribute(&k) {
                    let converted_val = convert_attribute(&k, v.clone());
                    Some((k.clone(), converted_val))
                } else {
                    None
                }
            })
            .collect::<serde_json::Map<String, Value>>(),
    );

    SpanDBValues {
        sanitized_input,
        sanitized_output,
        input_preview,
        output_preview,
        attributes_value,
    }
}

fn generate_preview(value: &Option<Value>) -> Option<String> {
    match &value {
        Some(Value::String(s)) => Some(s.chars().take(PREVIEW_CHARACTERS).collect::<String>()),
        Some(v) => Some(
            v.to_string()
                .chars()
                .take(PREVIEW_CHARACTERS)
                .collect::<String>(),
        ),
        None => None,
    }
}
