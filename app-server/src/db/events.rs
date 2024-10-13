use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    opentelemetry::opentelemetry_proto_trace_v1::span::Event as OtelEvent,
    traces::span_attributes::EVENT_VALUE,
};

use super::{
    event_templates::EventType,
    modifiers::{DateRange, Filter},
    utils::{add_date_range_to_query, convert_any_value_to_json_value},
    DB,
};

#[derive(sqlx::Type, Deserialize, Serialize, Clone)]
#[sqlx(type_name = "event_source")]
pub enum EventSource {
    AUTO,
    MANUAL,
    CODE,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventObservation {
    pub id: Uuid,
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

        let value = attributes.get(EVENT_VALUE).cloned();

        Self {
            id: Uuid::new_v4(),
            span_id,
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            template_name: event.name,
            value,
        }
    }
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

/// Create events
///
/// For now, record them without metadata
pub async fn create_events(
    pool: &PgPool,
    ids: &Vec<Uuid>,
    span_ids: &Vec<Uuid>,
    timestamps: &Vec<DateTime<Utc>>,
    template_ids: &Vec<Uuid>,
    source: &EventSource,
    values: &Vec<Option<Value>>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO events (id, span_id, timestamp, template_id, source, value)
        SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::timestamptz[]), unnest($4::uuid[]), $5, unnest($6::jsonb[])",
    )
    .bind(ids)
    .bind(span_ids)
    .bind(timestamps)
    .bind(template_ids)
    .bind(source)
    .bind(values)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn create_events_by_template_name(
    db: Arc<DB>,
    events: Vec<EventObservation>,
    template_ids: &Vec<Uuid>,
    source: &EventSource,
) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    if events.len() != template_ids.len() {
        return Err(anyhow::anyhow!(
            "Number of events ({}) does not match number of template_ids ({})",
            events.len(),
            template_ids.len()
        ));
    }

    let mut ids = vec![];
    let mut span_ids = vec![];
    let mut timestamps = vec![];
    let mut values = vec![];

    for event in events {
        ids.push(event.id);
        span_ids.push(event.span_id);
        timestamps.push(event.timestamp);
        values.push(event.value);
    }

    create_events(
        &db.pool,
        &ids,
        &span_ids,
        &timestamps,
        template_ids,
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
    let events = sqlx::query_as::<_, EventWithTemplateName>(
        "SELECT
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
        WHERE span_id = $1
        ORDER BY e.timestamp ASC",
    )
    .bind(span_id)
    .fetch_all(pool)
    .await?;

    Ok(events)
}

pub async fn get_events_by_template_id(
    pool: &PgPool,
    template_id: &Uuid,
    date_range: &Option<DateRange>,
    filters: &Option<Vec<Filter>>,
    offset: usize,
    limit: usize,
) -> Result<Vec<EventWithTemplateName>> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT
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
        WHERE event_templates.id = ",
    );
    query.push_bind(template_id);

    add_filters_to_events_query(&mut query, filters);

    add_date_range_to_query(&mut query, date_range, "e.timestamp", None)?;

    query.push(" ORDER BY e.timestamp DESC ");
    query.push(" LIMIT ");
    query.push_bind(limit as i64);
    query.push(" OFFSET ");
    query.push_bind(offset as i64);

    let events = query
        .build_query_as::<'_, EventWithTemplateName>()
        .fetch_all(pool)
        .await?;

    Ok(events)
}

#[derive(sqlx::FromRow)]
struct TotalCount {
    count: i64,
}

pub async fn count_events_by_template_id(
    pool: &PgPool,
    template_id: &Uuid,
    date_range: &Option<DateRange>,
    filters: &Option<Vec<Filter>>,
) -> Result<i64> {
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*) count
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE event_templates.id = ",
    );
    query.push_bind(template_id);

    add_filters_to_events_query(&mut query, filters);

    add_date_range_to_query(&mut query, date_range, "e.timestamp", None)?;

    let count = query
        .build_query_as::<'_, TotalCount>()
        .fetch_one(pool)
        .await?;

    Ok(count.count)
}

pub async fn count_all_events_by_template_id_in_project(
    pool: &PgPool,
    template_id: &Uuid,
    project_id: &Uuid,
) -> Result<i64> {
    let count = sqlx::query_as::<_, TotalCount>(
        "SELECT COUNT(*) count
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE event_templates.id = $1
        AND project_id = $2",
    )
    .bind(template_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(count.count)
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

fn add_filters_to_events_query(query: &mut QueryBuilder<Postgres>, filters: &Option<Vec<Filter>>) {
    if let Some(filters) = filters {
        filters.iter().for_each(|filter| {
            let filter_value = match &filter.filter_value {
                Value::String(v) => match serde_json::from_str(v) {
                    Ok(v) => v,
                    Err(_) => v.clone().into(),
                },
                v => v.clone(),
            };
            let filter_value_str = match &filter.filter_value {
                Value::String(s) => s.clone(),
                v => v.to_string(),
            };
            if !filter.validate_column() {
                log::warn!("Invalid column name: {}", filter.filter_column);
                return;
            }
            query.push(" AND e.");
            query.push(&filter.filter_column);

            query.push(filter.filter_operator.to_sql_operator());
            if ["id", "span_id"]
                .iter()
                .any(|col| col == &filter.filter_column.as_str())
            {
                let padded_uuid = if Regex::new(r"^[\da-fA-F]{4}-[\da-fA-F]{12}$")
                    .unwrap()
                    .is_match(&filter_value_str)
                {
                    format!("00000000-0000-0000-{}", filter_value_str)
                } else {
                    filter_value_str
                };
                query.push_bind(Uuid::parse_str(&padded_uuid).unwrap_or_default());
            } else if &filter.filter_column == "value" {
                query.push_bind(filter_value);
            } else {
                query.push_bind(filter_value_str);
            }
        });
    }
}
