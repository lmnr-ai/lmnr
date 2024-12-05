use std::str::FromStr;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres};
use uuid::Uuid;

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
    let input_preview = match &span.input {
        &Some(Value::String(ref s)) => Some(s.chars().take(PREVIEW_CHARACTERS).collect::<String>()),
        &Some(ref v) => Some(
            v.to_string()
                .chars()
                .take(PREVIEW_CHARACTERS)
                .collect::<String>(),
        ),
        &None => None,
    };
    let output_preview = match &span.output {
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
    .bind(&span.input as &Option<Value>)
    .bind(&span.output as &Option<Value>)
    .bind(&span.span_type as &SpanType)
    .bind(&input_preview)
    .bind(&output_preview)
    .bind(&project_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_trace_spans(
    pool: &PgPool,
    trace_id: Uuid,
    project_id: Uuid,
    search: Option<String>,
) -> Result<Vec<Span>> {
    let mut query = sqlx::QueryBuilder::<Postgres>::new(
        "WITH span_events AS (
            SELECT
                old_events.span_id,
                event_templates.project_id,
                jsonb_agg(
                    jsonb_build_object(
                        'id', old_events.id,
                        'spanId', old_events.span_id,
                        'timestamp', old_events.timestamp,
                        'templateId', old_events.template_id,
                        'templateName', event_templates.name,
                        'templateEventType', event_templates.event_type,
                        'source', old_events.source
                    )
                ) AS events
            FROM old_events
            JOIN event_templates ON old_events.template_id = event_templates.id
            GROUP BY old_events.span_id, event_templates.project_id
        ),
        span_labels AS (
            SELECT labels.span_id,
            label_classes.project_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', labels.id,
                    'spanId', labels.span_id,
                    'classId', labels.class_id,
                    'createdAt', labels.created_at,
                    'updatedAt', labels.updated_at,
                    'className', label_classes.name,
                    'valueMap', label_classes.value_map,
                    'value', labels.value,
                    'labelSource', labels.label_source,
                    'description', label_classes.description,
                    'reasoning', labels.reasoning
                )
            ) AS labels
            FROM labels
            JOIN label_classes ON labels.class_id = label_classes.id
            GROUP BY labels.span_id, label_classes.project_id
        ),
        spans_info AS (
            SELECT
                spans.span_id,
                spans.start_time,
                spans.end_time,
                spans.trace_id,
                spans.input,
                spans.output,
                spans.parent_span_id,
                spans.name,
                spans.attributes,
                spans.span_type,
                COALESCE(span_events.events, '[]'::jsonb) AS events,
                COALESCE(span_labels.labels, '[]'::jsonb) AS labels
            FROM spans
            LEFT JOIN span_events ON spans.span_id = span_events.span_id AND span_events.project_id = spans.project_id
            LEFT JOIN span_labels ON spans.span_id = span_labels.span_id AND span_labels.project_id = spans.project_id
            WHERE spans.trace_id = ",
    );
    query.push_bind(trace_id);
    query.push(" AND spans.project_id = ");
    query.push_bind(project_id);
    query.push(
        ")
        SELECT * FROM spans_info WHERE 1=1
    ",
    );

    if let Some(search) = search {
        query
            .push(" AND (input::TEXT ILIKE ")
            .push_bind(format!("%{search}%"))
            .push(" OR output::TEXT ILIKE ")
            .push_bind(format!("%{search}%"))
            .push(" OR name::TEXT ILIKE ")
            .push_bind(format!("%{search}%"))
            .push(" OR attributes::TEXT ILIKE ")
            .push_bind(format!("%{search}%"));
    }

    query.push(" ORDER BY start_time ASC");

    let spans = query.build_query_as().fetch_all(pool).await?;

    Ok(spans)
}

pub async fn get_span(pool: &PgPool, id: Uuid, project_id: Uuid) -> Result<Span> {
    let span = sqlx::query_as::<_, Span>(
        "SELECT
            span_id,
            start_time,
            end_time,
            trace_id,
            parent_span_id,
            name,
            attributes,
            input,
            output,
            span_type,
            '[]'::jsonb as events,
            '[]'::jsonb as labels
        FROM spans
        WHERE span_id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(span)
}
