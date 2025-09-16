use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{evaluations::utils::EvaluationDatapointResult, utils::json_value_to_string};

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize, Debug)]
pub struct CHEvaluationDatapointOutput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluation_datapoint_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluation_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub index: u64,
    pub created_at: i64,
    pub executor_output: String,
}

impl CHEvaluationDatapointOutput {
    pub fn create(
        id: Uuid,
        evaluation_id: Uuid,
        project_id: Uuid,
        index: u64,
        executor_output: &Option<Value>,
    ) -> Self {
        Self {
            evaluation_datapoint_id: id,
            evaluation_id,
            project_id,
            index,
            created_at: chrono_to_nanoseconds(Utc::now()),
            executor_output: executor_output
                .as_ref()
                .map(|output| json_value_to_string(output))
                .unwrap_or_default(),
        }
    }

    pub fn from_evaluation_datapoint_result(
        result: EvaluationDatapointResult,
        evaluation_id: Uuid,
        project_id: Uuid,
    ) -> Self {
        Self::create(
            result.id,
            evaluation_id,
            project_id,
            result.index as u64,
            &result.executor_output,
        )
    }
}

pub async fn insert_evaluation_datapoint_outputs(
    clickhouse: clickhouse::Client,
    evaluation_datapoint_outputs: Vec<CHEvaluationDatapointOutput>,
) -> Result<()> {
    if evaluation_datapoint_outputs.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("evaluation_datapoint_outputs");
    match ch_insert {
        Ok(mut ch_insert) => {
            for datapoint in evaluation_datapoint_outputs {
                ch_insert.write(&datapoint).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse evaluation datapoint outputs insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert evaluation datapoint outputs into Clickhouse: {:?}",
                e
            ));
        }
    }
}
