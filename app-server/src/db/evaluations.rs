use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{postgres::PgHasArrayType, prelude::FromRow, PgPool};
use uuid::Uuid;

use super::DB;

pub async fn delete_evaluation(pool: &PgPool, evaluation_id: &Uuid) -> Result<()> {
    sqlx::query("DELETE FROM evaluations WHERE id = $1")
        .bind(evaluation_id)
        .execute(pool)
        .await?;
    Ok(())
}

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

impl PgHasArrayType for EvaluationDatapointStatus {
    fn array_type_info() -> sqlx::postgres::PgTypeInfo {
        sqlx::postgres::PgTypeInfo::with_name("_evaluation_status")
    }
}

#[derive(Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub status: EvaluationStatus,
    pub project_id: Uuid,
    pub metadata: Option<Value>,
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
    metadata: Option<Value>,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as!(
        Evaluation,
        r#"INSERT INTO evaluations (name, status, project_id, metadata)
        VALUES ($1, $2::evaluation_job_status, $3, $4)
        ON CONFLICT (name, project_id) DO UPDATE set metadata = $4
        RETURNING id, created_at, name, status as "status: EvaluationStatus", project_id, metadata"#,
        name,
        &status as &EvaluationStatus,
        project_id,
        metadata
    )
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluation(db: Arc<DB>, evaluation_id: Uuid) -> Result<Evaluation> {
    let evaluation = sqlx::query_as!(
        Evaluation,
        r#"SELECT id, name, status as "status: EvaluationStatus", project_id, created_at, metadata
        FROM evaluations WHERE id = $1"#,
        evaluation_id
    )
    .fetch_one(&db.pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluation_by_name(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as!(
        Evaluation,
        r#"SELECT id, name, status as "status: EvaluationStatus", project_id, created_at, metadata
        FROM evaluations WHERE project_id = $1 AND name = $2"#,
        project_id,
        name
    )
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluations(pool: &PgPool, project_id: Uuid) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as!(
        Evaluation,
        r#"SELECT id, name, status as "status: EvaluationStatus", project_id, created_at, metadata
        FROM evaluations WHERE project_id = $1"#,
        project_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn get_finished_evaluation_infos(
    pool: &PgPool,
    project_id: Uuid,
    exclude_id: Uuid,
) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as!(
        Evaluation,
        r#"SELECT id, name, status as "status: EvaluationStatus", project_id, created_at, metadata
        FROM evaluations
        WHERE project_id = $1 AND status = 'Finished'::evaluation_job_status AND id != $2
        ORDER BY created_at DESC"#,
        project_id,
        exclude_id,
    )
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
    sqlx::query!(
        "UPDATE evaluations
        SET status = $3
        WHERE name = $1 AND project_id = $2",
        evaluation_name,
        project_id,
        status as EvaluationStatus,
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Record evaluation results in the database.
///
/// Each target data may contain an empty JSON file, if there is no target data.
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

    let res = sqlx::query!(
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
            status as "status: EvaluationDatapointStatus",
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
        &statuses as &[EvaluationDatapointStatus],
        &scores,
        datas,
        targets,
        &executor_outputs as &[Option<Value>],
        evaluator_trace_ids as &[Option<Uuid>],
        executor_trace_ids as &[Option<Uuid>],
        &Vec::from_iter(0..statuses.len() as i64),
        error as &[Option<Value>],
        evaluation_id
    )
    .execute(pool)
    .await;

    if let Err(e) = res {
        log::error!("Error inserting evaluation results: {}", e);
    }

    Ok(())
}

pub async fn get_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
) -> Result<Vec<EvaluationDatapointPreview>> {
    let results = sqlx::query_as!(
        EvaluationDatapointPreview,
        r#"SELECT
            id,
            created_at,
            evaluation_id,
            status as "status: EvaluationDatapointStatus",
            data,
            target,
            scores,
            executor_output,
            error
        FROM evaluation_results
        WHERE evaluation_id = $1
        ORDER BY created_at ASC, index_in_batch ASC NULLS FIRST"#,
        evaluation_id
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}

pub async fn get_evaluation_datapoint(
    pool: &PgPool,
    evaluation_result_id: Uuid,
) -> Result<EvaluationDatapointPreview> {
    let preview = sqlx::query_as!(
        EvaluationDatapointPreview,
        r#"SELECT
            id,
            created_at,
            evaluation_id,
            status as "status: EvaluationDatapointStatus",
            scores,
            data,
            target,
            executor_output,
            error
        FROM evaluation_results
        WHERE id = $1"#,
        evaluation_result_id
    )
    .fetch_one(pool)
    .await?;

    Ok(preview)
}
