use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
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

pub async fn create_evaluation(
    pool: &PgPool,
    name: &String,
    project_id: Uuid,
    group_id: &str,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "INSERT INTO evaluations (name, project_id, group_id)
        VALUES ($1, $2, $3)
        RETURNING
            id,
            created_at,
            name,
            project_id,
            group_id",
    )
    .bind(name)
    .bind(project_id)
    .bind(group_id)
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
    scores: &Vec<HashMap<String, f64>>,
    datas: &Vec<Value>,
    targets: &Vec<Value>,
    executor_outputs: &Vec<Option<Value>>,
    trace_ids: &Vec<Uuid>,
    indices: &Vec<i32>,
) -> Result<()> {
    let results = sqlx::query_as::<_, EvaluationDatapointPreview>(
        r"INSERT INTO evaluation_results (
            id,
            evaluation_id,
            data,
            target,
            executor_output,
            trace_id,
            index
        )
        SELECT
            id,
            $7 as evaluation_id,
            data,
            target,
            executor_output,
            trace_id,
            index
        FROM
        UNNEST ($1::uuid[], $2::jsonb[], $3::jsonb[], $4::jsonb[], $5::uuid[], $6::int8[])
        AS tmp_table(id, data, target, executor_output, trace_id, index)
        ON CONFLICT (id) DO UPDATE
            SET executor_output = EXCLUDED.executor_output
        RETURNING id, created_at, evaluation_id, trace_id
        ",
    )
    .bind(ids)
    .bind(datas)
    .bind(targets)
    .bind(executor_outputs)
    .bind(trace_ids)
    .bind(indices)
    .bind(evaluation_id)
    .fetch_all(pool)
    .await?;

    // Each datapoint can have multiple scores, so unzip the scores and result ids.
    let (score_result_ids, (score_names, score_values)): (Vec<Uuid>, (Vec<String>, Vec<f64>)) =
        scores
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

pub async fn add_evaluation_score(
    pool: &PgPool,
    result_id: Uuid,
    name: &String,
    score: f64,
    label_id: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO evaluation_scores (result_id, name, score, label_id)
        VALUES ($1, $2, $3, $4)",
    )
    .bind(result_id)
    .bind(name)
    .bind(score)
    .bind(label_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_evaluation_by_result_id(
    pool: &PgPool,
    project_id: Uuid,
    result_id: Uuid,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "SELECT id, created_at, name, project_id, group_id
        FROM evaluations
        WHERE id = (SELECT evaluation_id FROM evaluation_results WHERE id = $1 LIMIT 1)
        AND project_id = $2",
    )
    .bind(result_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn delete_evaluation_score(
    pool: &PgPool,
    project_id: Uuid,
    result_id: Uuid,
    label_id: Uuid,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM evaluation_scores
        WHERE result_id = $1 AND label_id = $2
        AND result_id IN (
            SELECT id FROM evaluation_results WHERE evaluation_id IN (
                SELECT id from evaluations WHERE project_id = $3
            )
        )",
    )
    .bind(result_id)
    .bind(label_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}
