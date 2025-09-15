use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    opentelemetry::opentelemetry_proto_trace_v1::span::Event as OtelEvent,
    utils::estimate_json_size,
};

use crate::traces::utils::convert_any_value_to_json_value;

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: Uuid,
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub timestamp: DateTime<Utc>,
    pub name: String,
    pub attributes: Value,
    pub trace_id: Uuid,
}

impl Event {
    pub fn estimate_size_bytes(&self) -> usize {
        // 16 bytes for id,
        // 16 bytes for span_id,
        // 16 bytes for project_id,
        // 8 bytes for created_at,
        // 8 bytes for timestamp,
        return 16 + 16 + 16 + 8 + 8 + self.name.len() + estimate_json_size(&self.attributes);
    }
}

impl Event {
    pub fn from_otel(event: OtelEvent, span_id: Uuid, project_id: Uuid, trace_id: Uuid) -> Self {
        let attributes = event
            .attributes
            .into_iter()
            .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        Self {
            id: Uuid::new_v4(),
            span_id,
            project_id,
            created_at: Utc::now(),
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            name: event.name,
            attributes: Value::Object(attributes),
            trace_id,
        }
    }
}
