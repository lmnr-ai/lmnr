use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    eval_datasets::is_task_hash,
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
    /// Eval dataset task version (64 hex) the Trial ran, or `''`.
    pub task_version_hash: String,
}

impl CHEvaluationTrial {
    pub fn from_evaluation_trial_result(
        result: EvaluationTrialResult,
        evaluation_id: Uuid,
        project_id: Uuid,
        group_name: &String,
        stored: Option<&StoredTrial>,
    ) -> Self {
        let updated_at = chrono_to_nanoseconds(Utc::now());
        let task_id = result
            .task_id
            .filter(|task_id| !task_id.is_empty())
            .unwrap_or_else(|| result.index.to_string());
        // A re-save without a valid hash keeps the one stored by an earlier save.
        let task_version_hash = result
            .task_version_hash
            .filter(|hash| is_task_hash(hash))
            .or_else(|| stored.map(|trial| trial.task_version_hash.clone()))
            .unwrap_or_default();
        CHEvaluationTrial {
            id: result.id,
            evaluation_id,
            project_id,
            trace_id: result.trace_id,
            index: result.index as u64,
            task_id,
            task_version_hash,
            updated_at,
            created_at: stored.map(|trial| trial.created_at).unwrap_or(updated_at),
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
struct StoredTrialRow {
    #[serde(with = "clickhouse::serde::uuid")]
    id: Uuid,
    created_at: i64,
    task_version_hash: String,
}

/// What a Trial's earlier saves stored that a later save must keep.
pub struct StoredTrial {
    created_at: i64,
    /// The latest non-empty hash, or `''`.
    task_version_hash: String,
}

/// The already-stored Trials among `ids`. The SDK saves a Trial once before it runs and
/// again with its output, and the second save must keep the first one's time.
pub async fn get_stored_trials(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    ids: &[Uuid],
) -> Result<HashMap<Uuid, StoredTrial>> {
    let rows = clickhouse
        .query(
            "SELECT id, toUnixTimestamp64Nano(min(created_at)) AS created_at,
                argMaxIf(task_version_hash, updated_at, task_version_hash != '')
                    AS task_version_hash
             FROM evaluation_datapoints
             WHERE project_id = {project_id:UUID} AND evaluation_id = {evaluation_id:UUID}
                AND id IN {ids:Array(UUID)}
             GROUP BY id",
        )
        .param("project_id", project_id)
        .param("evaluation_id", evaluation_id)
        .param("ids", ids)
        .fetch_all::<StoredTrialRow>()
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let trial = StoredTrial {
                created_at: row.created_at,
                task_version_hash: row.task_version_hash,
            };
            (row.id, trial)
        })
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

    fn trial_of(point: serde_json::Value, stored: Option<&StoredTrial>) -> CHEvaluationTrial {
        let result: EvaluationTrialResult = serde_json::from_value(point).unwrap();
        CHEvaluationTrial::from_evaluation_trial_result(
            result,
            Uuid::nil(),
            Uuid::nil(),
            &DEFAULT_GROUP_NAME.to_string(),
            stored,
        )
    }

    fn task_id_of(point: serde_json::Value) -> String {
        trial_of(point, None).task_id
    }

    #[test]
    fn task_version_hash_keeps_valid_hashes_and_the_stored_one() {
        use serde_json::json;
        let hash = "ab".repeat(32);
        let other = "cd".repeat(32);
        let hash_of = |point, stored| trial_of(point, stored).task_version_hash;

        assert_eq!(
            hash_of(json!({"data": {}, "taskVersionHash": hash}), None),
            hash
        );
        assert_eq!(hash_of(json!({"data": {}}), None), "");
        for invalid in [
            json!(null),
            json!(""),
            json!(format!("sha256:{hash}")),
            json!("ABC"),
        ] {
            assert_eq!(
                hash_of(json!({"data": {}, "taskVersionHash": invalid}), None),
                "",
                "{invalid}"
            );
        }

        let stored = StoredTrial {
            created_at: 7,
            task_version_hash: other.clone(),
        };
        let resaved = trial_of(json!({"data": {}}), Some(&stored));
        assert_eq!(resaved.task_version_hash, other);
        assert_eq!(resaved.created_at, 7);
        assert_eq!(
            hash_of(json!({"data": {}, "taskVersionHash": hash}), Some(&stored)),
            hash
        );
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
