use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{PgPool, prelude::FromRow};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    /// Group id is used to group evaluations together within the same project
    ///
    /// Conceptually, evaluations with different group ids are used to test different features.
    pub group_id: String,
    pub metadata: Option<Value>,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapoint {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub evaluation_id: Uuid,
    pub data: Value,
    pub target: Value,
    pub scores: Value, // HashMap<String, f64>
    pub executor_output: Option<Value>,
    pub trace_id: Uuid,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointPreview {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub evaluation_id: Uuid,
    pub trace_id: Uuid,
}

#[derive(FromRow)]
pub struct EvaluationInfo {
    pub group_id: String,
}

pub async fn create_evaluation(
    pool: &PgPool,
    name: &String,
    project_id: Uuid,
    group_id: &str,
    metadata: &Option<Value>,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "INSERT INTO evaluations (name, project_id, group_id, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            created_at,
            name,
            project_id,
            group_id,
            metadata",
    )
    .bind(name)
    .bind(project_id)
    .bind(group_id)
    .bind(metadata)
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

/// Record evaluation results in the database.
///
/// Each target may contain an empty JSON object, if there is no target.
pub async fn set_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
    ids: &Vec<Uuid>,
    scores: &Vec<HashMap<String, Option<f64>>>,
    datas: &Vec<Value>,
    targets: &Vec<Value>,
    metadatas: &Vec<HashMap<String, Value>>,
    executor_outputs: &Vec<Option<Value>>,
    trace_ids: &Vec<Uuid>,
    indices: &Vec<i32>,
) -> Result<()> {
    let metadata_values: Vec<Value> = metadatas
        .iter()
        .map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
        .collect();

    let results = sqlx::query_as::<_, EvaluationDatapointPreview>(
        r"INSERT INTO evaluation_results (
            id,
            evaluation_id,
            data,
            target,
            metadata,
            executor_output,
            trace_id,
            index
        )
        SELECT
            id,
            $8 as evaluation_id,
            data,
            target,
            metadata,
            executor_output,
            trace_id,
            index
        FROM
        UNNEST ($1::uuid[], $2::jsonb[], $3::jsonb[], $4::jsonb[], $5::jsonb[], $6::uuid[], $7::int8[])
        AS tmp_table(id, data, target, metadata, executor_output, trace_id, index)
        ON CONFLICT (id) DO UPDATE
            SET executor_output = EXCLUDED.executor_output
        RETURNING id, created_at, evaluation_id, trace_id
        ",
    )
    .bind(ids)
    .bind(datas)
    .bind(targets)
    .bind(metadata_values)
    .bind(executor_outputs)
    .bind(trace_ids)
    .bind(indices)
    .bind(evaluation_id)
    .fetch_all(pool)
    .await?;

    // Each datapoint can have multiple scores, so unzip the scores and result ids.
    let (score_result_ids, (score_names, score_values)): (
        Vec<Uuid>,
        (Vec<String>, Vec<Option<f64>>),
    ) = scores
        .iter()
        .zip(results.iter())
        .flat_map(|(score, result)| {
            score
                .iter()
                .map(|(name, value)| (result.id, (name.clone(), value)))
        })
        .unzip();

    sqlx::query(
        "INSERT INTO evaluation_scores (result_id, name, score)
        SELECT
            result_id,
            name,
            score
        FROM UNNEST ($1::uuid[], $2::text[], $3::float8[])
        AS tmp_table(result_id, name, score)",
    )
    .bind(&score_result_ids)
    .bind(&score_names)
    .bind(&score_values)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get evaluation group_id for ClickHouse operations
pub async fn get_evaluation_group_id(
    pool: &PgPool,
    evaluation_id: Uuid,
    project_id: Uuid,
) -> Result<String> {
    let eval_info = sqlx::query_as::<_, EvaluationInfo>(
        "SELECT group_id 
         FROM evaluations
         WHERE id = $1 AND project_id = $2 LIMIT 1",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(eval_info.group_id)
}

/// Update executor output and scores for a single evaluation datapoint.
pub async fn update_evaluation_datapoint_and_get_trace_id(
    pool: &PgPool,
    evaluation_id: Uuid,
    datapoint_id: Uuid,
    executor_output: &Option<Value>,
    scores: HashMap<String, Option<f64>>,
) -> Result<Uuid> {
    // Update the executor output in the evaluation_results table
    let trace_id = sqlx::query_scalar(
        r"UPDATE evaluation_results 
        SET executor_output = $1
        WHERE id = $2 AND evaluation_id = $3
        RETURNING trace_id",
    )
    .bind(executor_output)
    .bind(datapoint_id)
    .bind(evaluation_id)
    .fetch_one(pool)
    .await?;

    // Insert new scores into PostgreSQL
    if !scores.is_empty() {
        let (score_names, score_values): (Vec<String>, Vec<Option<f64>>) =
            scores.into_iter().unzip();
        let score_result_ids = vec![datapoint_id; score_names.len()];

        sqlx::query(
            "INSERT INTO evaluation_scores (result_id, name, score)
            SELECT
                result_id,
                name,
                score
            FROM UNNEST ($1::uuid[], $2::text[], $3::float8[])
            AS tmp_table(result_id, name, score)
            ON CONFLICT (result_id, name) DO UPDATE
                SET score = EXCLUDED.score",
        )
        .bind(&score_result_ids)
        .bind(&score_names)
        .bind(&score_values)
        .execute(pool)
        .await?;
    }

    Ok(trace_id)
}
