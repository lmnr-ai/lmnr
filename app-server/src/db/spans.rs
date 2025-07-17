use std::{collections::{HashMap, HashSet}, str::FromStr};

use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

use crate::{ch::spans::search_spans_for_span_ids, db::filters::{validate_and_convert_filters, deserialize_filters, FieldConfig, FieldType, Filter, FilterValue}, routes::error::Error, traces::spans::{should_keep_attribute, SpanAttributes}};
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
    // Possible further optimization:
    // clone all small values from the span, e.g. trace_id, parent_span_id, etc.
    // into local variables here, and then move the `span` into `prepare_span_db_values`
    // so that inside `prepare_span_db_values` we don't have to clone the attributes,
    // which are slightly (after filtering) larger.
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
                    Some((k.clone(), v.clone()))
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

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpanSearchItem {
    pub span_id: Uuid,
    pub trace_id: Uuid,
    pub parent_span_id: Option<Uuid>,
    pub name: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub span_type: SpanType,
    pub status: Option<String>,
    pub latency: Option<f64>,
    pub input_cost: Option<f64>,
    pub output_cost: Option<f64>,
    pub cost: Option<f64>,
    pub input_token_count: Option<i64>,
    pub output_token_count: Option<i64>,
    pub total_token_count: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSpansParams {
    pub page_size: Option<i32>,
    pub page_number: Option<i32>,
    pub search: Option<String>,
    pub search_in: Option<Vec<String>>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub trace_id: Option<Uuid>,
    #[serde(default, deserialize_with = "deserialize_filters")]
    pub filters: Vec<Filter>,
}

impl SearchSpansParams {
    const MAX_TIME_RANGE_DAYS: i64 = 30;
    const MAX_PAGE_SIZE: i32 = 50;

    pub fn page_size(&self) -> i32 {
        self.page_size.unwrap_or(25)
    }
    
    pub fn page_number(&self) -> i32 {
        self.page_number.unwrap_or(0)
    }
    
    pub fn offset(&self) -> i32 {
        self.page_number() * self.page_size()
    }

    pub fn start_time(&self) -> DateTime<Utc> {
        self.start_time.unwrap_or_else(|| Utc::now() - Duration::hours(24))
    }
    
    pub fn end_time(&self) -> DateTime<Utc> {
        self.end_time.unwrap_or_else(|| Utc::now())
    }
    
    pub fn search_in(&self) -> Vec<String> {
        self.search_in.clone().unwrap_or_else(|| vec!["input".to_string(), "output".to_string()])
    }

    pub fn filters(&self) -> &[Filter] {
        &self.filters
    }

    pub fn validate_and_convert_filters(&mut self) -> Result<(), Error> {
        let field_configs = create_spans_field_configs();
        self.filters = validate_and_convert_filters(&self.filters, &field_configs)?;
        Ok(())
    }

    pub fn validate(&mut self) -> Result<(), Error> {
        self.validate_time_range()?;
        self.validate_page_size()?;
        self.validate_and_convert_filters()?;
        Ok(())
    }

    fn validate_time_range(&self) -> Result<(), Error> {
        let start = self.start_time();
        let end = self.end_time();
        
        if start >= end {
            return Err(Error::BadRequest(
                "Start time must be before end time".to_string()
            ));
        }

        let time_range = end.signed_duration_since(start);
        let max_duration = Duration::days(Self::MAX_TIME_RANGE_DAYS);
        
        if time_range > max_duration {
            return Err(Error::BadRequest(
                format!(
                    "Time range cannot exceed {} days. Current range: {} days",
                    Self::MAX_TIME_RANGE_DAYS,
                    time_range.num_days()
                )
            ));
        }
        
        Ok(())
    }

    fn validate_page_size(&self) -> Result<(), Error> {
        let page_size = self.page_size();
        
        if page_size <= 0 {
            return Err(Error::BadRequest(
                "Page size must be greater than 0".to_string()
            ));
        }

        if page_size > Self::MAX_PAGE_SIZE {
            return Err(Error::BadRequest(
                format!(
                    "Page size cannot exceed {}. Current page size: {}",
                    Self::MAX_PAGE_SIZE,
                    page_size
                )
            ));
        }
        
        Ok(())
    }
}

fn create_spans_field_configs() -> HashMap<String, FieldConfig> {
    let mut configs = HashMap::new();

    configs.insert("span_type".to_string(), FieldConfig::new(
        FieldType::Enum,
        "s.span_type"
    ).with_validator(validate_span_type));

    configs.insert("span_id".to_string(), FieldConfig::new(
        FieldType::Uuid,
        "s.span_id"
    ));

    configs.insert("trace_id".to_string(), FieldConfig::new(
        FieldType::Uuid,
        "s.trace_id"
    ));

    configs.insert("parent_span_id".to_string(), FieldConfig::new(
        FieldType::Uuid,
        "s.parent_span_id"
    ));

    configs.insert("name".to_string(), FieldConfig::new(
        FieldType::String,
        "s.name"
    ));

    configs.insert("status".to_string(), FieldConfig::new(
        FieldType::String,
        "s.status"
    ));

    configs.insert("latency".to_string(), FieldConfig::new(
        FieldType::Float,
        "CAST(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) * 1000 AS FLOAT8)"
    ));

    configs.insert("input_cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "CAST(s.attributes->>'gen_ai.usage.input_cost' AS FLOAT8)"
    ));

    configs.insert("output_cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "CAST(s.attributes->>'gen_ai.usage.output_cost' AS FLOAT8)"
    ));

    configs.insert("cost".to_string(), FieldConfig::new(
        FieldType::Float,
        "CAST(s.attributes->>'gen_ai.usage.cost' AS FLOAT8)"
    ));

    configs.insert("input_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "CAST(s.attributes->>'gen_ai.usage.input_tokens' AS BIGINT)"
    ));

    configs.insert("output_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "CAST(s.attributes->>'gen_ai.usage.output_tokens' AS BIGINT)"
    ));

    configs.insert("total_token_count".to_string(), FieldConfig::new(
        FieldType::Integer,
        "CAST(s.attributes->>'llm.usage.total_tokens' AS BIGINT)"
    ));

    configs
}

fn validate_span_type(value: &crate::db::filters::FilterValue) -> Result<(), String> {
    if let FilterValue::String(s) = value {
        SpanType::from_str(s)
            .map_err(|_| format!("Invalid span type: {}. Valid values: DEFAULT, LLM, PIPELINE, EXECUTOR, EVALUATOR, HUMAN_EVALUATOR, EVALUATION, TOOL", s))?;
        Ok(())
    } else {
        Err("Span type must be a string".to_string())
    }
}

fn build_span_filters<'a>(
    mut query_builder: QueryBuilder<'a, sqlx::Postgres>,
    project_id: Uuid,
    span_ids: &'a Option<HashSet<Uuid>>,
    params: &'a SearchSpansParams,
) -> Result<QueryBuilder<'a, sqlx::Postgres>, Error> {
    query_builder.push_bind(project_id);

    if let Some(trace_id) = params.trace_id {
        query_builder.push(" AND s.trace_id = ");
        query_builder.push_bind(trace_id);
    }

    if let Some(span_ids) = span_ids {
        query_builder.push(" AND s.span_id = ANY(");
        query_builder.push_bind(span_ids.iter().cloned().collect::<Vec<Uuid>>());
        query_builder.push(")");
    }

    query_builder.push(" AND s.start_time >= ");
    query_builder.push_bind(params.start_time());
    
    query_builder.push(" AND s.end_time <= ");
    query_builder.push_bind(params.end_time());

    let field_configs = create_spans_field_configs();
    for filter in params.filters() {
        query_builder = filter.apply_to_query_builder(query_builder, &field_configs)
            .map_err(|e| Error::BadRequest(e))?;
    }

    Ok(query_builder)
}

async fn get_spans(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &SearchSpansParams,
    span_ids: &Option<HashSet<Uuid>>,
) -> Result<Vec<SpanSearchItem>, Error> {
    if let Some(span_ids) = span_ids {
        if span_ids.is_empty() {
            return Ok(Vec::new());
        }
    }

    let main_query_builder = QueryBuilder::new(
        "SELECT 
            s.span_id, 
            s.trace_id,
            s.parent_span_id,
            s.name,
            s.start_time, 
            s.end_time, 
            s.span_type, 
            s.status,
            CASE
                WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL 
                THEN CAST(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) * 1000 AS FLOAT8)
                ELSE NULL 
            END as latency,
            CAST(s.attributes->>'gen_ai.usage.input_cost' AS FLOAT8) as input_cost,
            CAST(s.attributes->>'gen_ai.usage.output_cost' AS FLOAT8) as output_cost,
            CAST(s.attributes->>'gen_ai.usage.cost' AS FLOAT8) as cost,
            CAST(s.attributes->>'gen_ai.usage.input_tokens' AS BIGINT) as input_token_count,
            CAST(s.attributes->>'gen_ai.usage.output_tokens' AS BIGINT) as output_token_count,
            CAST(s.attributes->>'llm.usage.total_tokens' AS BIGINT) as total_token_count
         FROM spans s
         WHERE s.project_id = "
    );

    let mut main_query_builder = build_span_filters(main_query_builder, project_id, &span_ids, params)?;

    main_query_builder.push(" ORDER BY s.start_time DESC");
    
    if params.page_size() > 0 {
        main_query_builder.push(" LIMIT ");
        main_query_builder.push_bind(params.page_size());
    }

    if params.page_number() > 0 {
        main_query_builder.push(" OFFSET ");
        main_query_builder.push_bind(params.offset());
    }

    main_query_builder
        .build_query_as::<SpanSearchItem>()
        .fetch_all(pool)
        .await
        .map_err(|e| e.into())
}

async fn count_spans(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    params: &SearchSpansParams,
    span_ids: &Option<HashSet<Uuid>>,
) -> Result<i64, Error> {
    if let Some(span_ids) = span_ids {
        if span_ids.is_empty() {
            return Ok(0);
        }
    }

    let count_query_builder = QueryBuilder::new(
        "SELECT COUNT(s.span_id) as count 
         FROM spans s
         WHERE s.project_id = "
    );
    let mut count_query_builder = build_span_filters(count_query_builder, project_id, &span_ids, params)?;

    let count_result: (i64,) = count_query_builder
        .build_query_as::<(i64,)>()
        .fetch_one(pool)
        .await?;

    Ok(count_result.0)
}

pub async fn search_spans(
    pool: &PgPool,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    mut params: SearchSpansParams,
) -> Result<(Vec<SpanSearchItem>, i64), Error> {
    params.validate()?;

    let span_ids = if let Some(search_query) = &params.search {
        match search_spans_for_span_ids(clickhouse, project_id, search_query, &params)
            .await
            .map_err(|e| anyhow::anyhow!("{}", e))? {
            Some(ids) => Some(ids),
            None => {
                return Ok((Vec::new(), 0));
            }
            }
    } else {
        None
    };

    let (count_result, spans_result) = tokio::join!(
        count_spans(&pool, project_id, &params, &span_ids),
        get_spans(&pool, project_id, &params, &span_ids)
    );

    let count = count_result?;
    let data = spans_result?;

    Ok((data, count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_prepare_span_db_values_openai() {
        // Create a span with OpenAI-style attributes with conversation history and tool calls
        let attributes = HashMap::from([
            ("gen_ai.system".to_string(), json!("OpenAI")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            // First message - user question
            ("gen_ai.prompt.0.role".to_string(), json!("user")),
            (
                "gen_ai.prompt.0.content".to_string(),
                json!("What is the weather and current time in San Francisco?"),
            ),
            // Second message - assistant with tool call
            ("gen_ai.prompt.1.role".to_string(), json!("assistant")),
            (
                "gen_ai.prompt.1.tool_calls.0.id".to_string(),
                json!("call_1"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Third message - tool response
            ("gen_ai.prompt.2.role".to_string(), json!("tool")),
            (
                "gen_ai.prompt.2.content".to_string(),
                json!("Sunny and 65 degrees Fahrenheit"),
            ),
            ("gen_ai.prompt.2.tool_call_id".to_string(), json!("call_1")),
            // Completion - assistant with another tool call
            ("gen_ai.completion.0.role".to_string(), json!("assistant")),
            (
                "gen_ai.completion.0.finish_reason".to_string(),
                json!("tool_calls"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.id".to_string(),
                json!("call_vqQRzJX8Csv19WyJucQnOUJH"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.name".to_string(),
                json!("get_time"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
                json!("{\"location\":\"San Francisco, CA\"}"),
            ),
            // Token usage
            ("gen_ai.usage.prompt_tokens".to_string(), json!(173)),
            ("gen_ai.usage.completion_tokens".to_string(), json!(17)),
        ]);

        let span = Span {
            span_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "openai.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            labels: None,
            input_url: None,
            output_url: None,
        };

        let db_values = prepare_span_db_values(&span);

        // Check that the attributes_value is properly structured
        assert!(db_values.attributes_value.is_object());
        let attrs = db_values.attributes_value.as_object().unwrap();

        // Verify that gen_ai.prompt/completion content and role attributes are REMOVED
        assert!(!attrs.contains_key("gen_ai.prompt.0.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.0.content"));
        assert!(!attrs.contains_key("gen_ai.prompt.1.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.content"));
        assert!(!attrs.contains_key("gen_ai.completion.0.role"));

        // Verify that tool call attributes are PRESERVED
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_vqQRzJX8Csv19WyJucQnOUJH"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\":\"San Francisco, CA\"}"))
        );

        // Verify that other attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("OpenAI")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(attrs.get("gen_ai.usage.prompt_tokens"), Some(&json!(173)));
        assert_eq!(
            attrs.get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.2.tool_call_id"),
            Some(&json!("call_1"))
        );
    }

    #[test]
    fn test_prepare_span_db_values_langchain() {
        // Create a span with LangChain-style attributes with conversation history and tool calls
        let attributes = HashMap::from([
            (
                "lmnr.span.path".to_string(),
                json!([
                    "integration/0150_langchain_tool_calls_with_history",
                    "ChatOpenAI.chat"
                ]),
            ),
            (
                "lmnr.span.ids_path".to_string(),
                json!([
                    "00000000-0000-0000-f961-aebceb94f98a",
                    "00000000-0000-0000-46eb-a5ee110c65db"
                ]),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("python"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.16")),
            (
                "lmnr.span.language_version".to_string(),
                json!("python@3.13"),
            ),
            (
                "lmnr.association.properties.ls_provider".to_string(),
                json!("openai"),
            ),
            (
                "lmnr.association.properties.ls_model_name".to_string(),
                json!("gpt-4.1-nano"),
            ),
            (
                "lmnr.association.properties.ls_model_type".to_string(),
                json!("chat"),
            ),
            ("gen_ai.system".to_string(), json!("Langchain")),
            ("llm.request.type".to_string(), json!("chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "llm.request.functions.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "llm.request.functions.0.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            (
                "llm.request.functions.1.name".to_string(),
                json!("get_time"),
            ),
            (
                "llm.request.functions.1.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            (
                "llm.request.functions.2.name".to_string(),
                json!("get_city_population"),
            ),
            (
                "llm.request.functions.2.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            // First message - user question
            ("gen_ai.prompt.0.role".to_string(), json!("user")),
            (
                "gen_ai.prompt.0.content".to_string(),
                json!("What is the weather and current time in San Francisco?"),
            ),
            // Second message - assistant with tool call
            ("gen_ai.prompt.1.role".to_string(), json!("assistant")),
            (
                "gen_ai.prompt.1.tool_calls.0.id".to_string(),
                json!("call_1"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Third message - tool response
            ("gen_ai.prompt.2.role".to_string(), json!("tool")),
            (
                "gen_ai.prompt.2.content".to_string(),
                json!("Sunny and 65 degrees Fahrenheit"),
            ),
            ("gen_ai.prompt.2.tool_call_id".to_string(), json!("call_1")),
            // Response metadata
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("chatcmpl-BpaSv7Z7XDi3F3egHJXBxKPJIVxqg"),
            ),
            // Completion - assistant with another tool call
            ("gen_ai.completion.0.content".to_string(), json!("")),
            (
                "gen_ai.completion.0.finish_reason".to_string(),
                json!("tool_calls"),
            ),
            ("gen_ai.completion.0.role".to_string(), json!("assistant")),
            (
                "gen_ai.completion.0.tool_calls.0.id".to_string(),
                json!("call_TCZXJQAoVZoeGRcTwN6I7rh1"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.name".to_string(),
                json!("get_time"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Token usage
            ("gen_ai.usage.prompt_tokens".to_string(), json!(108)),
            ("gen_ai.usage.completion_tokens".to_string(), json!(17)),
            ("llm.usage.total_tokens".to_string(), json!(125)),
            ("gen_ai.usage.cache_read_input_tokens".to_string(), json!(0)),
            // Traceloop entity attributes that should be filtered out
            ("traceloop.entity.input".to_string(), json!("some input")),
            ("traceloop.entity.output".to_string(), json!("some output")),
            ("traceloop.entity.path".to_string(), json!("some path")),
        ]);

        let span = Span {
            span_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: Some(Uuid::new_v4()),
            name: "ChatOpenAI.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            labels: None,
            input_url: None,
            output_url: None,
        };

        let db_values = prepare_span_db_values(&span);

        // Check that the attributes_value is properly structured
        assert!(db_values.attributes_value.is_object());
        let attrs = db_values.attributes_value.as_object().unwrap();

        // Verify that gen_ai.prompt/completion content and role attributes are REMOVED
        assert!(!attrs.contains_key("gen_ai.prompt.0.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.0.content"));
        assert!(!attrs.contains_key("gen_ai.prompt.1.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.content"));
        assert!(!attrs.contains_key("gen_ai.completion.0.role"));
        assert!(!attrs.contains_key("gen_ai.completion.0.content"));

        // Verify that traceloop.entity attributes are REMOVED
        assert!(!attrs.contains_key("traceloop.entity.input"));
        assert!(!attrs.contains_key("traceloop.entity.output"));
        assert!(!attrs.contains_key("traceloop.entity.path"));

        // Verify that tool call attributes are PRESERVED
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_TCZXJQAoVZoeGRcTwN6I7rh1"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );

        // Verify that LangChain-specific attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("Langchain")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpaSv7Z7XDi3F3egHJXBxKPJIVxqg"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(attrs.get("gen_ai.usage.prompt_tokens"), Some(&json!(108)));
        assert_eq!(
            attrs.get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
        assert_eq!(attrs.get("llm.usage.total_tokens"), Some(&json!(125)));
        assert_eq!(
            attrs.get("gen_ai.usage.cache_read_input_tokens"),
            Some(&json!(0))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.2.tool_call_id"),
            Some(&json!("call_1"))
        );

        // Verify LangChain association properties are PRESERVED
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_provider"),
            Some(&json!("openai"))
        );
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_model_name"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_model_type"),
            Some(&json!("chat"))
        );
        assert_eq!(attrs.get("llm.request.type"), Some(&json!("chat")));

        // Verify function metadata is PRESERVED
        assert_eq!(
            attrs.get("llm.request.functions.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("llm.request.functions.1.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("llm.request.functions.2.name"),
            Some(&json!("get_city_population"))
        );

        // Verify path and instrumentation metadata are PRESERVED
        assert_eq!(
            attrs.get("lmnr.span.path"),
            Some(&json!([
                "integration/0150_langchain_tool_calls_with_history",
                "ChatOpenAI.chat"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.ids_path"),
            Some(&json!([
                "00000000-0000-0000-f961-aebceb94f98a",
                "00000000-0000-0000-46eb-a5ee110c65db"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.instrumentation_source"),
            Some(&json!("python"))
        );
        assert_eq!(attrs.get("lmnr.span.sdk_version"), Some(&json!("0.6.16")));
        assert_eq!(
            attrs.get("lmnr.span.language_version"),
            Some(&json!("python@3.13"))
        );
    }

    #[test]
    fn test_prepare_span_db_values_ai_sdk() {
        // Create child span (ai.generateText.doGenerate) - has LLM span type
        let child_attributes = HashMap::from([
            (
                "operation.name".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            (
                "ai.operationId".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            ("ai.model.provider".to_string(), json!("openai.chat")),
            ("ai.model.id".to_string(), json!("gpt-4.1-nano")),
            ("ai.settings.maxRetries".to_string(), json!(2)),
            ("ai.prompt.format".to_string(), json!("messages")),
            (
                "ai.prompt.messages".to_string(),
                json!(
                    "[{\"role\":\"system\",\"content\":\"You are a helpful assistant.\"},{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"What is the weather in SF?\"}]}]"
                ),
            ),
            (
                "ai.prompt.tools".to_string(),
                json!([
                    "{\"type\":\"function\",\"name\":\"get_weather\",\"description\":\"Get the weather in a given location\",\"parameters\":{\"type\":\"object\",\"properties\":{\"location\":{\"type\":\"string\",\"description\":\"The city and state, e.g. San Francisco, CA\"}},\"required\":[\"location\"],\"additionalProperties\":false,\"$schema\":\"http://json-schema.org/draft-07/schema#\"}}",
                    "{\"type\":\"function\",\"name\":\"get_time\",\"description\":\"Get the time in a given location\",\"parameters\":{\"type\":\"object\",\"properties\":{\"location\":{\"type\":\"string\",\"description\":\"The city and state, e.g. San Francisco, CA\"}},\"required\":[\"location\"],\"additionalProperties\":false,\"$schema\":\"http://json-schema.org/draft-07/schema#\"}}"
                ]),
            ),
            (
                "ai.prompt.toolChoice".to_string(),
                json!("{\"type\":\"auto\"}"),
            ),
            ("gen_ai.system".to_string(), json!("openai.chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "lmnr.span.ids_path".to_string(),
                json!([
                    "00000000-0000-0000-f961-aebceb94f98a",
                    "00000000-0000-0000-46eb-a5ee110c65db"
                ]),
            ),
            (
                "lmnr.span.path".to_string(),
                json!(["ai.generateText", "ai.generateText.doGenerate"]),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("javascript"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.13")),
            (
                "lmnr.span.language_version".to_string(),
                json!("node@23.3.0"),
            ),
            ("ai.response.finishReason".to_string(), json!("tool-calls")),
            (
                "ai.response.toolCalls".to_string(),
                json!(
                    "[{\"toolCallType\":\"function\",\"toolCallId\":\"call_akUJWoAUcWDcvNJzcZx3MzPg\",\"toolName\":\"get_weather\",\"args\":\"{\\\"location\\\":\\\"San Francisco, CA\\\"}\"}]"
                ),
            ),
            (
                "ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            (
                "ai.response.timestamp".to_string(),
                json!("2025-07-04T13:22:40.000Z"),
            ),
            ("ai.usage.promptTokens".to_string(), json!(108)),
            ("ai.usage.completionTokens".to_string(), json!(17)),
            (
                "gen_ai.response.finish_reasons".to_string(),
                json!(["tool-calls"]),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            ("gen_ai.usage.input_tokens".to_string(), json!(108)),
            ("gen_ai.usage.output_tokens".to_string(), json!(17)),
            // AI SDK attributes that should be filtered out
            (
                "ai.prompt".to_string(),
                json!(
                    "{\"system\":\"You are a helpful assistant.\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"What is the weather in SF?\"}]}]}"
                ),
            ),
            // Laminar internal attributes that should be filtered out
            ("lmnr.span.input".to_string(), json!("some input")),
            ("lmnr.span.output".to_string(), json!("some output")),
        ]);

        let span = Span {
            span_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: Some(Uuid::new_v4()),
            name: "ai.generateText.doGenerate".to_string(),
            attributes: SpanAttributes::new(child_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            labels: None,
            input_url: None,
            output_url: None,
        };

        let db_values = prepare_span_db_values(&span);

        // Check that the attributes_value is properly structured
        assert!(db_values.attributes_value.is_object());
        let attrs = db_values.attributes_value.as_object().unwrap();

        // Verify that AI SDK attributes are REMOVED
        assert!(!attrs.contains_key("ai.prompt.messages"));
        assert!(!attrs.contains_key("ai.prompt"));

        // Verify that Laminar internal attributes are REMOVED
        assert!(!attrs.contains_key("lmnr.span.input"));
        assert!(!attrs.contains_key("lmnr.span.output"));

        // Verify that other AI SDK attributes are PRESERVED
        assert_eq!(
            attrs.get("operation.name"),
            Some(&json!("ai.generateText.doGenerate"))
        );
        assert_eq!(
            attrs.get("ai.operationId"),
            Some(&json!("ai.generateText.doGenerate"))
        );
        assert_eq!(attrs.get("ai.model.provider"), Some(&json!("openai.chat")));
        assert_eq!(attrs.get("ai.model.id"), Some(&json!("gpt-4.1-nano")));
        assert_eq!(attrs.get("ai.settings.maxRetries"), Some(&json!(2)));
        assert_eq!(attrs.get("ai.prompt.format"), Some(&json!("messages")));
        assert_eq!(
            attrs.get("ai.prompt.toolChoice"),
            Some(&json!("{\"type\":\"auto\"}"))
        );

        // Verify GenAI attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("openai.chat")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.finish_reasons"),
            Some(&json!(["tool-calls"]))
        );
        assert_eq!(
            attrs.get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(attrs.get("gen_ai.usage.input_tokens"), Some(&json!(108)));
        assert_eq!(attrs.get("gen_ai.usage.output_tokens"), Some(&json!(17)));

        // Verify response attributes are PRESERVED
        assert_eq!(
            attrs.get("ai.response.finishReason"),
            Some(&json!("tool-calls"))
        );
        assert_eq!(
            attrs.get("ai.response.toolCalls"),
            Some(&json!(
                "[{\"toolCallType\":\"function\",\"toolCallId\":\"call_akUJWoAUcWDcvNJzcZx3MzPg\",\"toolName\":\"get_weather\",\"args\":\"{\\\"location\\\":\\\"San Francisco, CA\\\"}\"}]"
            ))
        );
        assert_eq!(
            attrs.get("ai.response.id"),
            Some(&json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"))
        );
        assert_eq!(
            attrs.get("ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("ai.response.timestamp"),
            Some(&json!("2025-07-04T13:22:40.000Z"))
        );

        // Verify usage attributes are PRESERVED
        assert_eq!(attrs.get("ai.usage.promptTokens"), Some(&json!(108)));
        assert_eq!(attrs.get("ai.usage.completionTokens"), Some(&json!(17)));

        // Verify path and instrumentation metadata are PRESERVED
        assert_eq!(
            attrs.get("lmnr.span.path"),
            Some(&json!(["ai.generateText", "ai.generateText.doGenerate"]))
        );
        assert_eq!(
            attrs.get("lmnr.span.ids_path"),
            Some(&json!([
                "00000000-0000-0000-f961-aebceb94f98a",
                "00000000-0000-0000-46eb-a5ee110c65db"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.instrumentation_source"),
            Some(&json!("javascript"))
        );
        assert_eq!(attrs.get("lmnr.span.sdk_version"), Some(&json!("0.6.13")));
        assert_eq!(
            attrs.get("lmnr.span.language_version"),
            Some(&json!("node@23.3.0"))
        );
    }
}
