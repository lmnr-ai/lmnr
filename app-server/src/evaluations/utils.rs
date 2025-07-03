use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

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
        .map(|point| point.data.clone())
        .collect::<Vec<_>>();

    let targets = points
        .iter()
        .map(|point| point.target.clone())
        .collect::<Vec<_>>();

    let metadatas = points
        .iter()
        .map(|point| point.metadata.clone().unwrap_or_default())
        .collect::<Vec<_>>();

    let executor_outputs = points
        .iter()
        .map(|point| point.executor_output.clone())
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
