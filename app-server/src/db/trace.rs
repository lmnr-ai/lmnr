use std::{collections::HashMap, str::FromStr};

use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    db::modifiers::DateRange,
    language_model::{
        providers::anthropic::OtelChatMessageContentPart, ChatMessage, ChatMessageContent,
    },
    opentelemetry::opentelemetry_proto_trace_v1::Span as OtelSpan,
    pipeline::{nodes::Message, trace::MetaLog},
    traces::{
        attributes::{
            ASSOCIATION_PROPERTIES_PREFIX, GEN_AI_INPUT_COST, GEN_AI_INPUT_TOKENS,
            GEN_AI_OUTPUT_COST, GEN_AI_OUTPUT_TOKENS, GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL,
            GEN_AI_SYSTEM, GEN_AI_TOTAL_COST, SPAN_TYPE,
        },
        SpanUsage,
    },
};

use super::{
    modifiers::Filter,
    utils::{add_date_range_to_query, convert_any_value_to_json_value, span_id_to_uuid},
};

const DEFAULT_VERSION: &str = "0.1.0";

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

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
}

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
        }
    }
}

fn default_true() -> bool {
    true
}

const INPUT_ATTRIBUTE_NAME: &str = "lmnr.span.input";
const OUTPUT_ATTRIBUTE_NAME: &str = "lmnr.span.output";

#[derive(Deserialize, Serialize, sqlx::FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    pub id: Uuid,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    // Laminar trace format's version
    version: String,
    // Laminar customers' release version
    release: Option<String>,
    // User id of Laminar customers' user
    user_id: Option<String>,
    session_id: Option<String>,
    metadata: Option<Value>,
    #[serde(default)]
    total_token_count: i64,
    #[serde(default)]
    cost: f64,
    #[serde(default = "default_true")]
    success: bool,
    // Project id is default because it's added later based on the ProjectApiKey
    #[serde(default)]
    pub project_id: Uuid,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TraceWithEvents {
    id: Uuid,
    start_time: DateTime<Utc>,
    end_time: Option<DateTime<Utc>>,
    // Laminar trace format's version
    version: String,
    // Laminar customers' release version
    release: Option<String>,
    // User id of Laminar customers' user
    user_id: Option<String>,
    session_id: Option<String>,
    metadata: Option<Value>,
    total_token_count: i64,
    cost: f64,
    success: bool,
    project_id: Uuid,
    // 'events' is a list of partial event objects, using Option because of Coalesce
    events: Option<Value>,
}

#[derive(Default, Clone, Debug)]
pub struct TraceAttributes {
    id: Uuid,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    total_token_count: Option<i64>,
    cost: Option<f64>,
    success: Option<bool>,
    session_id: Option<String>,
    user_id: Option<String>,
    trace_type: Option<TraceType>,
}

impl TraceAttributes {
    pub fn new(trace_id: Uuid) -> Self {
        Self {
            id: trace_id,
            ..Default::default()
        }
    }

    pub fn add_tokens(&mut self, tokens: i64) {
        self.total_token_count = Some(self.total_token_count.unwrap_or(0) + tokens);
    }

    pub fn add_cost(&mut self, cost: f64) {
        self.cost = Some(self.cost.unwrap_or(0.0) + cost);
    }

    pub fn update_start_time(&mut self, start_time: DateTime<Utc>) {
        if self.start_time.is_none() || self.start_time.unwrap() > start_time {
            self.start_time = Some(start_time);
        }
    }

    pub fn update_end_time(&mut self, end_time: DateTime<Utc>) {
        if self.end_time.is_none() || self.end_time.unwrap() < end_time {
            self.end_time = Some(end_time);
        }
    }
    pub fn update_session_id(&mut self, session_id: Option<String>) {
        self.session_id = session_id;
    }

    pub fn update_user_id(&mut self, user_id: Option<String>) {
        self.user_id = user_id;
    }

    pub fn update_trace_type(&mut self, trace_type: Option<TraceType>) {
        self.trace_type = trace_type;
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, Default, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub version: String,
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
}

/// List of available fields on the span. This is needed for "export to dataset query"
/// so frontend can specify which fields to include in the dataset
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpanField {
    SpanId,
    Name,
    ParentSpanId,
    TraceId,
    StartTime,
    EndTime,
    Input,
    Output,
    SpanType,
}

pub struct SpanAttributes {
    pub attributes: HashMap<String, Value>,
}

impl SpanAttributes {
    pub fn new(attributes: HashMap<String, Value>) -> Self {
        Self { attributes }
    }

    pub fn session_id(&self) -> Option<String> {
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}session_id").as_str())
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}user_id").as_str())
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn trace_type(&self) -> Option<TraceType> {
        self.attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}trace_type").as_str())
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    pub fn prompt_tokens(&self) -> i64 {
        match self.attributes.get(GEN_AI_INPUT_TOKENS) {
            Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
            _ => 0,
        }
    }

    pub fn completion_tokens(&self) -> i64 {
        match self.attributes.get(GEN_AI_OUTPUT_TOKENS) {
            Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
            _ => 0,
        }
    }

    pub fn request_model(&self) -> Option<String> {
        match self.attributes.get(GEN_AI_REQUEST_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn response_model(&self) -> Option<String> {
        match self.attributes.get(GEN_AI_RESPONSE_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn provider_name(&self) -> Option<String> {
        match self.attributes.get(GEN_AI_SYSTEM) {
            Some(Value::String(s)) => Some(self.get_langchain_provider(s)),
            _ => None,
        }
    }

    // Traceloop's auto-instrumentation sends the provider name as "Langchain" and the actual provider
    // name as an attribute `association_properties.ls_provider`. This function returns the actual provider
    // name if the provider is "Langchain" or the provider itself.
    fn get_langchain_provider(&self, provider: &String) -> String {
        if provider == "Langchain" {
            let ls_provider = self
                .attributes
                .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}ls_provider").as_str())
                .and_then(|s| serde_json::from_value(s.clone()).ok());
            if let Some(ls_provider) = ls_provider {
                ls_provider
            } else {
                provider.clone()
            }
        } else {
            provider.clone()
        }
    }

    pub fn span_type(&self) -> SpanType {
        if let Some(span_type) = self.attributes.get(SPAN_TYPE) {
            serde_json::from_value::<SpanType>(span_type.clone()).unwrap_or_default()
        } else {
            // quick hack until we figure how to set span type on auto-instrumentation
            if self.attributes.contains_key("gen_ai.system") {
                SpanType::LLM
            } else {
                SpanType::DEFAULT
            }
        }
    }

    pub fn set_usage(&mut self, usage: &SpanUsage) {
        self.attributes
            .insert(GEN_AI_INPUT_TOKENS.to_string(), json!(usage.prompt_tokens));
        self.attributes.insert(
            GEN_AI_OUTPUT_TOKENS.to_string(),
            json!(usage.completion_tokens),
        );
        self.attributes
            .insert(GEN_AI_TOTAL_COST.to_string(), json!(usage.total_cost));
        self.attributes
            .insert(GEN_AI_INPUT_COST.to_string(), json!(usage.input_cost));
        self.attributes
            .insert(GEN_AI_OUTPUT_COST.to_string(), json!(usage.output_cost));

        if let Some(request_model) = &usage.request_model {
            self.attributes
                .insert(GEN_AI_REQUEST_MODEL.to_string(), json!(request_model));
        }
        if let Some(response_model) = &usage.response_model {
            self.attributes
                .insert(GEN_AI_RESPONSE_MODEL.to_string(), json!(response_model));
        }
        if let Some(provider_name) = &usage.provider_name {
            self.attributes
                .insert(GEN_AI_SYSTEM.to_string(), json!(provider_name));
        }
    }
}

impl Span {
    pub fn get_attributes(&self) -> SpanAttributes {
        let attributes =
            serde_json::from_value::<HashMap<String, Value>>(self.attributes.clone()).unwrap();

        SpanAttributes::new(attributes)
    }

    pub fn set_attributes(&mut self, attributes: &SpanAttributes) {
        self.attributes = serde_json::to_value(&attributes.attributes).unwrap();
    }

    pub fn from_otel_span(otel_span: OtelSpan) -> Self {
        let trace_id = Uuid::from_slice(&otel_span.trace_id).unwrap();

        let span_id = span_id_to_uuid(&otel_span.span_id);

        let parent_span_id = if otel_span.parent_span_id.is_empty() {
            None
        } else {
            Some(span_id_to_uuid(&otel_span.parent_span_id))
        };

        let attributes = otel_span
            .attributes
            .into_iter()
            .map(|k| (k.key, convert_any_value_to_json_value(k.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        let mut span = Span {
            version: String::from(DEFAULT_VERSION),
            span_id,
            trace_id,
            parent_span_id,
            name: otel_span.name,
            attributes: serde_json::Value::Object(
                attributes
                    .clone()
                    .into_iter()
                    .filter_map(|(k, v)| {
                        if should_keep_attribute(k.as_str()) {
                            Some((k, v))
                        } else {
                            None
                        }
                    })
                    .collect(),
            ),
            start_time: Utc.timestamp_nanos(otel_span.start_time_unix_nano as i64),
            end_time: Utc.timestamp_nanos(otel_span.end_time_unix_nano as i64),
            ..Default::default()
        };

        span.span_type = span.get_attributes().span_type();

        if span.span_type == SpanType::LLM {
            let mut input_messages: Vec<ChatMessage> = vec![];

            let mut i = 0;
            while attributes
                .get(format!("gen_ai.prompt.{}.content", i).as_str())
                .is_some()
            {
                let content = if let Some(serde_json::Value::String(s)) =
                    attributes.get(format!("gen_ai.prompt.{}.content", i).as_str())
                {
                    s.clone()
                } else {
                    "".to_string()
                };

                let role = if let Some(serde_json::Value::String(s)) =
                    attributes.get(format!("gen_ai.prompt.{}.role", i).as_str())
                {
                    s.clone()
                } else {
                    "user".to_string()
                };

                input_messages.push(ChatMessage {
                    role,
                    content: serde_json::from_str::<Vec<OtelChatMessageContentPart>>(&content)
                        .map(|parts| {
                            ChatMessageContent::ContentPartList(
                                parts.into_iter().map(|part| part.into()).collect(),
                            )
                        })
                        .unwrap_or(ChatMessageContent::Text(content.clone())),
                });
                i += 1;
            }

            span.input = Some(json!(input_messages));
            span.output = if let Some(serde_json::Value::String(s)) =
                attributes.get("gen_ai.completion.0.content")
            {
                Some(serde_json::Value::String(s.clone()))
            } else {
                None
            };
        } else {
            if let Some(serde_json::Value::String(s)) = attributes.get(INPUT_ATTRIBUTE_NAME) {
                span.input = Some(
                    serde_json::Value::from_str(s).unwrap_or(serde_json::Value::String(s.clone())),
                );
            }

            if let Some(serde_json::Value::String(s)) = attributes.get(OUTPUT_ATTRIBUTE_NAME) {
                span.output = Some(
                    serde_json::Value::from_str(s).unwrap_or(serde_json::Value::String(s.clone())),
                );
            }
        }

        span
    }

    pub fn create_parent_span_in_run_trace(
        trace_id: Uuid,
        run_stats: &crate::pipeline::trace::RunTraceStats,
        parent_span_id: Option<Uuid>,
        name: &String,
        messages: &HashMap<Uuid, Message>,
        trace_type: TraceType,
    ) -> Self {
        let mut inputs = HashMap::new();
        let mut outputs = HashMap::new();
        messages
            .values()
            .for_each(|msg| match msg.node_type.as_str() {
                "Input" => {
                    inputs.insert(msg.node_name.clone(), msg.value.clone());
                }
                "Output" => {
                    outputs.insert(msg.node_name.clone(), msg.value.clone());
                }
                _ => (),
            });
        let mut attributes = HashMap::new();
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}trace_type",),
            trace_type,
        );
        Self {
            span_id: Uuid::new_v4(),
            start_time: run_stats.start_time,
            end_time: run_stats.end_time,
            version: String::from(DEFAULT_VERSION),
            trace_id,
            parent_span_id,
            name: name.clone(),
            attributes: serde_json::json!(attributes),
            input: serde_json::to_value(inputs).ok(),
            output: serde_json::to_value(outputs).ok(),
            span_type: SpanType::PIPELINE,
            events: None,
        }
    }

    pub fn from_messages(
        messages: &HashMap<Uuid, Message>,
        trace_id: Uuid,
        parent_span_id: Uuid,
    ) -> Vec<Self> {
        messages
            .iter()
            .filter_map(|(msg_id, message)| {
                let input_values = message
                    .input_message_ids
                    .iter()
                    .map(|input_id| {
                        let input_message = messages.get(input_id).unwrap();
                        (
                            input_message.node_name.clone(),
                            input_message.value.clone().into(),
                        )
                    })
                    .collect::<HashMap<String, Value>>();
                let span = Span {
                    span_id: *msg_id,
                    start_time: message.start_time,
                    end_time: message.end_time,
                    version: String::from(DEFAULT_VERSION),
                    trace_id,
                    parent_span_id: Some(parent_span_id),
                    name: message.node_name.clone(),
                    attributes: span_attributes_from_meta_log(message.meta_log.clone()),
                    input: Some(serde_json::to_value(input_values).unwrap()),
                    output: Some(message.value.clone().into()),
                    span_type: match message.node_type.as_str() {
                        "LLM" => SpanType::LLM,
                        _ => SpanType::DEFAULT,
                    },
                    events: None,
                };
                match message.node_type.as_str() {
                    "LLM" | "SemanticSearch" => Some(span),
                    _ => None,
                }
            })
            .collect()
    }

    pub fn to_json_value(&self, fields: &Vec<SpanField>) -> Value {
        if fields.is_empty() {
            return Value::Object(Map::new());
        }

        let mut json_map = Map::new();

        for field in fields {
            match field {
                SpanField::SpanId => json_map.insert("spanId".to_string(), json!(self.span_id)),
                SpanField::Name => json_map.insert("name".to_string(), json!(self.name)),
                SpanField::ParentSpanId => {
                    json_map.insert("parentSpanId".to_string(), json!(self.parent_span_id))
                }
                SpanField::TraceId => json_map.insert("traceId".to_string(), json!(self.trace_id)),
                SpanField::StartTime => {
                    json_map.insert("startTime".to_string(), json!(self.start_time))
                }
                SpanField::EndTime => json_map.insert("endTime".to_string(), json!(self.end_time)),
                SpanField::Input => json_map.insert("input".to_string(), json!(self.input)),
                SpanField::Output => json_map.insert("output".to_string(), json!(self.output)),
                SpanField::SpanType => {
                    json_map.insert("spanType".to_string(), json!(self.span_type))
                }
            };
        }

        Value::Object(json_map)
    }
}

fn span_attributes_from_meta_log(meta_log: Option<MetaLog>) -> Value {
    match meta_log {
        Some(MetaLog::LLM(llm_log)) => serde_json::json!({
            GEN_AI_INPUT_TOKENS: llm_log.input_token_count,
            GEN_AI_OUTPUT_TOKENS: llm_log.output_token_count,
            GEN_AI_RESPONSE_MODEL: llm_log.model,
            GEN_AI_SYSTEM: llm_log.provider,
            GEN_AI_TOTAL_COST: llm_log.approximate_cost,
        }),
        _ => serde_json::json!({}),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanPreview {
    id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    // Laminar span format's version
    version: String,
    trace_id: Uuid,
    parent_span_id: Option<Uuid>,
    name: String,
    attributes: Value,
    metadata: Option<Value>,
    span_type: SpanType,
    // Using Option<Value> instead of Value (Value::Arrray) because of Coalesce
    events: Option<Value>,
}

#[derive(FromRow, Debug)]
struct TotalCount {
    total_count: i64,
}

pub async fn update_trace_attributes(
    pool: &PgPool,
    project_id: &Uuid,
    attributes: &TraceAttributes,
) -> Result<()> {
    sqlx::query(
        "
        INSERT INTO traces (
            id,
            project_id,
            total_token_count,
            cost,
            success,
            start_time,
            end_time,
            version,
            session_id,
            user_id,
            trace_type
        )
        VALUES (
            $1,
            $2,
            COALESCE($3, 0::int8),
            COALESCE($4, 0::float8),
            COALESCE($5, true),
            $6,
            $7,
            $8,
            $9,
            $10,
            COALESCE($11, 'DEFAULT'::trace_type)
        )
        ON CONFLICT(id) DO
        UPDATE
        SET 
            total_token_count = traces.total_token_count + COALESCE($3, 0),
            cost = traces.cost + COALESCE($4, 0),
            success = CASE WHEN $5 IS NULL THEN traces.success ELSE $5 END,
            start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $6 THEN $6 ELSE traces.start_time END,
            end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $7 THEN $7 ELSE traces.end_time END,
            session_id = CASE WHEN traces.session_id IS NULL THEN $9 ELSE traces.session_id END,
            user_id = CASE WHEN traces.user_id IS NULL THEN $10 ELSE traces.user_id END,
            trace_type = CASE WHEN $11 IS NULL THEN traces.trace_type ELSE COALESCE($11, 'DEFAULT'::trace_type) END
        "
    )
    .bind(attributes.id)
    .bind(project_id)
    .bind(attributes.total_token_count)
    .bind(attributes.cost)
    .bind(attributes.success)
    .bind(attributes.start_time)
    .bind(attributes.end_time)
    .bind(DEFAULT_VERSION)
    .bind(&attributes.session_id)
    .bind(&attributes.user_id)
    .bind(&attributes.trace_type)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn record_span(pool: &PgPool, span: &Span) -> Result<()> {
    sqlx::query(
        "INSERT INTO spans
            (version,
            span_id,
            trace_id,
            parent_span_id,
            start_time,
            end_time,
            name,
            attributes,
            input,
            output,
            span_type
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
            $11
   )",
    )
    .bind(&span.version)
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
    .execute(pool)
    .await?;

    Ok(())
}

pub fn add_traces_info_expression(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
) -> Result<()> {
    query.push(
        "
    traces_info(
        id,
        start_time,
        end_time,
        version,
        release,
        user_id,
        session_id,
        metadata,
        project_id,
        total_token_count,
        cost,
        success,
        trace_type,
        latency,
        status
    ) AS (
        SELECT
            t.id,
            t.start_time,
            t.end_time,
            t.version,
            t.release,
            t.user_id,
            t.session_id,
            t.metadata,
            t.project_id,
            t.total_token_count,
            t.cost,
            t.success,
            t.trace_type,
            EXTRACT(EPOCH FROM (t.end_time - t.start_time)),
            CASE WHEN t.success = true THEN 'Success' ELSE 'Failed' END
        FROM traces t
        WHERE start_time IS NOT NULL AND end_time IS NOT NULL ",
    );

    add_date_range_to_query(query, date_range, "t.start_time", Some("t.end_time"))?;

    query.push(")");

    Ok(())
}

pub fn add_traces_info_filtered_by_text(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
    text_search_filter: String,
    project_id: Uuid,
) -> Result<()> {
    query
        .push(
            "
    spans_with_trace AS MATERIALIZED (
        SELECT
            traces.id,
            traces.start_time,
            traces.end_time,
            traces.version,
            traces.release,
            traces.user_id,
            traces.session_id,
            traces.metadata,
            traces.project_id,
            traces.total_token_count,
            traces.cost,
            traces.success,
            traces.trace_type,
            spans.name as span_name,
            spans.attributes as span_attributes,
            spans.input as span_input,
            spans.output as span_output 
        FROM
            spans
        JOIN
            traces
        ON
            traces.id = spans.trace_id
        WHERE traces.project_id = ",
        )
        .push_bind(project_id)
        .push(" AND traces.start_time IS NOT NULL AND traces.end_time IS NOT NULL");

    add_date_range_to_query(
        query,
        date_range,
        "traces.start_time",
        Some("traces.end_time"),
    )?;

    query.push(" ),");

    // After pushing materialized CTE, we need to push the traces_info CTE
    query.push(
        "
        traces_info AS (
        SELECT DISTINCT ON(id)
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success,
            EXTRACT(EPOCH FROM (end_time - start_time)) as latency 
        FROM spans_with_trace st WHERE ",
    );

    query
        .push("(st.span_input::TEXT ILIKE ")
        .push_bind(format!("%{}%", &text_search_filter))
        .push(" OR st.span_output::TEXT ILIKE ")
        .push_bind(format!("%{}%", &text_search_filter))
        .push(" OR st.span_name::TEXT ILIKE ")
        .push_bind(format!("%{}%", &text_search_filter))
        .push(" OR st.span_attributes::TEXT ILIKE ")
        .push_bind(format!("%{}%", &text_search_filter))
        .push(")");

    query.push(")");

    Ok(())
}

const TRACE_EVENTS_EXPRESSION: &str = "
    trace_events AS (
        SELECT
            traces.id as trace_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', events.id,
                    'typeId', events.template_id,
                    'templateName', event_templates.name,
                    'spanId', events.span_id
                )
            ) as events
        FROM events
        JOIN event_templates ON events.template_id = event_templates.id
        JOIN spans ON spans.span_id = events.span_id
        JOIN traces ON traces.id = spans.trace_id
        WHERE traces.start_time IS NOT NULL AND traces.end_time IS NOT NULL
        GROUP BY traces.id
    )";

fn add_filters_to_traces_query(query: &mut QueryBuilder<Postgres>, filters: &Option<Vec<Filter>>) {
    if let Some(filters) = filters {
        filters.iter().for_each(|filter| {
            let filter_value_str = match &filter.filter_value {
                Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            if !filter.validate_column() {
                log::warn!("Invalid column name: {}", filter.filter_column);
                return;
            }
            query.push(" AND ");
            if let Some(jsonb_prefix) = &filter.jsonb_column {
                if &filter.filter_column == "event" && jsonb_prefix == "events" {
                    // temporary hack to allow for includes queries.
                    // Front-end hackily sends the array of `{"typeName": "my_event_name"}` objects
                    // as a stringified JSON array, which we parse here.
                    query.push("trace_events.events @> ").push_bind(
                        serde_json::from_str::<Value>(filter_value_str.as_str()).unwrap(),
                    );
                    return;
                }
                let mut arg = HashMap::new();
                arg.insert(&filter.filter_column, &filter.filter_value);
                let arg = serde_json::to_value(arg).unwrap();
                query.push(jsonb_prefix).push(" @> ").push_bind(arg);
                return;
            }
            query.push(&filter.filter_column);
            query.push(filter.filter_operator.to_sql_operator());
            if ["id"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(Uuid::parse_str(&filter_value_str).unwrap_or_default());
            } else if ["latency", "cost", "total_token_count"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(filter_value_str.parse::<f64>().unwrap_or_default());
            } else {
                query.push_bind(filter_value_str);
            }

            if filter.filter_value_type.is_some() && filter.validate_cast_type() {
                query
                    .push("::")
                    .push(&filter.filter_value_type.clone().unwrap());
            }
        });
    }
}

/// Queries traces for a project which match the given filters, with given limit and offset
pub async fn get_traces(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
    text_search_filter: Option<String>,
) -> Result<Vec<TraceWithEvents>> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    if let Some(text_search_filter) = text_search_filter {
        add_traces_info_filtered_by_text(&mut query, date_range, text_search_filter, project_id)?;
    } else {
        add_traces_info_expression(&mut query, date_range)?;
    };
    query.push(", ");
    query.push(TRACE_EVENTS_EXPRESSION);

    // Filtering by project id may be redundant in case of text search filter, but ok for now for simplicity
    query.push(
        "
        SELECT
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success,
            COALESCE(trace_events.events, '[]'::jsonb) AS events
        FROM traces_info
        LEFT JOIN trace_events ON trace_events.trace_id = traces_info.id
        WHERE project_id = ",
    );
    query.push_bind(project_id);

    add_filters_to_traces_query(&mut query, &filters);

    query
        .push(" ORDER BY start_time DESC OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let traces = query
        .build_query_as::<'_, TraceWithEvents>()
        .fetch_all(pool)
        .await?;

    Ok(traces)
}

/// Returns the total count of traces for a project which match the given filters
pub async fn count_traces(
    pool: &PgPool,
    project_id: Uuid,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
    text_search_filter: Option<String>,
) -> Result<i64> {
    let mut base_query = QueryBuilder::<Postgres>::new("WITH ");
    if let Some(text_search_filter) = text_search_filter {
        add_traces_info_filtered_by_text(
            &mut base_query,
            date_range,
            text_search_filter,
            project_id,
        )?;
    } else {
        add_traces_info_expression(&mut base_query, date_range)?;
    };
    base_query.push(", ");
    base_query.push(TRACE_EVENTS_EXPRESSION);
    base_query.push(
        "
        SELECT
            COUNT(DISTINCT(id)) as total_count
        FROM traces_info
        LEFT JOIN trace_events ON trace_events.trace_id = traces_info.id
        WHERE project_id = ",
    );
    base_query.push_bind(project_id);

    add_filters_to_traces_query(&mut base_query, &filters);

    let count = base_query
        .build_query_as::<'_, TotalCount>()
        .fetch_one(pool)
        .await?
        .total_count;

    Ok(count)
}

/// `count_traces` with filters adds a lot of information to the query and joins on the events (in order to filter)
/// This function is a simpler version of `count_traces` that only counts the traces without any additional information
/// and is more efficient.
pub async fn count_all_traces_in_project(pool: &PgPool, project_id: Uuid) -> Result<i64> {
    let count = sqlx::query_as::<_, TotalCount>(
        "SELECT COUNT(*) as total_count
        FROM traces
        WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(count.total_count)
}

pub async fn get_single_trace(pool: &PgPool, id: Uuid) -> Result<Trace> {
    let trace = sqlx::query_as::<_, Trace>(
        "SELECT
            id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id,
            total_token_count,
            cost,
            success
        FROM traces
        WHERE id = $1
        AND start_time IS NOT NULL AND end_time IS NOT NULL",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(trace)
}

pub async fn get_span_previews(pool: &PgPool, trace_id: Uuid) -> Result<Vec<Span>> {
    let spans = sqlx::query_as::<_, Span>(
        "WITH span_events AS (
            SELECT
                events.span_id,
                jsonb_agg(
                    jsonb_build_object(
                        'id', events.id,
                        'spanId', events.span_id,
                        'timestamp', events.timestamp,
                        'templateId', events.template_id,
                        'templateName', event_templates.name,
                        'templateEventType', event_templates.event_type,
                        'source', events.source
                    )
                ) AS events
            FROM events
            JOIN event_templates ON events.template_id = event_templates.id
            GROUP BY events.span_id
        )
        SELECT
            spans.span_id,
            spans.start_time,
            spans.end_time,
            spans.version,
            spans.trace_id,
            '{}'::jsonb as input,
            '{}'::jsonb as output,
            spans.parent_span_id,
            spans.name,
            '{}'::jsonb as attributes,
            spans.span_type,
            COALESCE(span_events.events, '[]'::jsonb) AS events
        FROM spans
        LEFT JOIN span_events ON spans.span_id = span_events.span_id
        WHERE trace_id = $1
        ORDER BY start_time ASC",
    )
    .bind(trace_id)
    .fetch_all(pool)
    .await?;

    Ok(spans)
}

pub async fn get_span(pool: &PgPool, id: Uuid) -> Result<Span> {
    let span = sqlx::query_as::<_, Span>(
        "SELECT
            span_id,
            start_time,
            end_time,
            version,
            trace_id,
            parent_span_id,
            name,
            attributes,
            input,
            output,
            span_type,
            '{}'::jsonb as events
        FROM spans
        WHERE span_id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(span)
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub total_token_count: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration: f64,
    pub cost: f64,
    pub trace_count: i64,
}

pub async fn get_sessions(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
) -> Result<Vec<Session>> {
    let mut query = sqlx::QueryBuilder::new(
        "SELECT
            session_id as id,
            count(id)::int8 as trace_count,
            sum(total_token_count)::int8 as total_token_count,
            min(start_time) as start_time,
            max(end_time) as end_time,
            sum(extract(epoch from (end_time - start_time)))::float8 as duration,
            sum(cost)::float8 as cost
            FROM traces
            WHERE session_id is not null and project_id = ",
    );
    query.push_bind(project_id);

    add_date_range_to_query(&mut query, date_range, "start_time", Some("end_time"))?;

    add_filters_to_traces_query(&mut query, filters);

    query
        .push(" GROUP BY session_id ORDER BY start_time DESC")
        .push(" OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let sessions = query.build_query_as::<Session>().fetch_all(pool).await?;

    Ok(sessions)
}

pub async fn count_sessions(
    pool: &PgPool,
    project_id: Uuid,
    filters: &Option<Vec<Filter>>,
    date_range: &Option<DateRange>,
) -> Result<i64> {
    let mut query = sqlx::QueryBuilder::new(
        "SELECT
            count(DISTINCT session_id) as total_count
            FROM traces
            WHERE session_id is not null and project_id = ",
    );

    query.push_bind(project_id);

    add_date_range_to_query(&mut query, date_range, "start_time", Some("end_time"))?;

    add_filters_to_traces_query(&mut query, filters);

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_optional(pool)
        .await?;

    Ok(count.map(|tc| tc.total_count).unwrap_or_default())
}

pub async fn count_all_sessions_in_project(pool: &PgPool, project_id: Uuid) -> Result<i64> {
    let count = sqlx::query_as::<_, TotalCount>(
        "SELECT
            count(DISTINCT session_id) as total_count
            FROM traces
            WHERE session_id is not null AND project_id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(count.total_count)
}

fn should_keep_attribute(attribute: &str) -> bool {
    // do not duplicate function input/output as they are stored in DEFAULT span's input/output
    if attribute == INPUT_ATTRIBUTE_NAME || attribute == OUTPUT_ATTRIBUTE_NAME {
        return false;
    }

    // remove gen_ai.prompt/completion attributes as they are stored in LLM span's input/output
    let pattern = Regex::new(r"gen_ai\.(prompt|completion)\.\d+\.(content|role)").unwrap();
    return !pattern.is_match(attribute);
}
