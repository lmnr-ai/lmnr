use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, Debug, Clone, PartialEq)]
#[sqlx(type_name = "label_type")]
pub enum LabelType {
    #[serde(rename = "Boolean")]
    BOOLEAN,
    #[serde(rename = "Categorical")]
    CATEGORICAL,
}

#[derive(sqlx::Type, Serialize, Debug, Clone, PartialEq)]
#[sqlx(type_name = "label_source")]
pub enum LabelSource {
    #[serde(rename = "Manual")]
    MANUAL,
    #[serde(rename = "Auto")]
    AUTO,
}

#[derive(Serialize, sqlx::FromRow, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LabelClass {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    pub label_type: LabelType,
    pub value_map: Value, // Vec<Value>
    pub description: Option<String>,
}

// (type_id, span_id) is a unique constraint
#[derive(Serialize, sqlx::FromRow, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DBSpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub value: f64,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub label_source: LabelSource,
}

#[derive(Serialize, sqlx::FromRow, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub value: f64,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub label_type: LabelType,
    pub class_name: String,
    pub value_map: Value, // Vec<Value>
    pub description: Option<String>,

    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub user_email: Option<String>,
    pub label_source: LabelSource,
}

pub async fn get_label_classes_by_project_id(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<LabelClass>> {
    let label_classes = sqlx::query_as::<_, LabelClass>(
        "SELECT
            id,
            created_at,
            name,
            project_id,
            label_type,
            value_map,
            description
        FROM label_classes
        WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(label_classes)
}

pub async fn create_label_class(
    pool: &PgPool,
    id: Uuid,
    name: String,
    project_id: Uuid,
    label_type: &LabelType,
    value_map: Vec<Value>,
    description: Option<String>,
) -> Result<LabelClass> {
    let label_class = sqlx::query_as::<_, LabelClass>(
        "INSERT INTO label_classes (
            id,
            name,
            project_id,
            label_type,
            value_map,
            description
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, name, project_id, label_type, value_map, description",
    )
    .bind(id)
    .bind(name)
    .bind(project_id)
    .bind(label_type)
    .bind(serde_json::to_value(value_map).unwrap())
    .bind(description)
    .fetch_one(pool)
    .await?;

    Ok(label_class)
}

pub async fn update_label_class(
    pool: &PgPool,
    project_id: Uuid,
    class_id: Uuid,
    description: Option<String>,
) -> Result<Option<LabelClass>> {
    let label_class = sqlx::query_as::<_, LabelClass>(
        "UPDATE label_classes
        SET description = $1
        WHERE project_id = $2 AND id = $3
        RETURNING id, created_at, name, project_id, label_type, value_map, description",
    )
    .bind(description)
    .bind(project_id)
    .bind(class_id)
    .fetch_optional(pool)
    .await?;

    Ok(label_class)
}

pub async fn delete_span_label(
    pool: &PgPool,
    span_id: Uuid,
    class_id: Uuid,
) -> Result<DBSpanLabel> {
    let span_label = sqlx::query_as::<_, DBSpanLabel>(
        "DELETE FROM labels
        WHERE span_id = $1 AND id = $2
        RETURNING id, span_id, value, class_id, created_at, updated_at, user_id, label_source",
    )
    .bind(span_id)
    .bind(class_id)
    .fetch_one(pool)
    .await?;

    Ok(span_label)
}

pub async fn update_span_label(
    pool: &PgPool,
    span_id: Uuid,
    value: f64,
    user_id: Option<Uuid>,
    class_id: Uuid,
    label_source: LabelSource,
) -> Result<DBSpanLabel> {
    let span_label = sqlx::query_as::<_, DBSpanLabel>(
        "INSERT INTO labels (span_id, class_id, user_id, value, updated_at, label_source)
        VALUES ($1, $2, $3, $4, now(), $5)
        ON CONFLICT (span_id, class_id, user_id)
        DO UPDATE SET value = $4, updated_at = now(), label_source = $5
        RETURNING id, span_id, value, class_id, created_at, updated_at, user_id, label_source",
    )
    .bind(span_id)
    .bind(class_id)
    .bind(user_id)
    .bind(value)
    .bind(label_source)
    .fetch_one(pool)
    .await?;

    Ok(span_label)
}

pub async fn get_span_labels(pool: &PgPool, span_id: Uuid) -> Result<Vec<SpanLabel>> {
    let span_labels = sqlx::query_as::<_, SpanLabel>(
        "SELECT
            labels.id,
            labels.span_id,
            labels.value,
            labels.class_id,
            labels.created_at,
            labels.updated_at,
            labels.user_id,
            labels.label_source,
            users.email as user_email,
            label_classes.label_type,
            label_classes.value_map,
            label_classes.name as class_name,
            label_classes.description
        FROM labels
        JOIN label_classes ON labels.class_id = label_classes.id
        LEFT JOIN users ON labels.user_id = users.id
        WHERE span_id = $1
        ORDER BY labels.created_at ASC",
    )
    .bind(span_id)
    .fetch_all(pool)
    .await?;

    Ok(span_labels)
}
