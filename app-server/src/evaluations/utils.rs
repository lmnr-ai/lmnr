use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::utils::json_value_to_string;

const MAX_JSON_VALUE_LENGTH: usize = 1000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointDatasetLink {
    pub dataset_id: Uuid,
    pub datapoint_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointResult {
    pub data: Value,
    #[serde(default)]
    pub index: i32,
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    #[serde(default)]
    pub target: Value,
    #[serde(default)]
    pub metadata: Option<HashMap<String, Value>>,
    #[serde(default)]
    pub executor_output: Option<Value>,
    #[serde(default)]
    pub trace_id: Uuid,
    #[serde(default)]
    pub scores: HashMap<String, Option<f64>>,
    #[serde(default)]
    pub dataset_link: Option<EvaluationDatapointDatasetLink>,
}

pub struct DatapointColumns {
    pub ids: Vec<Uuid>,
    pub datas: Vec<Value>,
    pub targets: Vec<Value>,
    pub metadatas: Vec<HashMap<String, Value>>,
    pub executor_outputs: Vec<Option<Value>>,
    pub trace_ids: Vec<Uuid>,
    pub scores: Vec<HashMap<String, Option<f64>>>,
    pub indices: Vec<i32>,
}

pub fn get_columns_from_points(points: &Vec<EvaluationDatapointResult>) -> DatapointColumns {
    let ids = points.iter().map(|point| point.id).collect::<Vec<_>>();
    let datas = points
        .iter()
        .map(|point| truncate_json_value(&point.data))
        .collect::<Vec<_>>();

    let targets = points
        .iter()
        .map(|point| truncate_json_value(&point.target))
        .collect::<Vec<_>>();

    let metadatas = points
        .iter()
        .map(|point| point.metadata.clone().unwrap_or_default())
        .collect::<Vec<_>>();

    let executor_outputs = points
        .iter()
        .map(|point| {
            point
                .executor_output
                .as_ref()
                .map(|output| truncate_json_value(output))
        })
        .collect::<Vec<_>>();

    let scores = points
        .iter()
        .map(|point| point.scores.clone())
        .collect::<Vec<_>>();

    let trace_ids = points
        .iter()
        .map(|point| point.trace_id)
        .collect::<Vec<_>>();

    let indices = points.iter().map(|point| point.index).collect::<Vec<_>>();

    DatapointColumns {
        ids,
        datas,
        metadatas,
        targets,
        executor_outputs,
        trace_ids,
        scores,
        indices,
    }
}

fn truncate_json_value(value: &Value) -> Value {
    match value {
        //
        Value::String(s) if s.len() < MAX_JSON_VALUE_LENGTH => value.clone(),
        Value::Null | Value::Bool(_) | Value::Number(_) => value.clone(),
        _ => serde_json::to_value(
            json_value_to_string(value)
                .chars()
                .take(MAX_JSON_VALUE_LENGTH)
                .collect::<String>(),
        )
        .unwrap_or_default(),
    }
}
