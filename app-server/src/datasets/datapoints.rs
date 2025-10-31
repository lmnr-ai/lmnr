use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Datapoint {
    pub id: Uuid,
    pub dataset_id: Uuid,
    pub data: Value,
    pub target: Option<Value>,
    pub metadata: HashMap<String, Value>,
    pub created_at: DateTime<Utc>,
}

impl Datapoint {
    pub fn parse_string_payloads(
        data: String,
        target: String,
        metadata: String,
    ) -> Result<(Value, Option<Value>, HashMap<String, Value>), serde_json::Error> {
        let data = serde_json::from_str(&data).unwrap_or(serde_json::Value::Null);
        let target = if target == "<null>" || target.is_empty() || target.to_lowercase() == "null" {
            None
        } else {
            serde_json::from_str(&target).ok()
        };
        let metadata: HashMap<String, serde_json::Value> =
            serde_json::from_str(&metadata).unwrap_or_default();

        Ok((data, target, metadata))
    }
}

// This struct is similar to CHDatapoint, but for some reason
// uuid parsing on that doesn't work with the query engine
// returned owned strings (internally it uses Uuid::from_str which expects a &str)
#[derive(Deserialize)]
pub struct CHQueryEngineDatapoint {
    pub id: Uuid,
    pub dataset_id: Uuid,
    pub created_at: String,
    pub data: String,
    pub target: String,
    pub metadata: String,
}

impl TryInto<Datapoint> for CHQueryEngineDatapoint {
    type Error = anyhow::Error;
    fn try_into(self) -> Result<Datapoint, Self::Error> {
        let (data, target, metadata) =
            Datapoint::parse_string_payloads(self.data, self.target, self.metadata)?;
        Ok(Datapoint {
            id: self.id,
            dataset_id: self.dataset_id,
            created_at: DateTime::from_naive_utc_and_offset(
                NaiveDateTime::parse_from_str(&self.created_at, "%Y-%m-%d %H:%M:%S%.f")?,
                Utc,
            ),
            data,
            target,
            metadata,
        })
    }
}
