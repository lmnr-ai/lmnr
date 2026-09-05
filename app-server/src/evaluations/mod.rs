mod datapoint_update;
pub mod realtime;

use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use clickhouse::Row;

use crate::{
    ch::{
        evaluation_datapoints::{CHEvaluationDatapoint, ch_insert_evaluation_datapoints},
        utils::chrono_to_nanoseconds,
    },
    db::{
        evaluations::is_shared_evaluation,
        trace::{delete_shared_traces, insert_shared_traces},
    },
    utils::json_value_to_string,
};

/// Helper struct for fetching a single trace_id from ClickHouse.
#[derive(Row, serde::Serialize, serde::Deserialize)]
struct TraceIdRow {
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
}

pub const DEFAULT_GROUP_NAME: &str = "default";

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointDatasetLink {
    pub dataset_id: Uuid,
    pub datapoint_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, Debug, Clone)]
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

/// Check if a serde_json::Value is "falsey" for the purposes of not overwriting.
/// Falsey means: null, empty string, empty object, or empty array.
fn is_falsey_value(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Object(o) => o.is_empty(),
        Value::Array(a) => a.is_empty(),
        _ => false,
    }
}

/// Convert a scores HashMap to a JSON string for ClickHouse.
/// Filters out null-valued scores so that jsonMergePatch (RFC 7396) does not
/// interpret them as deletions. Only scores with actual float values are included.
/// Returns "" if the scores map is empty or all values are None.
fn scores_to_json_string(scores: &HashMap<String, Option<f64>>) -> String {
    let filtered: HashMap<&String, f64> = scores
        .iter()
        .filter_map(|(k, v)| v.map(|val| (k, val)))
        .collect();
    if filtered.is_empty() {
        return String::new();
    }
    json_value_to_string(&serde_json::to_value(filtered).unwrap_or_default())
}

/// Convert a Value to a ClickHouse string, returning "" for falsey values.
fn value_to_ch_string(v: &Value) -> String {
    if is_falsey_value(v) {
        String::new()
    } else {
        json_value_to_string(v)
    }
}

pub async fn insert_evaluation_datapoints(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_datapoints: Vec<EvaluationDatapointResult>,
    evaluation_id: Uuid,
    project_id: Uuid,
    group_name: &String,
) -> Result<Vec<CHEvaluationDatapoint>> {
    if evaluation_datapoints.is_empty() {
        return Ok(Vec::new());
    }

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        insert_shared_traces(
            pool,
            project_id,
            evaluation_datapoints
                .iter()
                .map(|dp| dp.trace_id)
                .collect::<Vec<_>>()
                .as_slice(),
        )
        .await?;
    }

    let ch_rows: Vec<CHEvaluationDatapoint> = evaluation_datapoints
        .into_iter()
        .map(|dp| {
            CHEvaluationDatapoint::from_evaluation_datapoint_result(
                dp,
                evaluation_id,
                project_id,
                group_name,
            )
        })
        .collect();

    ch_insert_evaluation_datapoints(clickhouse, ch_rows.as_slice()).await?;

    Ok(ch_rows)
}

/// Update a single evaluation datapoint using INSERT...SELECT pattern.
/// Only updates trace_id, executor_output, and scores columns.
/// All other columns are preserved from the existing row.
pub async fn update_evaluation_datapoint(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_id: Uuid,
    group_id: &String,
    executor_output: Option<Value>,
    scores: HashMap<String, Option<f64>>,
    trace_id: Option<Uuid>,
) -> Result<UpdatedDatapointStrings> {
    // Verify the datapoint exists and get its trace_id for shared evaluation handling.
    // We use prewhere id here, so that we hit the bloom_filter skip index on the
    // project_id, evaluation_id, id BEFORE we execute FINAL
    let existing_row = clickhouse
        .query(
            "SELECT trace_id FROM evaluation_datapoints FINAL PREWHERE id = ?
             WHERE project_id = ? AND evaluation_id = ?",
        )
        .bind(datapoint_id)
        .bind(project_id)
        .bind(evaluation_id)
        .fetch_optional::<TraceIdRow>()
        .await?;

    let existing_row = existing_row.ok_or(anyhow::anyhow!("Evaluation datapoint not found"))?;

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        match trace_id {
            Some(new_trace_id) if !new_trace_id.is_nil() => {
                if new_trace_id != existing_row.trace_id {
                    delete_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
                    insert_shared_traces(pool, project_id, &[new_trace_id]).await?;
                }
            }
            _ => {
                // None or nil trace_id: re-mark existing trace as shared
                insert_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
            }
        }
    }

    let new_trace_id = trace_id.unwrap_or(Uuid::nil());
    let new_executor_output = executor_output
        .as_ref()
        .map(value_to_ch_string)
        .unwrap_or_default();
    let new_scores = scores_to_json_string(&scores);
    let now_nanos = chrono_to_nanoseconds(Utc::now());

    datapoint_update::write(
        &clickhouse,
        evaluation_id,
        project_id,
        datapoint_id,
        &datapoint_update::Update {
            trace_id: new_trace_id,
            updated_at: now_nanos,
            executor_output: &new_executor_output,
            group_id,
            scores: &new_scores,
        },
    )
    .await?;

    Ok(UpdatedDatapointStrings {
        executor_output: new_executor_output,
        scores: new_scores,
    })
}

pub struct UpdatedDatapointStrings {
    pub executor_output: String,
    pub scores: String,
}
