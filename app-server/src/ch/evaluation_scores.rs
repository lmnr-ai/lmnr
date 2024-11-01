use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::evaluations::utils::EvaluationDatapointResult;

use super::utils::{execute_query, validate_string_against_injection};

/// Evaluation score
#[derive(Row, Serialize)]
pub struct EvaluationScore {
    /// Project id, its purpose is to validate user accesses evaluations only from projects they belong to
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub group_id: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluation_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub result_id: Uuid,
    // Note that one evaluator can produce multiple scores
    pub name: String,
    pub value: f64,
}

impl EvaluationScore {
    pub fn from_evaluation_datapoint_results(
        points: &Vec<EvaluationDatapointResult>,
        result_ids: &Vec<Uuid>,
        project_id: Uuid,
        group_id: String,
        evaluation_id: Uuid,
    ) -> Vec<EvaluationScore> {
        points
            .iter()
            .zip(result_ids.iter())
            .flat_map(|(point, result_id)| {
                point.scores.iter().map(|(name, value)| {
                    let name = name.to_string();
                    let value = value.clone();
                    EvaluationScore {
                        project_id,
                        group_id: group_id.clone(),
                        evaluation_id,
                        result_id: *result_id,
                        name: name.to_string(),
                        value: value.clone(),
                    }
                })
            })
            .collect()
    }
}

pub async fn insert_evaluation_scores(
    clickhouse: clickhouse::Client,
    evaluation_scores: Vec<EvaluationScore>,
) -> Result<()> {
    if evaluation_scores.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("evaluation_scores");
    match ch_insert {
        Ok(mut ch_insert) => {
            for evaluation_score in evaluation_scores {
                ch_insert.write(&evaluation_score).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse evaluation scores insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert evaluation scores into Clickhouse: {:?}",
                e
            ));
        }
    }
}

#[derive(Row, Deserialize)]
struct AverageEvaluationScore {
    average_value: f64,
}

pub async fn get_average_evaluation_score(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    name: String,
) -> Result<f64> {
    validate_string_against_injection(&name)?;

    let query = format!(
        "SELECT avg(value) as average_value FROM evaluation_scores WHERE project_id = '{}' AND evaluation_id = '{}' AND name = '{}'",
        project_id,
        evaluation_id,
        name
    );

    let rows: Vec<AverageEvaluationScore> = execute_query(&clickhouse, &query).await?;
    Ok(rows[0].average_value)
}

#[derive(Row, Deserialize)]
pub struct EvaluationScoreBucket {
    pub lower_bound: f64,
    pub upper_bound: f64,
    pub height: u64,
}

pub async fn get_evaluation_score_buckets_based_on_bounds(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    name: String,
    lower_bound: f64,
    upper_bound: f64,
    bucket_count: u64,
) -> Result<Vec<EvaluationScoreBucket>> {
    validate_string_against_injection(&name)?;

    let step_size = (upper_bound - lower_bound) / bucket_count as f64;
    let interval_nums = (1..=bucket_count)
        .map(|num| num.to_string())
        .collect::<Vec<String>>()
        .join(",");

    // This query uses {:?} with the purpose to render floats like 1.0 as 1.0 instead of 1
    let query = format!(
        "
WITH intervals AS (
    SELECT
        arrayJoin([{}]) AS interval_num,
        {:?} + ((interval_num - 1) * {:?}) AS lower_bound,
        CASE
            WHEN interval_num = {} THEN {:?}
            ELSE {:?} + (interval_num * {:?})
        END AS upper_bound
)
SELECT
    intervals.lower_bound,
    intervals.upper_bound,
    COUNT(CASE
        WHEN value >= intervals.lower_bound AND value < intervals.upper_bound THEN 1
        WHEN intervals.interval_num = {} AND value >= intervals.lower_bound AND value <= intervals.upper_bound THEN 1
        ELSE NULL
    END) AS height
FROM evaluation_scores
JOIN intervals ON 1 = 1
WHERE project_id = '{}'
AND evaluation_id = '{}'
AND name = '{}'
GROUP BY intervals.lower_bound, intervals.upper_bound, intervals.interval_num
ORDER BY intervals.interval_num",
        interval_nums, lower_bound, step_size, bucket_count, upper_bound, lower_bound, step_size, bucket_count, project_id, evaluation_id, name
    );

    let rows: Vec<EvaluationScoreBucket> = execute_query(&clickhouse, &query).await?;

    Ok(rows)
}

#[derive(Row, Deserialize, Clone)]
pub struct ComparedEvaluationScoresBounds {
    pub upper_bound: f64,
}

pub async fn get_global_evaluation_scores_bounds(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    evaluation_ids: &Vec<Uuid>,
    name: String,
) -> Result<ComparedEvaluationScoresBounds> {
    validate_string_against_injection(&name)?;

    let evaluation_ids_str = evaluation_ids
        .iter()
        .map(|id| format!("'{}'", id))
        .collect::<Vec<String>>()
        .join(",");

    let query = format!(
        "
SELECT
    MAX(value) AS upper_bound
FROM evaluation_scores
WHERE project_id = '{}'
  AND evaluation_id IN ({})
  AND name = '{}'",
        project_id, evaluation_ids_str, name
    );

    let rows: Vec<ComparedEvaluationScoresBounds> = execute_query(&clickhouse, &query).await?;
    Ok(rows[0].clone())
}
