use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointResult {
    pub data: Value,
    pub target: Value,
    pub executor_output: Option<Value>,
    #[serde(default)]
    pub trace_id: Uuid,
    pub scores: HashMap<String, f64>,
}

pub struct DatapointColumns {
    pub datas: Vec<Value>,
    pub targets: Vec<Value>,
    pub executor_outputs: Vec<Option<Value>>,
    pub trace_ids: Vec<Uuid>,
    pub scores: Vec<HashMap<String, f64>>,
}

pub fn get_columns_from_points(points: &Vec<EvaluationDatapointResult>) -> DatapointColumns {
    let datas = points
        .iter()
        .map(|point| point.data.clone())
        .collect::<Vec<_>>();

    let targets = points
        .iter()
        .map(|point| point.target.clone())
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

    DatapointColumns {
        datas,
        targets,
        executor_outputs,
        trace_ids,
        scores,
    }
}
