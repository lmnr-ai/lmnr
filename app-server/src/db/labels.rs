use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

#[derive(sqlx::Type, Serialize, Deserialize, Clone, PartialEq)]
#[sqlx(type_name = "label_source")]
pub enum LabelSource {
    MANUAL,
    AUTO,
    CODE,
}

#[derive(Serialize, FromRow, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LabelClass {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    pub description: Option<String>,
    pub evaluator_runnable_graph: Option<Value>,
}

// (type_id, span_id) is a unique constraint
#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DBSpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub label_source: LabelSource,
    pub reasoning: Option<String>,
    pub project_id: Uuid,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub label_source: LabelSource,
    pub reasoning: Option<String>,

    pub class_name: String,
    pub description: Option<String>,

    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub user_email: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredLabelClassForPath {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub path: String,
    pub project_id: Uuid,
    pub label_class_id: Uuid,
}

pub async fn get_label_classes_by_project_id(
    pool: &PgPool,
    project_id: Uuid,
    label_class_ids: Option<Vec<Uuid>>,
) -> Result<Vec<LabelClass>> {
    let mut query = QueryBuilder::new(
        "SELECT
            id,
            created_at,
            name,
            project_id,
            description,
            evaluator_runnable_graph
        FROM label_classes
        WHERE project_id = ",
    );
    query.push_bind(project_id);
    if let Some(label_class_ids) = label_class_ids {
        query.push(" AND id = ANY(");
        query.push_bind(label_class_ids);
        query.push(")");
    }
    query.push(" ORDER BY created_at DESC");
    let label_classes = query.build_query_as::<LabelClass>().fetch_all(pool).await?;

    Ok(label_classes)
}

pub async fn get_label_class(
    pool: &PgPool,
    project_id: Uuid,
    label_class_id: Uuid,
) -> Result<Option<LabelClass>> {
    let label_class = sqlx::query_as::<_, LabelClass>(
        "SELECT * FROM label_classes WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(label_class_id)
    .fetch_optional(pool)
    .await?;

    Ok(label_class)
}

pub async fn update_label_class(
    pool: &PgPool,
    project_id: Uuid,
    class_id: Uuid,
    description: Option<String>,
    evaluator_runnable_graph: Option<Value>,
) -> Result<Option<LabelClass>> {
    let label_class = sqlx::query_as::<_, LabelClass>(
        "UPDATE label_classes
        SET description = $1, evaluator_runnable_graph = $2
        WHERE project_id = $3 AND id = $4
        RETURNING
            id,
            created_at,
            name,
            project_id,
            description,
            evaluator_runnable_graph",
    )
    .bind(description)
    .bind(evaluator_runnable_graph)
    .bind(project_id)
    .bind(class_id)
    .fetch_optional(pool)
    .await?;

    Ok(label_class)
}

pub async fn update_span_label(
    pool: &PgPool,
    id: Uuid,
    span_id: Uuid,
    user_email: Option<String>,
    class_id: Option<Uuid>,
    label_source: &LabelSource,
    reasoning: Option<String>,
    project_id: Uuid,
    label_name: &String,
) -> Result<DBSpanLabel> {
    let class_id = match class_id {
        Some(class_id) => class_id,
        None => {
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO label_classes (project_id, name) VALUES ($1, $2) ON CONFLICT (project_id, name) DO NOTHING RETURNING id",
            )
            .bind(project_id)
            .bind(label_name)
            .fetch_one(pool)
            .await?
        }
    };
    let span_label = sqlx::query_as::<_, DBSpanLabel>(
        "INSERT INTO labels
            (id,
            span_id,
            class_id,
            user_id,
            updated_at,
            label_source,
            reasoning,
            project_id
        )
        VALUES ($1, $2, $3, (SELECT id FROM users WHERE email = $4 LIMIT 1), now(), $5, $6, $7)
        ON CONFLICT (span_id, class_id)
        DO UPDATE SET
            updated_at = now(),
            label_source = $5,
            reasoning = COALESCE($6, labels.reasoning),
            user_id = EXCLUDED.user_id
        RETURNING
            id,
            span_id,
            class_id,
            created_at,
            updated_at,
            user_id,
            label_source,
            reasoning,
            project_id",
    )
    .bind(id)
    .bind(span_id)
    .bind(class_id)
    .bind(user_email)
    .bind(label_source)
    .bind(reasoning)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(span_label)
}

pub async fn register_label_class_for_path(
    pool: &PgPool,
    project_id: Uuid,
    label_class_id: Uuid,
    path: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO label_classes_for_path (project_id, label_class_id, path)
        VALUES ($1, $2, $3)",
    )
    .bind(project_id)
    .bind(label_class_id)
    .bind(path)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn remove_label_class_from_path(
    pool: &PgPool,
    project_id: Uuid,
    label_class_id: Uuid,
    id: Uuid,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM label_classes_for_path
        WHERE project_id = $1 AND label_class_id = $2 AND id = $3",
    )
    .bind(project_id)
    .bind(label_class_id)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_registered_label_classes_for_path(
    pool: &PgPool,
    project_id: Uuid,
    path: &str,
) -> Result<Vec<RegisteredLabelClassForPath>> {
    let registered_paths = sqlx::query_as::<_, RegisteredLabelClassForPath>(
        "SELECT * FROM label_classes_for_path
        WHERE project_id = $1 AND path = $2",
    )
    .bind(project_id)
    .bind(path)
    .fetch_all(pool)
    .await?;

    Ok(registered_paths)
}
