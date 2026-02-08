use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    evaluations::{DEFAULT_GROUP_NAME, EvaluationDatapointResult},
    utils::json_value_to_string,
};

use super::utils::chrono_to_nanoseconds;

fn default_group_id() -> String {
    DEFAULT_GROUP_NAME.to_string()
}

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
    pub updated_at: i64,
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
}

impl CHEvaluationDatapoint {
    pub fn from_evaluation_datapoint_result(
        result: EvaluationDatapointResult,
        evaluation_id: Uuid,
        project_id: Uuid,
        group_name: &String,
    ) -> Self {
        CHEvaluationDatapoint {
            id: result.id,
            evaluation_id,
            project_id,
            trace_id: result.trace_id,
            index: result.index as u64,
            updated_at: chrono_to_nanoseconds(Utc::now()),
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
            scores: json_value_to_string(&serde_json::to_value(result.scores).unwrap_or_default()),
        }
    }
}
