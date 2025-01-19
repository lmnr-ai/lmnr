use std::str::FromStr;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

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
    EVALUATION,
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
            "EVALUATION" => Ok(SpanType::EVALUATION),
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
    pub attributes: Value,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub span_type: SpanType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub events: Option<Value>,
    pub labels: Option<Value>,
}

pub async fn record_span(pool: &PgPool, span: &Span, project_id: &Uuid) -> Result<()> {
    let sanitized_input = match &span.input {
        Some(v) => Some(sanitize_value(v.clone())),
        None => None,
    };

    let sanitized_output = match &span.output {
        Some(v) => Some(sanitize_value(v.clone())),
        None => None,
    };

    let input_preview = match &sanitized_input {
        &Some(Value::String(ref s)) => Some(s.chars().take(PREVIEW_CHARACTERS).collect::<String>()),
        &Some(ref v) => Some(
            v.to_string()
                .chars()
                .take(PREVIEW_CHARACTERS)
                .collect::<String>(),
        ),
        &None => None,
    };
    let output_preview = match &sanitized_output {
        &Some(Value::String(ref s)) => Some(s.chars().take(PREVIEW_CHARACTERS).collect::<String>()),
        &Some(ref v) => Some(
            v.to_string()
                .chars()
                .take(PREVIEW_CHARACTERS)
                .collect::<String>(),
        ),
        &None => None,
    };
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
            $13)
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
            output_preview = EXCLUDED.output_preview
    ",
    )
    .bind(&span.span_id)
    .bind(&span.trace_id)
    .bind(&span.parent_span_id as &Option<Uuid>)
    .bind(&span.start_time)
    .bind(&span.end_time)
    .bind(&span.name)
    .bind(&span.attributes)
    .bind(&sanitized_input as &Option<Value>)
    .bind(&sanitized_output as &Option<Value>)
    .bind(&span.span_type as &SpanType)
    .bind(&input_preview)
    .bind(&output_preview)
    .bind(&project_id)
    .execute(pool)
    .await?;

    Ok(())
}
