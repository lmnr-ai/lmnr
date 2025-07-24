use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::db::{
    events::Event,
    spans::{Span, SpanType},
};
use crate::traces::spans::SpanAttributes;

#[derive(Deserialize, Serialize, Clone, Debug, FromRow)]
#[serde(rename_all = "camelCase")]
struct SpanRow {
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
    pub status: Option<String>,
    pub input_url: Option<String>,
    pub output_url: Option<String>,
}

impl SpanRow {
    fn into_span(self, project_id: Uuid, events: Vec<Event>) -> Span {
        let attributes = if let Value::Object(map) = self.attributes {
            SpanAttributes::new(map.into_iter().collect())
        } else {
            SpanAttributes::default()
        };

        let events_json = if events.is_empty() {
            None
        } else {
            serde_json::to_value(events).ok()
        };

        Span {
            span_id: self.span_id,
            trace_id: self.trace_id,
            parent_span_id: self.parent_span_id,
            name: self.name,
            attributes,
            input: self.input,
            output: self.output,
            span_type: self.span_type,
            start_time: self.start_time,
            end_time: self.end_time,
            events: events_json,
            status: self.status,
            labels: None,
            input_url: self.input_url,
            output_url: self.output_url,
            project_id,
        }
    }
}

async fn get_span_events(
    pool: &PgPool,
    project_id: &Uuid,
    span_id: &Uuid,
) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as::<_, Event>(
        "SELECT 
            id,
            span_id,
            project_id,
            created_at,
            timestamp,
            name,
            attributes
        FROM events 
        WHERE span_id = $1 AND project_id = $2 
        ORDER BY timestamp ASC",
    )
    .bind(span_id)
    .bind(project_id)
    .fetch_all(pool)
    .await
}

pub async fn get_span(
    pool: &PgPool,
    project_id: &Uuid,
    span_id: &Uuid,
) -> Result<Option<Span>, sqlx::Error> {
    let span_row = sqlx::query_as::<_, SpanRow>(
        "SELECT 
            s.span_id, 
            s.trace_id, 
            s.parent_span_id, 
            s.name,
            s.attributes,
            s.input,
            s.output,
            s.span_type,
            s.start_time, 
            s.end_time, 
            s.status,
            s.input_url,
            s.output_url
        FROM spans s
        WHERE s.span_id = $1 AND s.project_id = $2",
    )
    .bind(span_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = span_row {
        // Get the events for this span
        let events = get_span_events(pool, project_id, span_id).await?;
        Ok(Some(row.into_span(*project_id, events)))
    } else {
        Ok(None)
    }
}
