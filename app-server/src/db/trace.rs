use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{postgres::PgHasArrayType, FromRow, PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    db::modifiers::DateRange,
    pipeline::{nodes::Message, trace::MetaLog},
    traces::attributes::{
        GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_TOKENS, GEN_AI_RESPONSE_MODEL, GEN_AI_TOTAL_TOKENS,
        GEN_AI_USAGE_COST,
    },
};

use super::{events::EventObservation, modifiers::Filter};

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

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug)]
#[sqlx(type_name = "span_type")]
pub enum SpanType {
    DEFAULT,
    LLM,
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

#[derive(Deserialize, Serialize, sqlx::FromRow, Clone)]
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
    session_id: String,
    metadata: Option<Value>,
    #[serde(default)]
    total_token_count: i64,
    #[serde(default)]
    cost: f64,
    #[serde(default = "default_true")]
    success: bool,
    #[serde(skip_deserializing)]
    project_id: Uuid,
}

impl Trace {
    pub fn from_run_trace(run_trace: &crate::pipeline::trace::RunTrace, project_id: Uuid) -> Self {
        Self {
            id: run_trace.run_id,
            start_time: Some(run_trace.run_stats.start_time),
            end_time: Some(run_trace.run_stats.end_time),
            version: String::from(DEFAULT_VERSION),
            release: None,
            user_id: None,
            session_id: Uuid::new_v4().to_string(),
            metadata: serde_json::to_value(run_trace.metadata.clone()).ok(),
            total_token_count: run_trace.run_stats.total_token_count,
            cost: run_trace.run_stats.approximate_cost.unwrap_or_default(),
            success: run_trace.success,
            project_id,
        }
    }
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
    session_id: String,
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
    total_token_count: i64,
    cost: f64,
    success: bool,
}

impl TraceAttributes {
    pub fn new(trace_id: Uuid) -> Self {
        Self {
            id: trace_id,
            success: true,
            ..Default::default()
        }
    }

    pub fn add_tokens(&mut self, tokens: i64) {
        self.total_token_count += tokens;
    }

    pub fn add_cost(&mut self, cost: f64) {
        self.cost += cost;
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

    pub fn from_run_trace(id: Uuid, run_trace: &crate::pipeline::trace::RunTrace) -> Self {
        Self {
            id,
            start_time: Some(run_trace.run_stats.start_time),
            end_time: Some(run_trace.run_stats.end_time),
            total_token_count: run_trace.run_stats.total_token_count,
            cost: run_trace.run_stats.approximate_cost.unwrap_or_default(),
            success: run_trace.success,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub id: Uuid,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    // Laminar span format's version
    pub version: String,
    pub trace_id: Uuid,
    pub parent_span_id: Option<Uuid>,
    pub name: String,
    pub attributes: Value,
    pub metadata: Value,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub span_type: SpanType,
}

impl Span {
    pub fn create_parent_span_in_run_trace(
        trace_id: Uuid,
        run_trace: &crate::pipeline::trace::RunTrace,
        name: &String,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            start_time: run_trace.run_stats.start_time,
            end_time: run_trace.run_stats.end_time,
            version: String::from(DEFAULT_VERSION),
            trace_id,
            parent_span_id: run_trace.parent_span_id,
            name: name.clone(),
            attributes: serde_json::json!({}),
            metadata: serde_json::json!({}),
            input: None,
            output: None,
            span_type: SpanType::DEFAULT,
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
                    id: *msg_id,
                    start_time: message.start_time,
                    end_time: message.end_time,
                    version: String::from(DEFAULT_VERSION),
                    trace_id,
                    parent_span_id: Some(parent_span_id),
                    name: message.node_name.clone(),
                    attributes: span_attributes_from_meta_log(message.meta_log.clone()),
                    metadata: span_metadata_from_meta_log(message.meta_log.clone()),
                    input: Some(serde_json::to_value(input_values).unwrap()),
                    output: Some(message.value.clone().into()),
                    span_type: match message.node_type.as_str() {
                        "LLM" => SpanType::LLM,
                        _ => SpanType::DEFAULT,
                    },
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
            GEN_AI_TOTAL_TOKENS: llm_log.total_token_count,
            GEN_AI_INPUT_TOKENS: llm_log.input_token_count,
            GEN_AI_OUTPUT_TOKENS: llm_log.output_token_count,
            GEN_AI_USAGE_COST: llm_log.approximate_cost,
            GEN_AI_RESPONSE_MODEL: llm_log.model,
        }),
        _ => serde_json::json!({}),
    }
}

fn span_metadata_from_meta_log(meta_log: Option<MetaLog>) -> Value {
    match meta_log {
        Some(MetaLog::LLM(llm_log)) => serde_json::json!({
            "prompt": llm_log.prompt,
        }),
        _ => serde_json::json!({}),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateEventRequest {
    pub name: String,
    pub data: String,
    #[serde(default)]
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanWithChecksAndEvents {
    #[serde(flatten)]
    pub span: Span,
    // List of unique string names, where each name is a unique tag type's name
    pub evaluate_events: Vec<EvaluateEventRequest>,
    #[serde(default, skip_serializing)]
    pub events: Vec<EventObservation>,
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
    // Using Option<Value> instead of Vec<Value> because of Coalesce
    events: Option<Value>,
}

#[derive(FromRow, Debug)]
struct TotalCount {
    total_count: i64,
}

pub async fn write_messages(pool: &PgPool, run_id: &Uuid, messages: &Vec<Message>) -> Result<()> {
    let mut ids = Vec::new();
    let mut values = Vec::new();
    let mut input_message_ids = Vec::new();
    let mut start_times = Vec::new();
    let mut end_times = Vec::new();
    let mut node_ids = Vec::new();
    let mut node_names = Vec::new();
    let mut node_types = Vec::new();
    let mut meta_logs = Vec::new();

    for message in messages {
        ids.push(message.id);
        values.push(serde_json::to_value(message.value.clone()).unwrap());
        input_message_ids.push(serde_json::to_value(message.input_message_ids.clone()).unwrap());
        start_times.push(message.start_time);
        end_times.push(message.end_time);
        node_ids.push(message.node_id);
        node_names.push(message.node_name.clone());
        node_types.push(message.node_type.clone());
        meta_logs.push(serde_json::to_value(message.meta_log.clone()).unwrap());
    }

    sqlx::query!(
        "INSERT INTO messages
            (id,
            run_id,
            node_id,
            node_name,
            node_type,
            input_message_ids,
            start_time,
            end_time,
            value,
            meta_log)
        SELECT
            unnest($1::uuid[]),
            $2,
            unnest($3::uuid[]),
            unnest($4::text[]),
            unnest($5::text[]),
            unnest($6::jsonb[]),
            unnest($7::timestamptz[]),
            unnest($8::timestamptz[]),
            unnest($9::jsonb[]),
            unnest($10::jsonb[])",
        &ids,
        run_id,
        &node_ids,
        &node_names,
        &node_types,
        &input_message_ids,
        &start_times,
        &end_times,
        &values,
        &meta_logs,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn write_trace(
    pool: &PgPool,
    run_id: &Uuid,
    pipeline_version_id: &Uuid,
    run_type: &str,
    success: bool,
    output_message_ids: &Value,
    start_time: &DateTime<Utc>,
    end_time: &DateTime<Utc>,
    total_token_count: i64,
    approximate_cost: Option<f64>,
    metadata: &Value,
) -> Result<DBRunTrace> {
    let result = sqlx::query_as!(
        DBRunTrace,
        "INSERT INTO traces
            (run_id,
            pipeline_version_id,
            run_type,
            success,
            output_message_ids,
            start_time,
            end_time,
            total_token_count,
            approximate_cost,
            metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING
            run_id,
            created_at,
            pipeline_version_id,
            run_type,
            success,
            output_message_ids,
            start_time,
            end_time,
            total_token_count,
            approximate_cost,
            metadata
        ",
        run_id,
        pipeline_version_id,
        run_type,
        success,
        output_message_ids,
        start_time,
        end_time,
        total_token_count,
        approximate_cost,
        metadata,
    )
    .fetch_optional(pool)
    .await?;

    result.ok_or(anyhow::anyhow!("error writing trace"))
}

#[derive(Serialize, FromRow)]
pub struct EndpointTraceAnalyticDatapoint {
    pub time: DateTime<Utc>,
    pub avg_token_count: Option<f64>,
    pub total_approximate_cost: Option<f64>,
    pub avg_latency: Option<f64>,
    pub run_count: Option<f64>,
}

pub async fn get_trace_analytics(
    pool: &PgPool,
    date_range: &DateRange,
    group_by_interval: &str,
    endpoint_id: &Option<Uuid>,
    project_id: &Option<Uuid>,
) -> Result<Vec<EndpointTraceAnalyticDatapoint>> {
    let mut query = match date_range {
        DateRange::Relative(interval) => QueryBuilder::<Postgres>::new(format!(
            "WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
                    NOW() - interval '{} hours',
                    NOW(),
                    '1 {}')
                AS time_interval
                )",
            interval.past_hours, group_by_interval
        )),
        DateRange::Absolute(interval) => {
            let mut query = QueryBuilder::<Postgres>::new(
                "
            WITH time_series AS (
                SELECT 
                    time_interval
                FROM 
                generate_series(
             ",
            );
            query
                .push_bind(interval.start_date)
                .push(", ")
                .push_bind(interval.end_date)
                .push(format!(", '1 {group_by_interval}') AS time_interval)"));
            query
        }
    };
    query.push(
        ", data(run_id, created_at, total_token_count, approximate_cost, start_time, end_time, pipeline_version_id) AS (
        SELECT run_id, traces.created_at, total_token_count, approximate_cost, start_time, end_time, pipeline_version_id
        FROM traces
        LEFT JOIN pipeline_versions pv ON pv.id = traces.pipeline_version_id "
    );
    if let Some(endpoint_id) = endpoint_id {
        query.push(
            " WHERE run_type = 'ENDPOINT'
                AND pipeline_version_id in (
                    SELECT pipeline_version_id
                    FROM endpoint_pipeline_versions
                    WHERE endpoint_id = ",
        );
        query.push_bind(endpoint_id.clone()).push(")");
    } else if let Some(project_id) = project_id {
        query.push(
            " WHERE pipeline_version_id in (
                    SELECT id
                    FROM pipeline_versions
                    WHERE pipeline_id in (
                        SELECT id
                        FROM pipelines
                        WHERE project_id = ",
        );
        query.push_bind(project_id.clone()).push("))");
    }
    query.push(format!(") 
        SELECT
            COALESCE(AVG(total_token_count), 0)::float8 as avg_token_count,
            COALESCE(SUM(approximate_cost), 0)::float8 as total_approximate_cost,
            COALESCE(
                AVG(
                    (extract(epoch from end_time) - extract(epoch from start_time))
                ),
                0
            )::float8 as avg_latency, -- seconds
            COUNT(distinct(run_id))::float8 as run_count,
            date_trunc('{group_by_interval}', time_series.time_interval) as time
        FROM time_series
        LEFT JOIN data on date_trunc('{group_by_interval}', data.created_at) = date_trunc('{group_by_interval}', time_series.time_interval)
        GROUP BY time order by time ASC"
    ));

    let res = query
        .build_query_as::<'_, EndpointTraceAnalyticDatapoint>()
        .fetch_all(pool)
        .await?;

    Ok(res)
}

#[derive(FromRow, Debug)]
struct RunOutputs {
    run_id: Uuid,
    outputs: Value, // Vec of all messages
    tags: Value,    // HashMap<String, Value> from tag type name to tag value
}

/// returns map from run_id to map from node_name to output value + from tag_name to tag_value
pub async fn get_all_node_outputs(
    pool: &PgPool,
    run_ids: &Vec<Uuid>,
    node_ids: &Option<Vec<Uuid>>,
) -> Result<HashMap<Uuid, HashMap<String, Value>>> {
    let mut query = QueryBuilder::<Postgres>::new(
        "
        WITH grouped_tags AS (
            SELECT
                trace_tags.run_id,
                JSONB_OBJECT_AGG(tag_types.name, trace_tags.value) as tags
            FROM trace_tags
            JOIN tag_types ON trace_tags.type_id = tag_types.id
            GROUP BY trace_tags.run_id
            
        ),
        grouped_messages AS (
            SELECT
                messages.run_id,
                jsonb_agg(messages.* order by messages.start_time ASC) as outputs
            FROM messages
            WHERE 1=1 ",
    );
    if let Some(node_ids) = node_ids {
        query
            .push(" AND messages.node_id = ANY(")
            .push_bind(node_ids.clone())
            .push(")");
    }
    query.push(
        "
            GROUP BY messages.run_id
        )
        SELECT
            grouped_messages.run_id,
            grouped_messages.outputs,
            COALESCE(grouped_tags.tags, '{}'::jsonb) as tags
        FROM grouped_messages
        LEFT JOIN grouped_tags ON grouped_messages.run_id = grouped_tags.run_id
        WHERE grouped_messages.run_id = ANY(",
    );
    query.push_bind(run_ids.clone()).push(")");

    let traces = query
        .build_query_as::<'_, RunOutputs>()
        .fetch_all(pool)
        .await?;

    let res = traces
        .iter()
        .map(|messages| {
            let run_id = messages.run_id;
            let ordered_messages =
                serde_json::from_value::<Vec<DBMessage>>(messages.outputs.clone()).unwrap();
            let mut outputs = HashMap::new();
            ordered_messages.into_iter().for_each(|message| {
                let mut key = message.node_name.clone();
                let mut index = 1;
                while outputs.contains_key(&key) {
                    key = format!("{key}_{index}");
                    index += 1;
                }
                outputs.insert(key, message.value);
            });
            let tags = serde_json::from_value::<HashMap<String, Value>>(messages.tags.clone())
                .unwrap_or_default();
            tags.into_iter().for_each(|(tag_name, tag_value)| {
                let mut key = tag_name.clone();
                let mut index = 1;
                while outputs.contains_key(&key) {
                    key = format!("{}_{index}", tag_name.clone());
                    index += 1;
                }
                outputs.insert(key, tag_value);
            });

            (run_id, outputs)
        })
        .collect();

    Ok(res)
}

pub async fn create_trace_if_none(pool: &PgPool, project_id: Uuid, id: Uuid) -> Result<()> {
    sqlx::query!(
        "INSERT INTO new_traces
            (id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO NOTHING",
        id,
        Utc::now(),
        &None as &Option<DateTime<Utc>>,
        DEFAULT_VERSION,
        &None as &Option<String>,
        &None as &Option<String>,
        Uuid::new_v4().to_string(),
        &None as &Option<Value>,
        project_id,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn record_trace(pool: &PgPool, project_id: Uuid, trace: Trace) -> Result<()> {
    // EXCLUDED is a special table name in postgres ON CONFLICT DO UPDATE
    // to capture the value of the conflicting row
    sqlx::query!(
        "INSERT INTO new_traces
            (id,
            start_time,
            end_time,
            version,
            release,
            user_id,
            session_id,
            metadata,
            project_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO
            UPDATE SET
            version = EXCLUDED.version,
            release = EXCLUDED.release,
            user_id = EXCLUDED.user_id,
            session_id = EXCLUDED.session_id,
            metadata = EXCLUDED.metadata",
        &trace.id,
        &trace.start_time as &Option<DateTime<Utc>>,
        &trace.end_time as &Option<DateTime<Utc>>,
        &trace.version,
        &trace.release as &Option<String>,
        &trace.user_id as &Option<String>,
        &trace.session_id,
        &trace.metadata as &Option<Value>,
        project_id,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_trace_attributes(pool: &PgPool, attributes: &TraceAttributes) -> Result<()> {
    sqlx::query!(
        "UPDATE new_traces
        SET 
            total_token_count = total_token_count + $2,
            cost = cost + $3,
            success = $4,
            start_time = CASE WHEN start_time IS NULL OR start_time > $5 THEN $5 ELSE start_time END,
            end_time = CASE WHEN end_time IS NULL OR end_time < $6 THEN $6 ELSE end_time END
        WHERE id = $1",
        attributes.id,
        attributes.total_token_count,
        attributes.cost,
        attributes.success,
        attributes.start_time,
        attributes.end_time,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn record_spans(pool: &PgPool, spans: Vec<Span>) -> Result<()> {
    let mut ids = Vec::new();
    let mut start_times = Vec::new();
    let mut end_times = Vec::new();
    let mut versions = Vec::new();
    let mut trace_ids = Vec::new();
    let mut parent_span_ids = Vec::new();
    let mut names = Vec::new();
    let mut attributes_list = Vec::new();
    let mut metadatas = Vec::new();
    let mut inputs = Vec::new();
    let mut outputs = Vec::new();
    let mut span_types = Vec::new();

    for span in spans {
        ids.push(span.id);
        start_times.push(span.start_time);
        end_times.push(span.end_time);
        versions.push(span.version);
        trace_ids.push(span.trace_id);
        parent_span_ids.push(span.parent_span_id);
        names.push(span.name);
        attributes_list.push(span.attributes);
        metadatas.push(span.metadata);
        inputs.push(span.input);
        outputs.push(span.output);
        span_types.push(span.span_type);
    }

    sqlx::query!(
        "INSERT INTO spans
            (id,
            start_time,
            end_time,
            version,
            trace_id,
            parent_span_id,
            name,
            attributes,
            metadata,
            input,
            output,
            span_type)
        SELECT
            unnest($1::uuid[]),
            unnest($2::timestamptz[]),
            unnest($3::timestamptz[]),
            unnest($4::text[]),
            unnest($5::uuid[]),
            unnest($6::uuid[]),
            unnest($7::text[]),
            unnest($8::jsonb[]),
            unnest($9::jsonb[]),
            unnest($10::jsonb[]),
            unnest($11::jsonb[]),
            unnest($12::span_type[])
        ",
        &ids,
        &start_times,
        &end_times,
        &versions,
        &trace_ids,
        &parent_span_ids.as_slice() as &[Option<Uuid>],
        &names,
        &attributes_list,
        &metadatas,
        &inputs.as_slice() as &[Option<Value>],
        &outputs.as_slice() as &[Option<Value>],
        &span_types.as_slice() as &[SpanType],
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub fn add_traces_info_expression<'a>(
    query: &'a mut QueryBuilder<'a, Postgres>,
    date_range: Option<&DateRange>,
) -> &'a mut QueryBuilder<'a, Postgres> {
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
        FROM new_traces t
        WHERE start_time IS NOT NULL AND end_time IS NOT NULL ",
    );

    if let Some(date_range) = date_range {
        match date_range {
            DateRange::Relative(interval) => {
                // If start_time is >= NOW() - interval 'x hours', then end_time is also >= NOW() - interval 'x hours'
                query.push(format!(
                    " AND t.start_time >= NOW() - interval '{} hours'",
                    interval.past_hours
                ));
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

    query
}

const TRACE_EVENTS_EXPRESSION: &str = "
    trace_events AS (
        SELECT
            new_traces.id as trace_id,
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
        JOIN spans ON spans.id = events.span_id
        JOIN new_traces ON new_traces.id = spans.trace_id
        WHERE new_traces.start_time IS NOT NULL AND new_traces.end_time IS NOT NULL
        GROUP BY new_traces.id
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
    let mut query = add_traces_info_expression(&mut query, date_range);
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
    let mut base_query = add_traces_info_expression(&mut base_query, date_range);
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

pub async fn get_single_trace(pool: &PgPool, id: Uuid) -> Result<Trace> {
    let trace = sqlx::query_as!(
        Trace,
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
        FROM new_traces
        WHERE id = $1
        AND start_time IS NOT NULL AND end_time IS NOT NULL",
        id,
    )
    .fetch_one(pool)
    .await?;

    Ok(trace)
}

pub async fn get_span_previews(pool: &PgPool, trace_id: Uuid) -> Result<Vec<SpanPreview>> {
    let spans = sqlx::query_as!(
        SpanPreview,
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
                        'source', events.source
                    )
                ) AS events
            FROM events
            JOIN event_templates ON events.template_id = event_templates.id
            GROUP BY events.span_id
        )
        SELECT
            spans.id,
            spans.start_time,
            spans.end_time,
            spans.version,
            spans.trace_id,
            spans.parent_span_id,
            spans.name,
            spans.attributes,
            spans.metadata,
            spans.span_type AS "span_type!: SpanType",
            COALESCE(span_events.events, '[]'::jsonb) AS events
        FROM spans
        LEFT JOIN span_events ON spans.id = span_events.span_id
        WHERE trace_id = $1
        ORDER BY start_time ASC"#,
        trace_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(spans)
}

pub async fn get_single_span(pool: &PgPool, id: Uuid) -> Result<Span> {
    let span = sqlx::query_as!(
        Span,
        r#"SELECT
            id,
            start_time,
            end_time,
            version,
            trace_id,
            parent_span_id,
            name,
            attributes,
            metadata,
            input,
            output,
            span_type as "span_type!: SpanType"
        FROM spans
        WHERE id = $1"#,
        id,
    )
    .fetch_one(pool)
    .await?;

    Ok(span)
}
