use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ch::evaluation_datapoints::CHEvaluationDatapoint,
    db::{evaluations::is_shared_evaluation, trace::insert_shared_traces},
};

pub const DEFAULT_GROUP_NAME: &str = "default";

/// Parse a stringified JSON value that was serialized with json_value_to_string.
/// If parsing fails (e.g., because it's a plain string), wrap it as Value::String.
fn parse_json_value_from_string(s: &str) -> Value {
    serde_json::from_str(s).unwrap_or_else(|_| Value::String(s.to_string()))
}

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

pub async fn insert_evaluation_datapoints(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_datapoints: Vec<EvaluationDatapointResult>,
    evaluation_id: Uuid,
    project_id: Uuid,
    group_name: &String,
) -> Result<()> {
    if evaluation_datapoints.is_empty() {
        return Ok(());
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

    // Collect all datapoint IDs for bulk query
    let datapoint_ids: Vec<Uuid> = evaluation_datapoints.iter().map(|dp| dp.id).collect();

    // Query existing datapoints in bulk using FINAL
    let existing_datapoints = get_existing_datapoints(
        clickhouse.clone(),
        evaluation_id,
        project_id,
        &datapoint_ids,
    )
    .await?;

    let merged_datapoints: Vec<_> = evaluation_datapoints
        .into_iter()
        .map(|mut update| {
            if let Some(existing) = existing_datapoints.get(&update.id) {
                // Merge scores
                let mut merged_scores: HashMap<String, Option<f64>> =
                    serde_json::from_str(&existing.scores).unwrap_or_default();

                for (name, value) in update.scores {
                    merged_scores.insert(name, value);
                }

                update.scores = merged_scores;

                if update.data == Value::Null
                    || update.data == Value::Object(serde_json::Map::new())
                {
                    update.data = parse_json_value_from_string(&existing.data);
                }

                if update.target == Value::Null {
                    update.target = parse_json_value_from_string(&existing.target);
                }

                if update.metadata.is_none() {
                    update.metadata = serde_json::from_str(&existing.metadata).ok();
                }

                if update.executor_output.is_none() {
                    update.executor_output = Some(parse_json_value_from_string(&existing.executor_output));
                }

                if update.trace_id.is_nil() {
                    update.trace_id = existing.trace_id;
                }
            }
            update
        })
        .collect();

    let ch_insert = clickhouse
        .insert::<CHEvaluationDatapoint>("evaluation_datapoints")
        .await;
    match ch_insert {
        Ok(mut ch_insert) => {
            for result in merged_datapoints {
                let datapoint = CHEvaluationDatapoint::from_evaluation_datapoint_result(
                    result,
                    evaluation_id,
                    project_id,
                    group_name,
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

pub async fn get_existing_datapoints(
    clickhouse: clickhouse::Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_ids: &[Uuid],
) -> Result<HashMap<Uuid, CHEvaluationDatapoint>> {
    if datapoint_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let results = clickhouse
        .query("SELECT * FROM evaluation_datapoints FINAL WHERE evaluation_id = ? AND project_id = ? AND id IN ?")
        .bind(evaluation_id)
        .bind(project_id)
        .bind(datapoint_ids)
        .fetch_all::<CHEvaluationDatapoint>()
        .await?;

    Ok(results.into_iter().map(|dp| (dp.id, dp)).collect())
}

/// Update a single evaluation datapoint by merging with existing data
pub async fn update_evaluation_datapoint(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_id: Uuid,
    group_id: &String,
    executor_output: Option<Value>,
    scores: HashMap<String, Option<f64>>,
) -> Result<()> {
    // Get the existing datapoint
    let existing_map = get_existing_datapoints(
        clickhouse.clone(),
        evaluation_id,
        project_id,
        &[datapoint_id],
    )
    .await?;

    let existing = existing_map
        .get(&datapoint_id)
        .ok_or(anyhow::anyhow!("Evaluation datapoint not found"))?;

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        insert_shared_traces(pool, project_id, &[existing.trace_id]).await?;
    }

    let mut merged_scores: HashMap<String, Option<f64>> =
        serde_json::from_str(&existing.scores).unwrap_or_default();
    for (name, value) in scores {
        merged_scores.insert(name, value);
    }

    let data = parse_json_value_from_string(&existing.data);
    let target = parse_json_value_from_string(&existing.target);
    let metadata: Option<HashMap<String, Value>> = serde_json::from_str(&existing.metadata).ok();

    let dataset_link = if !existing.dataset_id.is_nil() {
        Some(EvaluationDatapointDatasetLink {
            dataset_id: existing.dataset_id,
            datapoint_id: existing.dataset_datapoint_id,
            created_at: DateTime::from_timestamp_nanos(existing.dataset_datapoint_created_at),
        })
    } else {
        None
    };

    let merged = EvaluationDatapointResult {
        id: existing.id,
        data,
        target,
        metadata,
        executor_output: executor_output
            .or_else(|| Some(parse_json_value_from_string(&existing.executor_output))),
        trace_id: existing.trace_id,
        index: existing.index as i32,
        scores: merged_scores,
        dataset_link,
    };

    let ch_datapoint = CHEvaluationDatapoint::from_evaluation_datapoint_result(
        merged,
        evaluation_id,
        project_id,
        group_id,
    );

    let mut ch_insert = clickhouse
        .insert::<CHEvaluationDatapoint>("evaluation_datapoints")
        .await?;

    ch_insert.write(&ch_datapoint).await?;
    ch_insert.end().await?;

    Ok(())
}
