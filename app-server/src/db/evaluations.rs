use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use super::DB;

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

pub async fn get_evaluation(
    db: Arc<DB>,
    project_id: Uuid,
    evaluation_id: Uuid,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "SELECT
            id, name, project_id, created_at, group_id
        FROM evaluations WHERE id = $1 AND project_id = $2",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluations(pool: &PgPool, project_id: Uuid) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as::<_, Evaluation>(
        "SELECT id, name, project_id, created_at, group_id
        FROM evaluations WHERE project_id = $1
        ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn get_evaluations_grouped_by_current_evaluation(
    pool: &PgPool,
    project_id: Uuid,
    current_evaluation_id: Uuid,
) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as::<_, Evaluation>(
        "SELECT id, name, project_id, created_at, group_id
        FROM evaluations
        WHERE project_id = $1
          AND group_id = (SELECT group_id FROM evaluations WHERE id = $2)
        ORDER BY created_at DESC",
    )
    .bind(project_id)
    .bind(current_evaluation_id)
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

/// Record evaluation results in the database.
///
/// Each target may contain an empty JSON object, if there is no target.
pub async fn set_evaluation_results(
    db: Arc<DB>,
    evaluation_id: Uuid,
    ids: &Vec<Uuid>,
    scores: &Vec<HashMap<String, f64>>,
    datas: &Vec<Value>,
    targets: &Vec<Value>,
    executor_outputs: &Vec<Option<Value>>,
    trace_ids: &Vec<Uuid>,
) -> Result<()> {
    let results = sqlx::query_as!(
        EvaluationDatapointPreview,
        r"INSERT INTO evaluation_results (
            id,
            evaluation_id,
            data,
            target,
            executor_output,
            trace_id,
            index_in_batch
        )
        SELECT
            id,
            $7 as evaluation_id,
            data,
            target,
            executor_output,
            trace_id,
            index_in_batch
        FROM
        UNNEST ($1::uuid[], $2::jsonb[], $3::jsonb[], $4::jsonb[], $5::uuid[], $6::int8[])
        AS tmp_table(id, data, target, executor_output, trace_id, index_in_batch)
        RETURNING id, created_at, evaluation_id, trace_id
        ",
        ids,
        datas,
        targets,
        executor_outputs as &Vec<Option<Value>>,
        trace_ids,
        &Vec::from_iter(0..ids.len() as i64),
        evaluation_id,
    )
    .fetch_all(&db.pool)
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

    sqlx::query!(
        "INSERT INTO evaluation_scores (result_id, name, score)
        SELECT
            result_id,
            name,
            score
        FROM UNNEST ($1::uuid[], $2::text[], $3::float8[])
        AS tmp_table(result_id, name, score)",
        &score_result_ids,
        &score_names,
        &score_values,
    )
    .execute(&db.pool)
    .await?;

    Ok(())
}

pub async fn get_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
) -> Result<Vec<EvaluationDatapoint>> {
    let results = sqlx::query_as!(
        EvaluationDatapoint,
        "WITH scores AS (
            SELECT
                result_id,
                jsonb_object_agg(name, score) as scores
            FROM evaluation_scores
            GROUP BY result_id
        )
        SELECT
            r.id,
            r.created_at,
            r.evaluation_id,
            r.data,
            r.target,
            r.executor_output,
            s.scores,
            r.trace_id
        FROM evaluation_results r
        LEFT JOIN scores s ON r.id = s.result_id
        WHERE evaluation_id = $1
        ORDER BY created_at ASC, index_in_batch ASC NULLS FIRST",
        evaluation_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}

pub async fn delete_evaluation(pool: &PgPool, evaluation_id: &Uuid) -> Result<()> {
    sqlx::query("DELETE FROM evaluations WHERE id = $1")
        .bind(evaluation_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_evaluation_datapoint(
    pool: &PgPool,
    evaluation_result_id: Uuid,
) -> Result<EvaluationDatapoint> {
    let preview = sqlx::query_as::<_, EvaluationDatapoint>(
        "SELECT
            id,
            created_at,
            evaluation_id,
            scores,
            data,
            target,
            trace_id,
            executor_output,
        FROM evaluation_results
        WHERE id = $1",
    )
    .bind(evaluation_result_id)
    .fetch_one(pool)
    .await?;

    Ok(preview)
}
