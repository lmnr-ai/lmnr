use std::collections::HashSet;

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::spans::{SearchSpansParams, Span, SpanType},
    traces::spans::SpanUsage,
    utils::json_value_to_string,
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
}

impl CHSpan {
    pub fn from_db_span(
        span: &Span,
        usage: SpanUsage,
        project_id: Uuid,
        size_bytes: usize,
    ) -> Self {
        let session_id = span.attributes.session_id();
        let user_id = span.attributes.user_id();
        let path = span.attributes.flat_path();

        let span_input_string = json_value_to_string(
            span.input
                .as_ref()
                .unwrap_or(&Value::String(String::from(""))),
        );

        let span_output_string = json_value_to_string(
            span.output
                .as_ref()
                .unwrap_or(&Value::String(String::from(""))),
        );

        CHSpan {
            span_id: span.span_id,
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
                .or(usage.request_model)
                .unwrap_or(String::from("<null>")),
            session_id: session_id.unwrap_or(String::from("<null>")),
            project_id: project_id,
            trace_id: span.trace_id,
            provider: usage.provider_name.unwrap_or(String::from("<null>")),
            user_id: user_id.unwrap_or(String::from("<null>")),
            path: path.unwrap_or(String::from("<null>")),
            input: span_input_string,
            output: span_output_string,
            status: span.status.clone().unwrap_or(String::from("<null>")),
            size_bytes: size_bytes as u64,
        }
    }
}

pub async fn insert_span(clickhouse: clickhouse::Client, span: &CHSpan) -> Result<()> {
    let ch_insert = clickhouse.insert("spans");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert.write(span).await?;
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!("Clickhouse span insertion failed: {:?}", e));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert span into Clickhouse: {:?}",
                e
            ));
        }
    }
}

#[derive(Row, Deserialize)]
pub struct SpanSearchResult {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
}

pub async fn search_spans_for_span_ids(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    search_query: &str,
    params: &SearchSpansParams,
) -> Result<Option<HashSet<Uuid>>, Box<dyn std::error::Error + Send + Sync>> {
    let search_fields = params.search_in();

    let mut search_conditions = Vec::new();
    for field in &search_fields {
        match field.as_str() {
            "input" => search_conditions.push("lower(input) LIKE lower(?)"),
            "output" => search_conditions.push("lower(output) LIKE lower(?)"),
            _ => {}
        }
    }

    if search_conditions.is_empty() {
        return Ok(None);
    }

    let search_condition = search_conditions.join(" OR ");

    let start_time_ns = chrono_to_nanoseconds(params.start_time());
    let end_time_ns = chrono_to_nanoseconds(params.end_time());

    let mut query = format!(
        "SELECT DISTINCT span_id 
         FROM spans 
         WHERE project_id = ?
           AND start_time IS NOT NULL 
           AND end_time IS NOT NULL
           AND start_time <= fromUnixTimestamp64Nano(?)
           AND end_time >= fromUnixTimestamp64Nano(?)
           AND ({})",
        search_condition
    );

    if params.trace_id.is_some() {
        query.push_str(" AND trace_id = ?");
    }

    query.push_str(" LIMIT 10000");

    let search_pattern = format!("%{}%", search_query.to_lowercase());
    
    let mut query_builder = clickhouse
        .query(&query)
        .bind(project_id)
        .bind(end_time_ns)
        .bind(start_time_ns);

    for _ in &search_conditions {
        query_builder = query_builder.bind(&search_pattern);
    }

    if let Some(trace_id) = params.trace_id {
        query_builder = query_builder.bind(trace_id);
    }

    let rows = query_builder.fetch_all::<SpanSearchResult>().await?;

    let span_ids: HashSet<Uuid> = rows.into_iter().map(|row| row.span_id).collect();
    
    if span_ids.is_empty() {
        Ok(None)
    } else {
        Ok(Some(span_ids))
    }
}