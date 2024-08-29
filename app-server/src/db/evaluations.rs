use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use crate::{evaluations::EvaluationStats, pipeline::nodes::NodeInput};

use super::{trace::DBRunTrace, DB};

pub async fn delete_evaluation(pool: &PgPool, evaluation_id: &Uuid) -> Result<()> {
    sqlx::query!("DELETE FROM evaluations WHERE id = $1", evaluation_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub id: Uuid,
    pub name: String,
    pub status: String,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub evaluator_pipeline_version_id: Uuid,
    pub executor_pipeline_version_id: Option<Uuid>,
}

#[derive(Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationWithPipelineInfo {
    pub id: Uuid,
    pub name: String,
    pub status: String,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub evaluator_pipeline_version_id: Uuid,
    pub evaluator_pipeline_name: String,
    pub evaluator_pipeline_version_name: String,
    pub executor_pipeline_version_id: Option<Uuid>,
    pub executor_pipeline_name: Option<String>,
    pub executor_pipeline_version_name: Option<String>,
}

#[derive(Serialize, FromRow, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointPreview {
    pub id: Uuid,
    pub evaluation_id: Uuid,
    pub status: String,
    pub score: Option<f64>,
    pub data: Value,
    pub target: Value,
    pub executor_output: Option<Value>,
}

pub struct EvaluationDatapointWithError {
    pub id: Uuid,
    pub evaluation_id: Uuid,
    pub status: String,
    pub score: Option<f64>,
    pub data: Value,
    pub target: Value,
    pub executor_output: Option<Value>,
    pub error: Option<Value>,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapoint {
    pub id: Uuid,
    pub evaluation_id: Uuid,
    pub status: String,
    pub score: Option<f64>,
    pub data: Value,
    pub target: Value,
    pub executor_output: Option<Value>,
    pub evaluator_trace: Option<DBRunTrace>,
    pub executor_trace: Option<DBRunTrace>,
    pub error: Option<Value>,
}

pub async fn create_evaluation(
    pool: &PgPool,
    name: &String,
    status: &str,
    project_id: Uuid,
    evaluator_pipeline_version_id: Uuid,
    executor_pipeline_version_id: Option<Uuid>,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as!(
        Evaluation,
        "INSERT INTO evaluations (name, status, project_id, evaluator_pipeline_version_id, executor_pipeline_version_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, status, project_id, created_at, evaluator_pipeline_version_id, executor_pipeline_version_id",
        name,
        status,
        project_id,
        evaluator_pipeline_version_id,
        executor_pipeline_version_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluation(db: Arc<DB>, evaluation_id: Uuid) -> Result<Evaluation> {
    let evaluation = sqlx::query_as!(
        Evaluation,
        "SELECT id, name, status, project_id, created_at, evaluator_pipeline_version_id, executor_pipeline_version_id
        FROM evaluations WHERE id = $1",
        evaluation_id,
    )
    .fetch_one(&db.pool)
    .await?;

    Ok(evaluation)
}

pub async fn get_evaluations_with_pipeline_info(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<EvaluationWithPipelineInfo>> {
    let evaluations = sqlx::query_as!(
        EvaluationWithPipelineInfo,
        r#"SELECT
            e.id,
            e.name,
            e.status,
            e.project_id,
            e.created_at,
            evalpv.id as evaluator_pipeline_version_id,
            evalp.name as evaluator_pipeline_name,
            evalpv.name as evaluator_pipeline_version_name,
            execpv.id as "executor_pipeline_version_id?",
            execp.name as "executor_pipeline_name?",
            execpv.name as "executor_pipeline_version_name?"
        FROM evaluations e
        JOIN pipeline_versions evalpv ON e.evaluator_pipeline_version_id = evalpv.id
        JOIN pipelines evalp ON evalpv.pipeline_id = evalp.id
        LEFT JOIN pipeline_versions execpv ON e.executor_pipeline_version_id = execpv.id
        LEFT JOIN pipelines execp ON execpv.pipeline_id = execp.id
        WHERE e.project_id = $1
        ORDER BY e.created_at DESC"#,
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
        "SELECT id, name, status, project_id, created_at, evaluator_pipeline_version_id, executor_pipeline_version_id
        FROM evaluations
        WHERE project_id = $1 AND status = 'Finished' AND id != $2
        ORDER BY created_at DESC",
        project_id,
        exclude_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn update_evaluation_status(
    pool: &PgPool,
    evaluation_id: Uuid,
    status: &str,
) -> Result<()> {
    sqlx::query!(
        "UPDATE evaluations
        SET status = $2
        WHERE id = $1",
        evaluation_id,
        status,
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
    statuses: &Vec<String>,
    scores: &Vec<Option<f64>>,
    datas: &Vec<Value>,
    targets: &Vec<Value>,
    executor_outputs: &Vec<Option<HashMap<String, NodeInput>>>,
    evaluator_run_id: &Vec<Option<Uuid>>,
    executor_run_id: &Vec<Option<Uuid>>,
    error: &Vec<Option<Value>>,
) -> Result<()> {
    let executor_outputs = executor_outputs
        .iter()
        .map(|output| {
            output
                .clone()
                .map(|output| serde_json::to_value(output).unwrap())
        })
        .collect::<Vec<_>>();

    let res = sqlx::query!(
        "INSERT INTO evaluation_results (
            evaluation_id,
            status,
            score,
            data,
            target,
            executor_output,
            evaluator_run_id,
            executor_run_id,
            index_in_batch,
            error
        )
        SELECT 
            $10 as evaluation_id,
            status,
            score,
            data,
            target,
            executor_output,
            evaluator_run_id,
            executor_run_id,
            index_in_batch,
            error
        FROM
        UNNEST ($1::text[], $2::float8[], $3::jsonb[], $4::jsonb[], $5::jsonb[], $6::uuid[], $7::uuid[], $8::int8[], $9::jsonb[])
        AS tmp_table(status, score, data, target, executor_output, evaluator_run_id, executor_run_id, index_in_batch, error)",
        statuses,
        scores as &[Option<f64>],
        datas,
        targets,
        &executor_outputs as &[Option<Value>],
        evaluator_run_id as &[Option<Uuid>],
        executor_run_id as &[Option<Uuid>],
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

pub async fn get_evaluation_stats(
    db: Arc<DB>,
    evaluation_id: Uuid,
) -> Result<Option<EvaluationStats>> {
    let stats = sqlx::query_as!(
        EvaluationStats,
        "SELECT AVG(results.score) as average_score,
            AVG(EXTRACT(EPOCH FROM (executor_trace.end_time - executor_trace.start_time)))::float8 as average_executor_time,
            AVG(EXTRACT(EPOCH FROM (evaluator_trace.end_time - evaluator_trace.start_time)))::float8 as average_evaluator_time,
            SUM(executor_trace.total_token_count)::int8 as executor_tokens,
            SUM(evaluator_trace.total_token_count)::int8 as evaluator_tokens,
            SUM(executor_trace.approximate_cost)::float8 as executor_cost,
            SUM(evaluator_trace.approximate_cost)::float8 as evaluator_cost
        FROM evaluation_results results
        LEFT JOIN traces executor_trace ON results.executor_run_id = executor_trace.run_id
        LEFT JOIN traces evaluator_trace ON results.evaluator_run_id = evaluator_trace.run_id
        WHERE evaluation_id = $1",
        evaluation_id,
    )
    .fetch_optional(&db.pool)
    .await?;

    Ok(stats)
}

pub async fn get_evaluation_results(
    pool: &PgPool,
    evaluation_id: Uuid,
) -> Result<Vec<EvaluationDatapointPreview>> {
    let results = sqlx::query_as!(
        EvaluationDatapointPreview,
        "SELECT
            id,
            evaluation_id,
            status,
            score,
            data,
            target,
            executor_output
        FROM evaluation_results r
        WHERE evaluation_id = $1
        ORDER BY created_at ASC, index_in_batch ASC NULLS FIRST",
        evaluation_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}

pub async fn get_evaluation_datapoint(
    pool: &PgPool,
    evaluation_result_id: Uuid,
) -> Result<EvaluationDatapoint> {
    // TODO: try to optimize into a single query. This will most likely require
    // a custom `FromRow` implementation
    let executor_trace = sqlx::query_as!(
        DBRunTrace,
        "SELECT
            run_id,
            created_at,
            pipeline_version_id,
            run_type,
            success,
            output_message_ids,
            start_time,
            end_time,
            total_token_count,
            approximate_cost,
            metadata
        FROM traces
        WHERE run_id = (SELECT executor_run_id FROM evaluation_results WHERE id = $1)",
        evaluation_result_id,
    )
    .fetch_optional(pool)
    .await?;

    let evaluator_trace = sqlx::query_as!(
        DBRunTrace,
        "SELECT
            run_id,
            created_at,
            pipeline_version_id,
            run_type,
            success,
            output_message_ids,
            start_time,
            end_time,
            total_token_count,
            approximate_cost,
            metadata
        FROM traces
        WHERE run_id = (SELECT evaluator_run_id FROM evaluation_results WHERE id = $1)",
        evaluation_result_id,
    )
    .fetch_optional(pool)
    .await?;

    let preview = sqlx::query_as!(
        EvaluationDatapointWithError,
        "SELECT
            id,
            evaluation_id,
            status,
            score,
            data,
            target,
            executor_output,
            error
        FROM evaluation_results r
        WHERE id = $1",
        evaluation_result_id,
    )
    .fetch_one(pool)
    .await?;

    let result = EvaluationDatapoint {
        id: preview.id,
        evaluation_id: preview.evaluation_id,
        status: preview.status,
        score: preview.score,
        data: preview.data,
        target: preview.target,
        executor_output: preview.executor_output,
        error: preview.error,
        evaluator_trace,
        executor_trace,
    };

    Ok(result)
}
