use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{evaluations::utils::EvaluationDatapointResult, utils::json_value_to_string};

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

    let ch_insert = clickhouse.insert("evaluation_datapoints");
    match ch_insert {
        Ok(mut ch_insert) => {
            for result in evaluation_datapoints {
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
