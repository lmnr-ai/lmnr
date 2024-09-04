use std::{collections::HashMap, str::FromStr};

use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{postgres::PgHasArrayType, FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    db::modifiers::DateRange,
    language_model::{ChatMessage, ChatMessageContent},
    opentelemetry::opentelemetry_proto_trace_v1::Span as OtelSpan,
    pipeline::{nodes::Message, trace::MetaLog},
    traces::attributes::{
        GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_TOKENS, GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL,
        GEN_AI_SYSTEM,
    },
};

use super::{
    modifiers::Filter,
    utils::{convert_any_value_to_json_value, span_id_to_uuid},
};

const DEFAULT_VERSION: &str = "0.1.0";

// TODO: add_X_to_query functions don't need to return the query builder
// they can just modify the query builder in place, and return nothing.
// They won't need to be annotated with lifetime in that case

#[derive(Clone, Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DBRunTrace {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub pipeline_version_id: Uuid,
    pub run_type: Option<String>,
    pub success: bool,
    pub output_message_ids: Value,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
    pub metadata: Value,
}

#[derive(Clone, Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EndpointRunTraceInfo {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub pipeline_version_id: Uuid,
    pub pipeline_version_name: String,
    pub pipeline_id: Uuid,
    pub pipeline_name: String,
    pub run_type: Option<String>,
    pub success: bool,
    pub output_message_ids: Value,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
    pub metadata: Value,
}

#[derive(FromRow)]
pub struct DBRunTraceWithMessagePreviews {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub pipeline_version_id: Uuid,
    pub run_type: Option<String>,
    pub success: bool,
    pub output_message_ids: Value,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
    pub metadata: Value,
    pub message_previews: Value, // HashMap<Uuid, DBMessagePreview>
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTraceWithMessagePreviews {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub pipeline_version_id: Uuid,
    pub run_type: Option<String>,
    pub success: bool,
    pub output_message_ids: Value,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
    pub metadata: Value,
    pub message_previews: HashMap<Uuid, DBMessagePreview>,
}

impl TryFrom<DBRunTraceWithMessagePreviews> for RunTraceWithMessagePreviews {
    type Error = anyhow::Error;

    fn try_from(trace: DBRunTraceWithMessagePreviews) -> Result<Self, Self::Error> {
        let message_previews: HashMap<Uuid, DBMessagePreview> =
            if matches!(trace.message_previews, Value::Null) {
                log::error!(
                    "Unexpected null message_previews for trace: {:?}",
                    trace.run_id
                );
                HashMap::new()
            } else {
                serde_json::from_value(trace.message_previews)?
            };

        Ok(RunTraceWithMessagePreviews {
            run_id: trace.run_id,
            created_at: trace.created_at,
            pipeline_version_id: trace.pipeline_version_id,
            run_type: trace.run_type,
            success: trace.success,
            output_message_ids: trace.output_message_ids,
            start_time: trace.start_time,
            end_time: trace.end_time,
            total_token_count: trace.total_token_count,
            approximate_cost: trace.approximate_cost,
            metadata: trace.metadata,
            message_previews,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, FromRow)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DBMessagePreview {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub run_id: Uuid,
    pub node_id: Uuid,
    pub node_name: String,
    pub node_type: String,
    pub input_message_ids: Value, // Vec<Uuid>
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, FromRow, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct DBMessage {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub run_id: Uuid,
    pub node_id: Uuid,
    pub node_name: String,
    pub node_type: String,
    pub input_message_ids: Value, // Vec<Uuid>
    pub inputs: Option<Vec<Value>>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub value: Value,
    pub meta_log: Value,
}

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "span_type")]
pub enum SpanType {
    #[default]
    DEFAULT,
    LLM,
}

/// for inserting into clickhouse
///
/// Don't change the order of the fields or their values
impl Into<u8> for SpanType {
    fn into(self) -> u8 {
        match self {
            SpanType::DEFAULT => 0,
            SpanType::LLM => 1,
        }
    }
}

impl PgHasArrayType for SpanType {
    fn array_type_info() -> sqlx::postgres::PgTypeInfo {
        // Specify the PostgreSQL array type name for your custom enum type
        sqlx::postgres::PgTypeInfo::with_name("_span_type")
    }
}

fn default_true() -> bool {
    true
}

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

// impl Trace {
//     pub fn from_run_trace(run_trace: &crate::pipeline::trace::RunTrace, project_id: Uuid) -> Self {
//         Self {
//             id: run_trace.run_id,
//             start_time: Some(run_trace.run_stats.start_time),
//             end_time: Some(run_trace.run_stats.end_time),
//             version: String::from(DEFAULT_VERSION),
//             release: None,
//             user_id: None,
//             session_id: Some(Uuid::new_v4().to_string()),
//             metadata: serde_json::to_value(run_trace.metadata.clone()).ok(),
//             total_token_count: run_trace.run_stats.total_token_count,
//             cost: run_trace.run_stats.approximate_cost.unwrap_or_default(),
//             success: run_trace.success,
//             project_id,
//         }
//     }
// }

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

    // pub fn from_run_trace(id: Uuid, run_trace: &crate::pipeline::trace::RunTrace) -> Self {
    //     Self {
    //         id,
    //         start_time: Some(run_trace.run_stats.start_time),
    //         end_time: Some(run_trace.run_stats.end_time),
    //         total_token_count: Some(run_trace.run_stats.total_token_count),
    //         cost: Some(run_trace.run_stats.approximate_cost.unwrap_or_default()),
    //         success: Some(run_trace.success),
    //         session_id: None,
    //         user_id: None,
    //     }
    // }

    pub fn update_session_id(&mut self, session_id: Option<String>) {
        self.session_id = session_id;
    }

    pub fn update_user_id(&mut self, user_id: Option<String>) {
        self.user_id = user_id;
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
            .get("traceloop.association.properties.session_id")
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        match self
            .attributes
            .get("traceloop.association.properties.user_id")
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
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
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }
}

impl Span {
    pub fn get_attributes(&self) -> SpanAttributes {
        let attributes =
            serde_json::from_value::<HashMap<String, Value>>(self.attributes.clone()).unwrap();

        SpanAttributes::new(attributes)
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
            span_id: span_id,
            trace_id: trace_id,
            parent_span_id: parent_span_id,
            name: otel_span.name,
            attributes: json!(attributes.clone()),
            start_time: Utc.timestamp_nanos(otel_span.start_time_unix_nano as i64),
            end_time: Utc.timestamp_nanos(otel_span.end_time_unix_nano as i64),
            ..Default::default()
        };

        // quick hack until we start sending our own attributes
        if attributes.contains_key("gen_ai.system") {
            span.span_type = SpanType::LLM;

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

                let role = attributes
                    .get(format!("gen_ai.prompt.{}.role", i).as_str())
                    .unwrap()
                    .to_string();

                input_messages.push(ChatMessage {
                    role,
                    content: ChatMessageContent::Text(content.to_string()),
                });
                i += 1;
            }

            span.input = Some(json!(input_messages));
            span.output = attributes.get("gen_ai.completion.0.content").cloned();
        } else {
            if let Some(serde_json::Value::String(s)) = attributes.get("traceloop.entity.input") {
                span.input = Some(
                    serde_json::Value::from_str(s).unwrap_or(serde_json::Value::String(s.clone())),
                );
            }

            if let Some(serde_json::Value::String(s)) = attributes.get("traceloop.entity.output") {
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
    ) -> Self {
        Self {
            span_id: Uuid::new_v4(),
            start_time: run_stats.start_time,
            end_time: run_stats.end_time,
            version: String::from(DEFAULT_VERSION),
            trace_id,
            parent_span_id,
            name: name.clone(),
            attributes: serde_json::json!({}),
            input: None,
            output: None,
            span_type: SpanType::DEFAULT,
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
}

fn span_attributes_from_meta_log(meta_log: Option<MetaLog>) -> Value {
    match meta_log {
        Some(MetaLog::LLM(llm_log)) => serde_json::json!({
            GEN_AI_INPUT_TOKENS: llm_log.input_token_count,
            GEN_AI_OUTPUT_TOKENS: llm_log.output_token_count,
            GEN_AI_RESPONSE_MODEL: llm_log.model,
            GEN_AI_SYSTEM: llm_log.provider,
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
            user_id
        )
        VALUES ($1, $2, COALESCE($3, 0::int8), COALESCE($4, 0::float8), COALESCE($5, true), $6, $7, $8, $9, $10)
        ON CONFLICT(id) DO
        UPDATE
        SET 
            total_token_count = traces.total_token_count + COALESCE($3, 0),
            cost = traces.cost + COALESCE($4, 0),
            success = CASE WHEN $5 IS NULL THEN traces.success ELSE $5 END,
            start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $6 THEN $6 ELSE traces.start_time END,
            end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $7 THEN $7 ELSE traces.end_time END,
            session_id = CASE WHEN traces.session_id IS NULL THEN $9 ELSE traces.session_id END,
            user_id = CASE WHEN traces.user_id IS NULL THEN $10 ELSE traces.user_id END
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
    .bind(attributes.session_id.clone())
    .bind(attributes.user_id.clone())
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

pub fn add_traces_info_expression<'a>(
    query: &'a mut QueryBuilder<'a, Postgres>,
    date_range: Option<&DateRange>,
) -> Result<&'a mut QueryBuilder<'a, Postgres>> {
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
        latency
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
            EXTRACT(EPOCH FROM (t.end_time - t.start_time)),
            CASE WHEN t.success = true THEN 'Success' ELSE 'Failed' END as status
        FROM traces t
        WHERE start_time IS NOT NULL AND end_time IS NOT NULL ",
    );

    if let Some(date_range) = date_range {
        match date_range {
            // TODO: Parsing must be done outside of this function to avoid anything string-like into queries
            DateRange::Relative(interval) => {
                let past_hours = if interval.past_hours == "all" {
                    None
                } else {
                    Some(interval.past_hours.parse::<i64>()?)
                };
                if let Some(past_hours) = past_hours {
                    // If start_time is >= NOW() - interval 'x hours', then end_time is also >= NOW() - interval 'x hours'
                    query.push(format!(
                        " AND t.start_time >= NOW() - interval '{} hours'",
                        past_hours
                    ));
                }
            }
            DateRange::Absolute(interval) => {
                query
                    .push(" AND t.start_time >= ")
                    .push_bind(interval.start_date)
                    .push(" AND t.end_time <= ")
                    .push_bind(interval.end_date);
            }
        };
    }

    query.push(")");

    Ok(query)
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

fn add_filters_to_traces_query<'a>(
    query: &'a mut QueryBuilder<'a, Postgres>,
    filters: Option<Vec<Filter>>,
) -> &'a mut QueryBuilder<'a, Postgres> {
    if let Some(filters) = filters {
        filters.iter().for_each(|filter| {
            let filter_value_str = match &filter.filter_value {
                Value::String(s) => s.clone(),
                v => v.to_string(),
            };
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
            } else if ["latency", "approximate_cost", "total_token_count"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(filter_value_str.parse::<f64>().unwrap_or_default());
            } else {
                query.push_bind(filter_value_str);
            }
        });
    }
    query
}

/// Queries traces for a project which match the given filters, with given limit and offset
pub async fn get_traces(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: Option<Vec<Filter>>,
    date_range: Option<&DateRange>,
) -> Result<Vec<TraceWithEvents>> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    let mut query = add_traces_info_expression(&mut query, date_range)?;
    query.push(", ");
    query.push(TRACE_EVENTS_EXPRESSION);
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

    let query = add_filters_to_traces_query(&mut query, filters);

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
    filters: Option<Vec<Filter>>,
    date_range: Option<&DateRange>,
) -> Result<i64> {
    let mut base_query = QueryBuilder::<Postgres>::new("WITH ");
    let mut base_query = add_traces_info_expression(&mut base_query, date_range)?;
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

    let query = add_filters_to_traces_query(&mut base_query, filters);

    let count = query
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
        r#"WITH span_events AS (
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
        ORDER BY start_time ASC"#,
    )
    .bind(trace_id)
    .fetch_all(pool)
    .await?;

    Ok(spans)
}

pub async fn get_span(pool: &PgPool, id: Uuid) -> Result<Span> {
    let span = sqlx::query_as::<_, Span>(
        r#"SELECT
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
        WHERE span_id = $1"#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(span)
}
