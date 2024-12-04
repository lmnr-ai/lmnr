use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    opentelemetry::opentelemetry_proto_trace_v1::span::Event as OtelEvent,
    traces::span_attributes::EVENT_VALUE,
};

use super::{event_templates::EventType, utils::convert_any_value_to_json_value};

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
        FROM old_events e
        JOIN event_templates ON e.template_id = event_templates.id
        WHERE span_id = $1
        ORDER BY e.timestamp ASC",
    )
    .bind(span_id)
    .fetch_all(pool)
    .await?;

    Ok(events)
}
