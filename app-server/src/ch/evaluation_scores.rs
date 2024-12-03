use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize, Serializer};
use uuid::Uuid;

use crate::{
    evaluations::utils::EvaluationDatapointResult,
    features::{is_feature_enabled, Feature},
};

use super::utils::chrono_to_nanoseconds;

fn serialize_timestamp<S>(timestamp: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_i64(chrono_to_nanoseconds(timestamp.clone()))
}

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
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: DateTime<Utc>,
}

impl EvaluationScore {
    pub fn from_evaluation_datapoint_results(
        points: &Vec<EvaluationDatapointResult>,
        result_ids: &Vec<Uuid>,
        project_id: Uuid,
        group_id: String,
        evaluation_id: Uuid,
        // TODO: timestamp must be set in each point. This needs to be sent from
        // client libraries. For now the same timestamp is used for all scores,
        // which is fine.
        timestamp: DateTime<Utc>,
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
                        timestamp,
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

    if !is_feature_enabled(Feature::FullBuild) {
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
    let row = clickhouse
        .query(
            "SELECT avg(value) as average_value
        FROM evaluation_scores
        WHERE project_id = ?
            AND evaluation_id = ?
            AND name = ?
    ",
        )
        .bind(project_id)
        .bind(evaluation_id)
        .bind(name)
        .fetch_one::<AverageEvaluationScore>()
        .await?;

    Ok(row.average_value)
}

#[derive(Row, Deserialize, Clone, Debug)]
pub struct EvaluationScoreBucket {
    pub lower_bound: f64,
    pub upper_bound: f64,
    pub height: u64,
}

#[derive(Row, Deserialize)]
struct TotalCount {
    total_count: u64,
}

pub async fn get_evaluation_score_single_bucket(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    evaluation_id: Uuid,
    name: String,
    lower_bound: f64,
    upper_bound: f64,
    bucket_count: u64,
) -> Result<Vec<EvaluationScoreBucket>> {
    // If the bounds are the same, we only need one bucket.
    // We fill in the rest with 0s.
    let total_count = clickhouse
        .query(
            "SELECT COUNT() as total_count
                FROM evaluation_scores
                WHERE project_id = ?
                    AND evaluation_id = ?
                    AND name = ?",
        )
        .bind(project_id)
        .bind(evaluation_id)
        .bind(name)
        .fetch_one::<TotalCount>()
        .await?;
    let mut res = vec![
        EvaluationScoreBucket {
            lower_bound,
            upper_bound,
            height: 0,
        };
        bucket_count as usize - 1
    ];
    res.push(EvaluationScoreBucket {
        lower_bound,
        upper_bound,
        height: total_count.total_count,
    });
    return Ok(res);
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
    let step_size = (upper_bound - lower_bound) / bucket_count as f64;
    let interval_nums = (1..=bucket_count).collect::<Vec<_>>();

    let rows: Vec<EvaluationScoreBucket> = clickhouse
        .query(
            "
WITH intervals AS (
    SELECT
        arrayJoin(?) AS interval_num,
        ? + ((interval_num - 1) * ?) AS lower_bound,
        CASE
            WHEN interval_num = ? THEN ? -- to avoid floating point precision issues
            ELSE ? + (interval_num * ?)
        END AS upper_bound
)
SELECT
    CAST(intervals.lower_bound AS Float64) AS lower_bound,
    CAST(intervals.upper_bound AS Float64) AS upper_bound,
    SUM(CASE
        -- exclusive on upper bound to avoid counting the same value twice
        WHEN (value >= intervals.lower_bound AND value < intervals.upper_bound)
            OR (value = ? AND intervals.interval_num = ?) THEN 1
        ELSE 0
    END) AS height
FROM evaluation_scores
JOIN intervals ON 1 = 1
WHERE project_id = ?
AND evaluation_id = ?
AND name = ?
GROUP BY intervals.lower_bound, intervals.upper_bound, intervals.interval_num
ORDER BY intervals.interval_num",
        )
        .bind(interval_nums)
        .bind(lower_bound)
        .bind(step_size)
        .bind(bucket_count)
        .bind(upper_bound)
        .bind(lower_bound)
        .bind(step_size)
        .bind(upper_bound)
        .bind(bucket_count)
        .bind(project_id)
        .bind(evaluation_id)
        .bind(name)
        .fetch_all::<EvaluationScoreBucket>()
        .await?;

    Ok(rows)
}

#[derive(Row, Deserialize, Clone)]
pub struct ComparedEvaluationScoresBounds {
    pub lower_bound: f64,
    pub upper_bound: f64,
}

pub async fn get_global_evaluation_scores_bounds(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    evaluation_ids: &Vec<Uuid>,
    name: String,
) -> Result<ComparedEvaluationScoresBounds> {
    let row = clickhouse
        .query(
            "
SELECT
    MIN(value) AS lower_bound,
    MAX(value) AS upper_bound
FROM evaluation_scores
WHERE project_id = ?
    AND evaluation_id IN ?
    AND name = ?",
        )
        .bind(project_id)
        .bind(evaluation_ids)
        .bind(name)
        .fetch_one()
        .await?;

    Ok(row)
}

pub async fn delete_evaluation_score(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    result_id: Uuid,
    label_id: Uuid,
) -> Result<()> {
    if !is_feature_enabled(Feature::FullBuild) {
        return Ok(());
    }
    // Note, this does not immediately physically delete the data.
    // https://clickhouse.com/docs/en/sql-reference/statements/delete
    clickhouse
        .query(
            "DELETE FROM evaluation_scores WHERE project_id = ? AND result_id = ? AND label_id = ?",
        )
        .bind(project_id)
        .bind(result_id)
        .bind(label_id)
        .execute()
        .await?;
    Ok(())
}
