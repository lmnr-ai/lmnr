use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use super::{modifiers::DateRange, DB};

#[derive(sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "event_source")]
pub enum EventSource {
    AUTO,
    MANUAL,
    CODE,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventObservation {
    #[serde(skip_deserializing)] // span_id is added manually when parsing events from the span
    pub span_id: Uuid,
    pub timestamp: DateTime<Utc>,
    /// Unique type name
    pub template_name: String,
    pub value: Option<Value>,
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
    pub source: EventSource,
    pub metadata: Option<Value>,
    pub value: Option<Value>,
    pub data: Option<String>,
}

pub async fn create_event(
    pool: &PgPool,
    span_id: Uuid,
    timestamp: DateTime<Utc>,
    template_id: Uuid,
    source: EventSource,
    metadata: Option<Value>,
    value: Option<Value>,
    data: Option<String>,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO events (span_id, timestamp, template_id, source, metadata, value, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)",
        span_id,
        timestamp,
        template_id,
        source as EventSource,
        metadata,
        value,
        data,
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
    data: &Vec<Option<String>>,
) -> Result<()> {
    sqlx::query!(
        "INSERT INTO events (span_id, timestamp, template_id, source, value, data)
        SELECT unnest($1::uuid[]), unnest($2::timestamptz[]), unnest($3::uuid[]), $4, unnest($5::jsonb[]), unnest($6::text[])",
        span_ids,
        timestamps,
        template_ids,
        source as EventSource,
        values as &[Option<Value>],
        data as &[Option<String>],
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn create_events_by_template_name(
    db: Arc<DB>,
    events: Vec<EventObservation>,
    source: EventSource,
) -> Result<()> {
    let mut span_ids = vec![];
    let mut timestamps = vec![];
    let mut template_ids = vec![];
    let mut values = vec![];

    for event in events {
        let template_id = sqlx::query!(
            "SELECT id FROM event_templates WHERE name = $1",
            event.template_name
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
        &vec![None; values.len()],
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
            e.source as "source: EventSource",
            e.metadata,
            e.value,
            e.data
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE span_id = $1"#,
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
            e.source,
            e.metadata,
            e.value,
            e.data
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
    let events = sqlx::query_as!(
        EventWithTemplateName,
        r#"SELECT
            e.id,
            e.created_at,
            e.span_id,
            e.timestamp,
            e.template_id,
            event_templates.name as template_name,
            e.source as "source: EventSource",
            e.metadata,
            e.value,
            e.data
        FROM events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE span_id IN (
            SELECT id from spans where trace_id IN (
                SELECT id from new_traces where session_id = $1
            )
        )
        AND project_id = $2"#,
        session_id,
        project_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(events)
}
