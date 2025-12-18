use std::collections::HashSet;

use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::evaluation_datapoint_outputs::{
        CHEvaluationDatapointOutput, insert_evaluation_datapoint_outputs,
    },
    evaluations::utils::EvaluationDatapointResult,
    utils::json_value_to_string,
};

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHEvaluationDatapoint {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluation_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub index: u64,
    pub created_at: i64,
    pub data: String,
    pub target: String,
    pub metadata: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_datapoint_id: Uuid,
    pub dataset_datapoint_created_at: i64,
}

#[derive(Row, Deserialize)]
pub struct CHEvaluationDatapointId {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
}

impl CHEvaluationDatapoint {
    pub fn from_evaluation_datapoint_result(
        result: EvaluationDatapointResult,
        evaluation_id: Uuid,
        project_id: Uuid,
    ) -> Self {
        CHEvaluationDatapoint {
            id: result.id,
            evaluation_id,
            project_id,
            trace_id: result.trace_id,
            index: result.index as u64,
            created_at: chrono_to_nanoseconds(Utc::now()),
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
        }
    }
}

pub async fn insert_evaluation_datapoints(
    clickhouse: clickhouse::Client,
    evaluation_datapoints: Vec<EvaluationDatapointResult>,
    evaluation_id: Uuid,
    project_id: Uuid,
) -> Result<()> {
    if evaluation_datapoints.is_empty() {
        return Ok(());
    }

    // The function is called twice - on datapoint creation and on datapoint update
    // We query the existing datapoints and filter them out to avoid duplicates
    let existing_ch_datapoints = clickhouse
        .query("SELECT id FROM evaluation_datapoints WHERE evaluation_id = ? AND project_id = ?")
        .bind(evaluation_id)
        .bind(project_id)
        .fetch_all::<CHEvaluationDatapointId>()
        .await?;
    let existing_datapoint_ids = existing_ch_datapoints
        .iter()
        .map(|dp| dp.id)
        .collect::<HashSet<_>>();

    let mut new_datapoints = Vec::new();
    let mut existing_datapoints = Vec::new();

    for result in evaluation_datapoints {
        if existing_datapoint_ids.contains(&result.id) {
            existing_datapoints.push(result);
        } else {
            new_datapoints.push(result);
        }
    }

    // If this datapoint already exists, we need to update the executor output
    insert_evaluation_datapoint_outputs(
        clickhouse.clone(),
        existing_datapoints
            .into_iter()
            .map(|result| {
                CHEvaluationDatapointOutput::from_evaluation_datapoint_result(
                    result,
                    evaluation_id,
                    project_id,
                )
            })
            .collect(),
    )
    .await?;

    // For new datapoints, we need to insert them
    let ch_insert = clickhouse
        .insert::<CHEvaluationDatapoint>("evaluation_datapoints")
        .await;
    match ch_insert {
        Ok(mut ch_insert) => {
            for result in new_datapoints {
                let datapoint = CHEvaluationDatapoint::from_evaluation_datapoint_result(
                    result,
                    evaluation_id,
                    project_id,
                );
                ch_insert.write(&datapoint).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse evaluation datapoints insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert evaluation datapoints into Clickhouse: {:?}",
                e
            ));
        }
    }
}

pub async fn get_evaluation_datapoint_index(
    clickhouse: clickhouse::Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_id: Uuid,
) -> Result<u64> {
    let result = clickhouse
        .query("SELECT index FROM evaluation_datapoints WHERE evaluation_id = ? AND project_id = ? AND id = ?")
        .bind(evaluation_id)
        .bind(project_id)
        .bind(datapoint_id)
        .fetch_one::<u64>()
        .await?;

    Ok(result)
}
