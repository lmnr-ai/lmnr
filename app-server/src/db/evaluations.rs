use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{PgPool, prelude::FromRow};
use uuid::Uuid;

use crate::evaluations::DEFAULT_GROUP_NAME;

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
    /// Evaluation-level tag names, in attachment order. Writes go through
    /// `db::evaluation_tags`; the names resolve to colors via `tag_classes`.
    pub tags: Vec<String>,
}

#[derive(FromRow)]
pub struct EvaluationInfo {
    pub group_id: String,
}

/// List a project's evaluations, newest first. `name` is a case-insensitive
/// substring match; `tags` narrows to evaluations carrying ALL of the given tags.
pub async fn list_evaluations(
    pool: &PgPool,
    project_id: Uuid,
    group_id: Option<&str>,
    name: Option<&str>,
    tags: &[String],
    limit: i64,
    offset: i64,
) -> Result<Vec<Evaluation>> {
    let evaluations = sqlx::query_as::<_, Evaluation>(
        "SELECT id, created_at, name, project_id, group_id, metadata, tags
        FROM evaluations
        WHERE project_id = $1
            AND ($2::text IS NULL OR group_id = $2)
            AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%')
            AND tags @> $4::text[]
        ORDER BY created_at DESC
        LIMIT $5 OFFSET $6",
    )
    .bind(project_id)
    .bind(group_id)
    .bind(name)
    .bind(tags)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(evaluations)
}

pub async fn get_evaluation(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
) -> Result<Option<Evaluation>> {
    let evaluation = sqlx::query_as::<_, Evaluation>(
        "SELECT id, created_at, name, project_id, group_id, metadata, tags
        FROM evaluations
        WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(evaluation_id)
    .fetch_optional(pool)
    .await?;

    Ok(evaluation)
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
            metadata,
            tags",
    )
    .bind(name)
    .bind(project_id)
    .bind(group_id)
    .bind(metadata)
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
            tags",
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
