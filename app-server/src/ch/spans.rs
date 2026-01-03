use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{
        spans::{Span, SpanType},
        trace::TraceType,
    },
    traces::spans::SpanUsage,
    utils::sanitize_string,
};

use super::{ClickhouseInsertable, DataPlaneBatch, Table, utils::chrono_to_nanoseconds};

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for SpanType {
    fn into(self) -> u8 {
        match self {
            SpanType::DEFAULT => 0,
            SpanType::LLM => 1,
            SpanType::PIPELINE => 2,
            SpanType::EXECUTOR => 3,
            SpanType::EVALUATOR => 4,
            SpanType::EVALUATION => 5,
            SpanType::TOOL => 6,
            SpanType::HUMAN_EVALUATOR => 7,
        }
    }
}

impl From<u8> for SpanType {
    fn from(value: u8) -> Self {
        match value {
            0 => SpanType::DEFAULT,
            1 => SpanType::LLM,
            2 => SpanType::PIPELINE,
            3 => SpanType::EXECUTOR,
            4 => SpanType::EVALUATOR,
            5 => SpanType::EVALUATION,
            6 => SpanType::TOOL,
            7 => SpanType::HUMAN_EVALUATOR,
            _ => SpanType::DEFAULT,
        }
    }
}

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for TraceType {
    fn into(self) -> u8 {
        match self {
            TraceType::DEFAULT => 0,
            TraceType::EVALUATION => 1,
            TraceType::EVENT => 2,
            TraceType::PLAYGROUND => 3,
        }
    }
}

#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHSpan {
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub parent_span_id: Uuid,
    pub name: String,
    pub span_type: u8,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub model: String,
    pub request_model: String,
    pub response_model: String,
    pub session_id: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub provider: String,
    pub user_id: String,
    // Default value is <null>  backwards compatibility or if path attribute is not present
    pub path: String,
    pub input: String,
    pub output: String,
    pub status: String,
    #[serde(default)]
    pub size_bytes: u64,
    pub attributes: String,
    pub trace_metadata: String,
    pub trace_type: u8,
    #[serde(default)]
    pub tags_array: Vec<String>,
}

impl CHSpan {
    pub fn from_db_span(
        span: &Span,
        usage: &SpanUsage,
        project_id: Uuid,
        size_bytes: usize,
    ) -> Self {
        let session_id = span.attributes.session_id();
        let user_id = span.attributes.user_id();
        let path = span.attributes.flat_path();

        let span_input_string = if let Some(input_url) = &span.input_url {
            format!("<lmnr_payload_url>{}</lmnr_payload_url>", input_url)
        } else {
            span.input
                .as_ref()
                .map(|input| sanitize_string(&input.to_string()))
                .unwrap_or(String::new())
        };

        let span_output_string = if let Some(output_url) = &span.output_url {
            format!("<lmnr_payload_url>{}</lmnr_payload_url>", output_url)
        } else {
            span.output
                .as_ref()
                .map(|output| sanitize_string(&output.to_string()))
                .unwrap_or(String::new())
        };

        let trace_metadata = span.attributes.metadata().map_or(String::new(), |m| {
            serde_json::to_string(&m).unwrap_or_default()
        });

        CHSpan {
            span_id: span.span_id,
            parent_span_id: span.parent_span_id.unwrap_or(Uuid::nil()),
            name: span.name.clone(),
            span_type: span.span_type.clone().into(),
            start_time: chrono_to_nanoseconds(span.start_time),
            end_time: chrono_to_nanoseconds(span.end_time),
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            input_cost: usage.input_cost,
            output_cost: usage.output_cost,
            total_cost: usage.total_cost,
            model: usage
                .response_model
                .clone()
                .or(usage.request_model.clone())
                .unwrap_or(String::from("")),
            request_model: usage.request_model.clone().unwrap_or(String::from("")),
            response_model: usage.response_model.clone().unwrap_or(String::from("")),
            session_id: session_id.unwrap_or(String::from("")),
            project_id: project_id,
            trace_id: span.trace_id,
            provider: usage.provider_name.clone().unwrap_or(String::from("")),
            user_id: user_id.unwrap_or(String::from("")),
            path: path.unwrap_or(String::from("")),
            input: span_input_string,
            output: span_output_string,
            status: span.status.clone().unwrap_or(String::from("")),
            size_bytes: size_bytes as u64,
            attributes: span.attributes.to_string(),
            trace_metadata,
            trace_type: span.attributes.trace_type().unwrap_or_default().into(),
            tags_array: span.attributes.tags(),
        }
    }
}

impl ClickhouseInsertable for CHSpan {
    const TABLE: Table = Table::Spans;

    fn into_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Spans(items)
    }
}

pub async fn append_tags_to_span(
    clickhouse: clickhouse::Client,
    span_id: Uuid,
    project_id: Uuid,
    tags: Vec<String>,
) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }

    tokio::spawn(async move {
        let _ = clickhouse
            .query("ALTER TABLE spans UPDATE tags_array = arrayDistinct(arrayConcat(tags_array, ?)) WHERE span_id = ? AND project_id = ?")
            .bind(tags)
            .bind(span_id)
            .bind(project_id)
            .execute()
            .await
            .map_err(|e| {
                log::error!("Failed to update tags for span on ch table spans {span_id}: {e:?}")
            });
    });

    Ok(())
}

pub async fn is_span_in_project(
    clickhouse: clickhouse::Client,
    span_id: Uuid,
    project_id: Uuid,
) -> Result<bool> {
    let result = clickhouse
        .query("SELECT count(*) FROM spans WHERE span_id = ? AND project_id = ?")
        .bind(span_id)
        .bind(project_id)
        .fetch_one::<u64>()
        .await?;

    Ok(result > 0)
}
