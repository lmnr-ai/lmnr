use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    opentelemetry::opentelemetry_proto_trace_v1::span::Event as OtelEvent,
    pipeline::nodes::NodeInput,
};

use super::{
    event_templates::EventType,
    modifiers::{DateRange, Filter},
    utils::convert_any_value_to_json_value,
    DB,
};

#[derive(sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "event_source")]
pub enum EventSource {
    AUTO,
    MANUAL,
    CODE,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventObservation {
    pub span_id: Uuid,
    pub timestamp: DateTime<Utc>,
    /// Unique type name
    pub template_name: String,
    pub value: Option<Value>,
}

impl EventObservation {
    pub fn from_otel(event: OtelEvent, span_id: Uuid) -> Self {
        let attributes = event
            .attributes
            .into_iter()
            .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        let value = attributes.get("lmnr.event.value").cloned();

        Self {
            span_id,
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            template_name: event.name,
            value,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateEventRequest {
    pub name: String,
    pub data: HashMap<String, NodeInput>,
    pub evaluator: String,
    #[serde(default)]
    pub timestamp: DateTime<Utc>,
    pub env: HashMap<String, String>,
}

impl EvaluateEventRequest {
    pub fn try_from_otel(event: OtelEvent) -> Result<Self> {
        let attributes = event
            .attributes
            .into_iter()
            .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        let serde_json::Value::String(evaluator) =
            attributes.get("lmnr.event.evaluator").unwrap().clone()
        else {
            return Err(anyhow::anyhow!("Failed to get evaluator"));
        };

        let serde_json::Value::String(string_data) = attributes.get("lmnr.event.data").unwrap()
        else {
            return Err(anyhow::anyhow!("Failed to get data"));
        };

        let data = serde_json::from_str::<HashMap<String, NodeInput>>(&string_data).unwrap();

        let serde_json::Value::String(env) = attributes.get("lmnr.event.env").unwrap() else {
            return Err(anyhow::anyhow!("Failed to get env"));
        };

        let env = serde_json::from_str::<HashMap<String, String>>(env).unwrap();

        Ok(Self {
            name: event.name,
            data,
            evaluator,
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            env,
        })
    }
}

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub span_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub template_id: Uuid,
    pub source: EventSource,
    pub metadata: Option<Value>,
    pub value: Option<Value>,
}

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWithTemplateName {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub span_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub template_id: Uuid,
    pub template_name: String,
    pub template_event_type: EventType,
    pub source: EventSource,
    pub metadata: Option<Value>,
    pub value: Option<Value>,
    // Usually, inputs are used for evaluated events; none for regular events
    pub inputs: Option<Value>,
}

pub async fn create_event(
    pool: &PgPool,
    span_id: Uuid,
    timestamp: DateTime<Utc>,
    template_id: Uuid,
    source: EventSource,
    value: Value,
    inputs: Option<Value>,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO events (span_id, timestamp, template_id, source, value, inputs)
        VALUES ($1, $2, $3, $4, $5, $6)",
        span_id,
        timestamp,
        template_id,
        source as EventSource,
        value,
        inputs,
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Create events
///
/// For now, record them without metadata
pub async fn create_events(
    pool: &PgPool,
    span_ids: &Vec<Uuid>,
    timestamps: &Vec<DateTime<Utc>>,
    template_ids: &Vec<Uuid>,
    source: EventSource,
    values: &Vec<Option<Value>>,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO events (span_id, timestamp, template_id, source, value)
        SELECT unnest($1::uuid[]), unnest($2::timestamptz[]), unnest($3::uuid[]), $4, unnest($5::jsonb[])",
        span_ids,
        timestamps,
        template_ids,
        source as EventSource,
        values as &[Option<Value>],
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn create_events_by_template_name(
    db: Arc<DB>,
    events: Vec<EventObservation>,
    source: EventSource,
    project_id: Uuid,
) -> Result<()> {
    let mut span_ids = vec![];
    let mut timestamps = vec![];
    let mut template_ids = vec![];
    let mut values = vec![];

    for event in events {
        let template_id = sqlx::query!(
            "SELECT id FROM event_templates WHERE name = $1 AND project_id = $2",
            event.template_name,
            project_id,
        )
        .fetch_one(&db.pool)
        .await?
        .id;

        span_ids.push(event.span_id);
        timestamps.push(event.timestamp);
        template_ids.push(template_id);
        values.push(event.value);
    }

    create_events(
        &db.pool,
        &span_ids,
        &timestamps,
        &template_ids,
        source,
        &values,
    )
    .await?;

    Ok(())
}

pub async fn get_events_for_span(
    pool: &PgPool,
    span_id: Uuid,
) -> Result<Vec<EventWithTemplateName>> {
    let events = sqlx::query_as!(
        EventWithTemplateName,
        r#"SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.template_id,
            event_templates.name as template_name,
            event_templates.event_type as "template_event_type: EventType",
            e.source as "source: EventSource",
            e.metadata,
            e.value,
            e.inputs
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE span_id = $1
        ORDER BY e.timestamp ASC"#,
        span_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(events)
}

pub async fn get_events_by_template_id(
    pool: &PgPool,
    template_id: &Uuid,
    date_range: Option<DateRange>,
) -> Result<Vec<EventWithTemplateName>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.template_id,
            event_templates.name as template_name,
            event_templates.event_type as template_event_type,
            e.source,
            e.metadata,
            e.value,
            e.inputs
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE event_templates.id = "#,
    );
    query.push_bind(template_id);

    if let Some(date_range) = date_range {
        match date_range {
            DateRange::Relative(interval) => {
                // If start_time is >= NOW() - interval 'x hours', then end_time is also >= NOW() - interval 'x hours'
                query.push(format!(
                    " AND e.timestamp >= NOW() - interval '{} hours'",
                    interval.past_hours
                ));
            }
            DateRange::Absolute(interval) => {
                query
                    .push(" AND e.timestamp >= ")
                    .push_bind(interval.start_date)
                    .push(" AND e.timestamp <= ")
                    .push_bind(interval.end_date);
            }
        };
    }
    query.push(" ORDER BY e.timestamp DESC");

    let events = query
        .build_query_as::<'_, EventWithTemplateName>()
        .fetch_all(pool)
        .await?;

    Ok(events)
}

pub async fn get_events_for_session(
    pool: &PgPool,
    session_id: &String,
    project_id: &Uuid,
) -> Result<Vec<EventWithTemplateName>> {
    let events = sqlx::query_as::<_, EventWithTemplateName>(
        "SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.template_id,
            event_templates.name as template_name,
            event_templates.event_type as template_event_type: EventType,
            e.source as source: EventSource,
            e.metadata,
            e.value,
            e.inputs
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE span_id IN (
            SELECT id from spans where trace_id IN (
                SELECT id from traces where session_id = $1
            )
        )
        AND project_id = $2",
    )
    .bind(session_id)
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(events)
}

#[derive(sqlx::FromRow)]
struct TotalCount {
    total_count: i64,
}

pub fn add_events_info_expression<'a>(
    query: &'a mut QueryBuilder<'a, Postgres>,
    date_range: Option<&DateRange>,
) -> &'a mut QueryBuilder<'a, Postgres> {
    query.push(
        "
    events_info(
        id,
        created_at,
        span_id,
        timestamp,
        source,
        metadata,
        template_id,
        value,
        inputs
    ) AS (
        SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.source,
            e.metadata,
            e.template_id,
            e.value,
            e.inputs
        FROM events e",
    );

    if let Some(date_range) = date_range {
        match date_range {
            DateRange::Relative(interval) => {
                query.push(format!(
                    " WHERE e.timestamp >= NOW() - interval '{} hours'",
                    interval.past_hours
                ));
            }
            DateRange::Absolute(interval) => {
                query
                    .push(" WHERE e.timestamp >= ")
                    .push_bind(interval.start_date)
                    .push(" AND e.timestamp <= ")
                    .push_bind(interval.end_date);
            }
        };
    }

    query.push(")");

    query
}

fn add_filters_to_events_query<'a>(
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

            if ["name", "event_type"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push("event_templates.");
            } else {
                query.push("e.");
            };

            query.push(&filter.filter_column);

            if ["event_type"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push("::text");
            }

            query.push(filter.filter_operator.to_sql_operator());
            if ["id", "span_id"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(Uuid::parse_str(&filter_value_str).unwrap_or_default());
            } else if ["timestamp"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                query.push_bind(
                    filter_value_str
                        .parse::<DateTime<Utc>>()
                        .unwrap_or_default(),
                );
            } else {
                query.push_bind(filter_value_str);
            }
        });
    }
    query
}

pub async fn get_events(
    pool: &PgPool,
    project_id: Uuid,
    limit: usize,
    offset: usize,
    filters: Option<Vec<Filter>>,
    date_range: Option<&DateRange>,
) -> Result<Vec<EventWithTemplateName>> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    let mut query = add_events_info_expression(&mut query, date_range);
    query.push(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.source,
            e.metadata,
            e.template_id,
            e.value,
            e.inputs,
            event_templates.name as template_name,
            event_templates.event_type as template_event_type
        FROM events_info e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE event_templates.project_id = "#,
    );

    query.push_bind(project_id);

    let query = add_filters_to_events_query(&mut query, filters);

    query
        .push(" ORDER BY timestamp DESC OFFSET ")
        .push_bind(offset as i64)
        .push(" LIMIT ")
        .push_bind(limit as i64);

    let events = query
        .build_query_as::<'_, EventWithTemplateName>()
        .fetch_all(pool)
        .await?;

    Ok(events)
}

/// Returns the total count of events for a project which match the given filters
pub async fn count_events(
    pool: &PgPool,
    project_id: Uuid,
    filters: Option<Vec<Filter>>,
    date_range: Option<&DateRange>,
) -> Result<i64> {
    let mut query = QueryBuilder::<Postgres>::new("WITH ");
    let mut query = add_events_info_expression(&mut query, date_range);
    query.push(
        "
        SELECT COUNT(DISTINCT(e.id)) as total_count
        FROM events_info e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE event_templates.project_id = ",
    );
    query.push_bind(project_id);

    let query = add_filters_to_events_query(&mut query, filters);

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_one(pool)
        .await?
        .total_count;

    Ok(count)
}

/// `count_events` with filters adds a lot of information to the query and joins on the events (in order to filter)
/// This function is a simpler version of `count_events` that only counts the traces without any additional information
/// and is more efficient.
pub async fn count_all_events_in_project(pool: &PgPool, project_id: Uuid) -> Result<i64> {
    let count = sqlx::query!(
        "SELECT COUNT(DISTINCT(events.id)) as total_count
        FROM events
        JOIN event_templates ON events.template_id = event_templates.id
        WHERE event_templates.project_id = $1",
        project_id,
    )
    .fetch_one(pool)
    .await?
    .total_count;

    Ok(count.unwrap_or_default())
}
