use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::db::{self, DB};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HumanEvaluator {
    pub queue_name: String,
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
    pub executor_output: Option<Value>,
    #[serde(default)]
    pub trace_id: Uuid,
    #[serde(default)]
    pub scores: HashMap<String, f64>,
    #[serde(default)]
    pub human_evaluators: Vec<HumanEvaluator>,
    #[serde(default)]
    pub executor_span_id: Uuid,
}

pub struct DatapointColumns {
    pub ids: Vec<Uuid>,
    pub datas: Vec<Value>,
    pub targets: Vec<Value>,
    pub executor_outputs: Vec<Option<Value>>,
    pub trace_ids: Vec<Uuid>,
    pub scores: Vec<HashMap<String, f64>>,
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
        targets,
        executor_outputs,
        trace_ids,
        scores,
        indices,
    }
}

pub struct LabelingQueueEntry {
    pub span_id: Uuid,
    pub action: Value,
}

/// Convert a list of datapoints to a map of queue IDs to a vec of labeling queue entries.
/// Silently skips datapoints that reference a non-existent queue.
pub async fn datapoints_to_labeling_queues(
    db: Arc<DB>,
    datapoints: &Vec<EvaluationDatapointResult>,
    ids: &Vec<Uuid>,
    project_id: &Uuid,
) -> Result<HashMap<Uuid, Vec<LabelingQueueEntry>>> {
    let mut queue_name_to_id = HashMap::new();
    let mut res = HashMap::new();
    for (datapoint, datapoint_id) in datapoints.iter().zip(ids.iter()) {
        for evaluator in datapoint.human_evaluators.iter() {
            let queue_name = evaluator.queue_name.clone();
            let queue_id = match queue_name_to_id.get(&queue_name) {
                Some(id) => *id,
                None => {
                    let queue = db::labeling_queues::get_labeling_queue_by_name(
                        &db.pool,
                        &queue_name,
                        project_id,
                    )
                    .await?;
                    if let Some(queue) = queue {
                        queue_name_to_id.insert(queue_name, queue.id);
                        queue.id
                    } else {
                        continue;
                    }
                }
            };
            let entry = res.entry(queue_id).or_insert(vec![]);

            entry.push(LabelingQueueEntry {
                span_id: datapoint.executor_span_id,
                // For now, we use the datapoint id as the action.
                // TODO: We should probably add the score name to the action.
                action: serde_json::json!({
                    "resultId": datapoint_id.to_string(),
                }),
            });
        }
    }
    Ok(res)
}
