use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    opentelemetry_proto::opentelemetry_proto_trace_v1::span::Event as OtelEvent,
    utils::estimate_json_size,
};

use crate::traces::utils::convert_any_value_to_json_value;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum EventSource {
    #[serde(rename = "CODE")]
    Code,
    #[serde(rename = "SEMANTIC")]
    Semantic,
}

impl std::fmt::Display for EventSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventSource::Code => write!(f, "CODE"),
            EventSource::Semantic => write!(f, "SEMANTIC"),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: Uuid,
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub name: String,
    pub attributes: Value,
    pub trace_id: Uuid,
    pub source: EventSource,
}

impl Event {
    pub fn estimate_size_bytes(&self) -> usize {
        // 16 bytes for id,
        // 16 bytes for span_id,
        // 16 bytes for project_id,
        // 8 bytes for timestamp,
        return 16 + 16 + 16 + 8 + self.name.len() + estimate_json_size(&self.attributes);
    }

    pub fn is_exception(&self) -> bool {
        self.name.trim().eq_ignore_ascii_case("exception")
            && (self.attributes.get("exception.message").is_some()
                || self.attributes.get("exception.type").is_some())
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
            timestamp: Utc.timestamp_nanos(event.time_unix_nano as i64),
            name: event.name,
            attributes: Value::Object(attributes),
            trace_id,
            source: EventSource::Code,
        }
    }
}
