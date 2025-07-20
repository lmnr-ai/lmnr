use std::collections::HashMap;

use serde::Serialize;
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
}
