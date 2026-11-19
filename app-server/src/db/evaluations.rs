use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{PgPool, prelude::FromRow, types::Json};
use uuid::Uuid;

use crate::{evaluations::DEFAULT_GROUP_NAME, hosted_evals::HostedMetadata};

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
    /// The eval dataset (name) the evaluation ran, if any.
    pub dataset_v2_id: Option<String>,
}

#[derive(FromRow)]
pub struct EvaluationInfo {
    pub group_id: String,
}

pub struct NewEvaluation<'a> {
    pub name: &'a str,
    pub project_id: Uuid,
    pub group_id: &'a str,
    pub metadata: Option<&'a Value>,
    pub hosted_metadata: Option<&'a HostedMetadata>,
    pub dataset_v2_id: Option<&'a str>,
}

pub async fn create_evaluation(
    pool: &PgPool,
    evaluation: &NewEvaluation<'_>,
) -> Result<Evaluation> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "INSERT INTO evaluations
            (name, project_id, group_id, metadata, hosted_metadata, dataset_v2_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            created_at,
            name,
            project_id,
            group_id,
            metadata,
            dataset_v2_id",
    )
    .bind(evaluation.name)
    .bind(evaluation.project_id)
    .bind(evaluation.group_id)
    .bind(evaluation.metadata)
    .bind(evaluation.hosted_metadata.map(Json))
    .bind(evaluation.dataset_v2_id)
    .fetch_one(pool)
    .await?;

    Ok(evaluation)
}

/// Update evaluation name and/or metadata. Fields left as `None` are kept.
/// `group_id` is deliberately not updatable. Returns `None` when the
/// evaluation doesn't exist in the project.
pub async fn update_evaluation(
    pool: &PgPool,
    evaluation_id: Uuid,
    project_id: Uuid,
    name: &Option<String>,
    metadata: &Option<Value>,
) -> Result<Option<Evaluation>> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "UPDATE evaluations
        SET
            name = COALESCE($3, name),
            metadata = COALESCE($4, metadata)
        WHERE id = $1 AND project_id = $2
        RETURNING
            id,
            created_at,
            name,
            project_id,
            group_id,
            metadata,
            dataset_v2_id",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .bind(name)
    .bind(metadata)
    .fetch_optional(pool)
    .await?;

    Ok(evaluation)
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
    .fetch_optional(pool)
    .await?;

    Ok(eval_info
        .map(|e| e.group_id)
        .unwrap_or(DEFAULT_GROUP_NAME.to_string()))
}

pub async fn is_shared_evaluation(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
) -> Result<bool> {
    let shared_eval = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM shared_evals WHERE project_id = $1 AND id = $2 LIMIT 1)",
    )
    .bind(project_id)
    .bind(evaluation_id)
    .fetch_one(pool)
    .await?;

    Ok(shared_eval)
}
