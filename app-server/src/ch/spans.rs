use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::spans::{Span, SpanType},
    traces::spans::SpanUsage,
    utils::sanitize_string,
};

use super::utils::chrono_to_nanoseconds;

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

#[derive(Row, Serialize, Deserialize, Debug)]
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

        let span_input_string = span
            .input
            .as_ref()
            .map(|input| sanitize_string(&input.to_string()))
            .unwrap_or(String::new());

        let span_output_string = span
            .output
            .as_ref()
            .map(|output| sanitize_string(&output.to_string()))
            .unwrap_or(String::new());

        let trace_metadata = match span.attributes.metadata() {
            Some(metadata) => serde_json::to_string(&metadata).unwrap_or_default(),
            None => String::from(""),
        };

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
            session_id: session_id.unwrap_or(String::from("<null>")),
            project_id: project_id,
            trace_id: span.trace_id,
            provider: usage
                .provider_name
                .clone()
                .unwrap_or(String::from("<null>")),
            user_id: user_id.unwrap_or(String::from("<null>")),
            path: path.unwrap_or(String::from("<null>")),
            input: span_input_string,
            output: span_output_string,
            status: span.status.clone().unwrap_or(String::from("<null>")),
            size_bytes: size_bytes as u64,
            attributes: span.attributes.to_string(),
            trace_metadata,
        }
    }
}

pub async fn insert_spans_batch(clickhouse: clickhouse::Client, spans: &[CHSpan]) -> Result<()> {
    if spans.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("spans");
    match ch_insert {
        Ok(mut ch_insert) => {
            // Write all spans to the batch
            for span in spans {
                ch_insert.write(span).await?;
            }

            // End the batch insertion
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Clickhouse batch span insertion failed: {:?}",
                        e
                    ));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert spans batch into Clickhouse: {:?}",
                e
            ));
        }
    }
}
