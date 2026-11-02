use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    evaluations::{DEFAULT_GROUP_NAME, EvaluationTrialResult},
    utils::json_value_to_string,
};

use super::utils::chrono_to_nanoseconds;

fn default_group_id() -> String {
    DEFAULT_GROUP_NAME.to_string()
}

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHEvaluationTrial {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluation_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub updated_at: i64,
    pub created_at: i64,
    pub data: String,
    pub target: String,
    pub metadata: String,
    pub executor_output: String,
    pub index: u64,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_datapoint_id: Uuid,
    pub dataset_datapoint_created_at: i64,
    #[serde(default = "default_group_id")]
    pub group_id: String,
    pub scores: String, // Stringified JSON object from score name to float value
    pub task_id: String,
}

impl CHEvaluationTrial {
    pub fn from_evaluation_trial_result(
        result: EvaluationTrialResult,
        evaluation_id: Uuid,
        project_id: Uuid,
        group_name: &String,
        created_at: Option<i64>,
    ) -> Self {
        let updated_at = chrono_to_nanoseconds(Utc::now());
        let task_id = result
            .task_id
            .filter(|task_id| !task_id.is_empty())
            .unwrap_or_else(|| result.index.to_string());
        CHEvaluationTrial {
            id: result.id,
            evaluation_id,
            project_id,
            trace_id: result.trace_id,
            index: result.index as u64,
            task_id,
            updated_at,
            created_at: created_at.unwrap_or(updated_at),
            data: json_value_to_string(&result.data),
            target: json_value_to_string(&result.target),
            metadata: json_value_to_string(
                &serde_json::to_value(result.metadata.unwrap_or_default()).unwrap_or_default(),
            ),
            dataset_id: result
                .dataset_link
                .as_ref()
                .map(|link| link.dataset_id)
                .unwrap_or_default(),
            dataset_datapoint_id: result
                .dataset_link
                .as_ref()
                .map(|link| link.datapoint_id)
                .unwrap_or_default(),
            dataset_datapoint_created_at: chrono_to_nanoseconds(
                result
                    .dataset_link
                    .map(|link| link.created_at)
                    .unwrap_or_default(),
            ),
            executor_output: result
                .executor_output
                .map(|output| json_value_to_string(&output))
                .unwrap_or_default(),
            group_id: group_name.clone(),
            scores: json_value_to_string(
                &serde_json::to_value(
                    result
                        .scores
                        .iter()
                        .filter_map(|(k, v)| v.map(|num| (k, num)))
                        .collect::<HashMap<_, _>>(),
                )
                .unwrap_or_default(),
            ),
        }
    }
}

#[derive(Row, Deserialize)]
struct TrialCreatedAt {
    #[serde(with = "clickhouse::serde::uuid")]
    id: Uuid,
    created_at: i64,
}

/// `created_at` of each already-stored Trial in `ids`. The SDK saves a Trial once before it
/// runs and again with its output, and the second save must keep the first one's time.
pub async fn get_trial_created_ats(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    ids: &[Uuid],
) -> Result<HashMap<Uuid, i64>> {
    let rows = clickhouse
        .query(
            "SELECT id, toUnixTimestamp64Nano(min(created_at)) AS created_at
             FROM evaluation_datapoints
             WHERE project_id = {project_id:UUID} AND evaluation_id = {evaluation_id:UUID}
                AND id IN {ids:Array(UUID)}
             GROUP BY id",
        )
        .param("project_id", project_id)
        .param("evaluation_id", evaluation_id)
        .param("ids", ids)
        .fetch_all::<TrialCreatedAt>()
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.id, row.created_at))
        .collect())
}

pub async fn ch_insert_evaluation_trials(
    clickhouse: clickhouse::Client,
    eval_dps: &[CHEvaluationTrial],
) -> Result<()> {
    if eval_dps.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse
        .insert::<CHEvaluationTrial>("evaluation_datapoints")
        .await;

    match ch_insert {
        Ok(mut ch_insert) => {
            for eval_dp in eval_dps {
                ch_insert.write(eval_dp).await?;
            }

            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse evaluation_datapoints batch insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert evaluation_datapoints batch into Clickhouse: {:?}",
            e
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task_id_of(point: serde_json::Value) -> String {
        let result: EvaluationTrialResult = serde_json::from_value(point).unwrap();
        CHEvaluationTrial::from_evaluation_trial_result(
            result,
            Uuid::nil(),
            Uuid::nil(),
            &DEFAULT_GROUP_NAME.to_string(),
            None,
        )
        .task_id
    }

    #[test]
    fn task_id_falls_back_to_index() {
        use serde_json::json;
        // The Python SDK always sends `taskId`, as null when unset.
        assert_eq!(
            task_id_of(json!({"data": {}, "index": 3, "taskId": null})),
            "3"
        );
        assert_eq!(task_id_of(json!({"data": {}, "index": 3})), "3");
        assert_eq!(
            task_id_of(json!({"data": {}, "index": 3, "taskId": ""})),
            "3"
        );
        assert_eq!(
            task_id_of(json!({"data": {}, "index": 3, "taskId": "case-a"})),
            "case-a"
        );
    }
}
