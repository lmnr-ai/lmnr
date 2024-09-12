use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use super::DB;

#[derive(sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "evaluation_job_status")]
pub enum EvaluationStatus {
    Started,
    Finished,
    Error,
}

#[derive(sqlx::Type, Serialize, Clone, Deserialize)]
#[sqlx(type_name = "evaluation_status")]
pub enum EvaluationDatapointStatus {
    Success,
    Error,
}

#[derive(Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub status: EvaluationStatus,
    pub project_id: Uuid,
    pub score_names: Value, // Vec<String>
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointPreview {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub evaluation_id: Uuid,
    pub data: Value,
    pub target: Value,
    pub scores: Value, // HashMap<String, f64>
    pub status: EvaluationDatapointStatus,
    pub executor_output: Option<Value>,
    pub error: Option<Value>,
}

pub async fn create_evaluation(
    pool: &PgPool,
    name: &String,
    status: EvaluationStatus,
    project_id: Uuid,
) -> Result<Evaluation> {
    // FIXME: This is done simply to return eval info to the caller,
    // even when the evaluation already exists.
    // `DO UPDATE set dummy` is not a good way to handle this, as the update is not atomic.
    // See: https://stackoverflow.com/questions/34708509/how-to-use-returning-with-on-conflict-in-postgresql
    // Possible alternatives:
    // (1) ON CONFLICT DO NOTHING and then query the evaluation separately,
    // (2) figure out how the solution from https://stackoverflow.com/a/62205017/18249562 works with sqlx.
    //     Currently because UNION will not necessarily work,
    //     it infers the return type as Option<T> for each col.
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "INSERT INTO evaluations (name, status, project_id, score_names)
        VALUES ($1, $2::evaluation_job_status, $3, $4)
        ON CONFLICT (name, project_id) DO UPDATE SET name = $1
        RETURNING
            id,
            created_at,
            name,
            status,
            project_id,
            score_names",
    )
    .bind(name)
    .bind(&status)
    .bind(project_id)
    .bind(serde_json::Value::Array(Vec::new()))
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluation(db: Arc<DB>, evaluation_id: Uuid) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "SELECT
            id, name, status, project_id, created_at, score_names
        FROM evaluations WHERE id = $1",
    )
    .bind(evaluation_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluation_by_name(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "SELECT id, name, status, project_id, created_at, score_names
        FROM evaluations WHERE project_id = $1 AND name = $2",
    )
    .bind(project_id)
    .bind(name)
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluations(pool: &PgPool, project_id: Uuid) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as::<_, Evaluation>(
        "SELECT id, name, status, project_id, created_at, score_names
        FROM evaluations WHERE project_id = $1
        ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn get_finished_evaluation_infos(
    pool: &PgPool,
    project_id: Uuid,
    exclude_id: Uuid,
) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as::<_, Evaluation>(
        "SELECT id, name, status, project_id, created_at, score_names
        FROM evaluations
        WHERE project_id = $1 AND status = 'Finished'::evaluation_job_status AND id != $2
        ORDER BY created_at DESC",
    )
    .bind(project_id)
    .bind(exclude_id)
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn update_evaluation_status_by_name(
    pool: &PgPool,
    evaluation_name: String,
    project_id: Uuid,
    status: EvaluationStatus,
) -> Result<()> {
    sqlx::query(
        "UPDATE evaluations
        SET status = $3
        WHERE name = $1 AND project_id = $2",
    )
    .bind(evaluation_name)
    .bind(project_id)
    .bind(status)
    .execute(pool)
    .await?;

    Ok(())
}

/// Record evaluation results in the database.
///
/// Each target data may contain an empty JSON object, if there is no target data.
pub async fn set_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
    statuses: &Vec<EvaluationDatapointStatus>,
    scores: &Vec<HashMap<String, f64>>,
    datas: &Vec<Value>,
    targets: &Vec<Value>,
    executor_trace_ids: &Vec<Option<Uuid>>,
    evaluator_trace_ids: &Vec<Option<Uuid>>,
    executor_outputs: &Vec<Option<Value>>,
    error: &Vec<Option<Value>>,
) -> Result<()> {
    let scores = scores
        .iter()
        .map(|score| serde_json::to_value(score.clone()).unwrap())
        .collect::<Vec<_>>();

    let res = sqlx::query(
        r#"INSERT INTO evaluation_results (
            evaluation_id,
            status,
            scores,
            data,
            target,
            executor_output,
            evaluator_trace_id,
            executor_trace_id,
            index_in_batch,
            error
        )
        SELECT 
            $10 as evaluation_id,
            status as "status: EvaluationStatus",
            scores,
            data,
            target,
            executor_output,
            evaluator_trace_id,
            executor_trace_id,
            index_in_batch,
            error
        FROM
        UNNEST ($1::evaluation_status[], $2::jsonb[], $3::jsonb[], $4::jsonb[], $5::jsonb[], $6::uuid[], $7::uuid[], $8::int8[], $9::jsonb[])
        AS tmp_table(status, scores, data, target, executor_output, evaluator_trace_id, executor_trace_id, index_in_batch, error)"#,
    )
    .bind(statuses)
    .bind(scores)
    .bind(datas)
    .bind(targets)
    .bind(executor_outputs)
    .bind(evaluator_trace_ids)
    .bind(executor_trace_ids)
    .bind(Vec::from_iter(0..statuses.len() as i64))
    .bind(error)
    .bind(evaluation_id)
    .execute(pool)
    .await;

    if let Err(e) = res {
        log::error!("Error inserting evaluation results: {}", e);
    }

    // let new_score_names: HashSet<String> = scores
    //     .iter()
    //     .flat_map(|score| score.as_object().unwrap().keys())
    //     .map(|s| s.to_string())
    //     .collect();

    // let res = add_score_names_to_evaluation(pool, evaluation_id, new_score_names).await;

    // if let Err(e) = res {
    //     log::error!("Error adding score names to evaluation: {}", e);
    // }

    Ok(())
}

pub async fn get_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
) -> Result<Vec<EvaluationDatapointPreview>> {
    let results = sqlx::query_as::<_, EvaluationDatapointPreview>(
        "SELECT
            id,
            created_at,
            evaluation_id,
            status,
            data,
            target,
            scores,
            executor_output,
            error
        FROM evaluation_results
        WHERE evaluation_id = $1
        ORDER BY created_at ASC, index_in_batch ASC NULLS FIRST",
    )
    .bind(evaluation_id)
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

#[derive(FromRow)]
pub struct EvaluationDatapointScores {
    pub scores: Value,
}

pub async fn get_evaluation_datapoint_scores(
    pool: &PgPool,
    evaluation_id: Uuid,
) -> Result<Vec<EvaluationDatapointScores>> {
    let scores = sqlx::query_as::<_, EvaluationDatapointScores>(
        "SELECT
            scores
        FROM evaluation_results
        WHERE evaluation_id = $1",
    )
    .bind(evaluation_id)
    .fetch_all(pool)
    .await?;

    Ok(scores)
}

pub async fn get_evaluation_datapoint(
    pool: &PgPool,
    evaluation_result_id: Uuid,
) -> Result<EvaluationDatapointPreview> {
    let preview = sqlx::query_as::<_, EvaluationDatapointPreview>(
        "SELECT
            id,
            created_at,
            evaluation_id,
            status,
            scores,
            data,
            target,
            executor_output,
            error
        FROM evaluation_results
        WHERE id = $1",
    )
    .bind(evaluation_result_id)
    .fetch_one(pool)
    .await?;

    Ok(preview)
}
