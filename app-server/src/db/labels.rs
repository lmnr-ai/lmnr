use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, Debug, Clone, PartialEq)]
#[sqlx(type_name = "label_type")]
pub enum LabelType {
    BOOLEAN,
    CATEGORICAL,
}

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
    pub label_type: LabelType,
    pub value_map: Value, // HashMap<String, f64>
    pub description: Option<String>,
    pub evaluator_runnable_graph: Option<Value>,
}

// (type_id, span_id) is a unique constraint
#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DBSpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub value: Option<f64>,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub label_source: LabelSource,
    pub reasoning: Option<String>,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpanLabel {
    pub id: Uuid,
    pub span_id: Uuid,
    pub value: Option<f64>,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub label_source: LabelSource,
    pub reasoning: Option<String>,

    pub label_type: LabelType,
    pub class_name: String,
    pub value_map: Value, // Vec<Value>
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
            label_type,
            value_map,
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
            label_type,
            value_map,
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

pub async fn delete_span_label(
    pool: &PgPool,
    span_id: Uuid,
    class_id: Uuid,
) -> Result<DBSpanLabel> {
    let span_label = sqlx::query_as::<_, DBSpanLabel>(
        "DELETE FROM labels
        WHERE span_id = $1 AND id = $2
        RETURNING
            id,
            span_id,
            value,
            class_id,
            created_at,
            updated_at,
            user_id,
            label_source,
            reasoning",
    )
    .bind(span_id)
    .bind(class_id)
    .fetch_one(pool)
    .await?;

    Ok(span_label)
}

pub async fn update_span_label(
    pool: &PgPool,
    id: Uuid,
    span_id: Uuid,
    value: f64,
    user_id: Option<Uuid>,
    class_id: Uuid,
    label_source: &LabelSource,
    reasoning: Option<String>,
) -> Result<DBSpanLabel> {
    let span_label = sqlx::query_as::<_, DBSpanLabel>(
        "INSERT INTO labels
            (id, span_id, class_id, user_id, value, updated_at, label_source, reasoning)
        VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
        ON CONFLICT (span_id, class_id, user_id)
        DO UPDATE SET value = $5, updated_at = now(), label_source = $6,
            reasoning = COALESCE($7, labels.reasoning)
        RETURNING
            id,
            span_id,
            value,
            class_id,
            created_at,
            updated_at,
            user_id,
            label_source,
            reasoning",
    )
    .bind(id)
    .bind(span_id)
    .bind(class_id)
    .bind(user_id)
    .bind(value)
    .bind(label_source)
    .bind(reasoning)
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
            labels.reasoning,
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

#[derive(FromRow)]
pub struct SpanLabelInstance {
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub value: f64,
    pub reasoning: Option<String>,
}

/// filter down `span_ids` to only those that are labeled with `label_class_id`
pub async fn get_labeled_spans(
    pool: &PgPool,
    project_id: Uuid,
    span_ids: &Vec<Uuid>,
    label_class_id: Uuid,
    manual_only: bool,
) -> Result<Vec<SpanLabelInstance>> {
    let spans = sqlx::query_as::<_, SpanLabelInstance>(
        "SELECT
            spans.input,
            spans.output,
            labels.value,
            labels.reasoning
        FROM spans
        JOIN labels ON spans.span_id = labels.span_id
            -- only get the latest label for now
            AND labels.updated_at = (
                SELECT MAX(updated_at)
                FROM labels
                WHERE span_id = spans.span_id
                AND CASE WHEN $4 THEN labels.label_source = 'MANUAL' ELSE TRUE END
                AND class_id = $3
            )
        JOIN label_classes ON labels.class_id = label_classes.id AND label_classes.id = $3
        WHERE label_classes.project_id = $1
        AND spans.span_id = ANY($2)
        AND labels.value IS NOT NULL",
    )
    .bind(project_id)
    .bind(&span_ids)
    .bind(label_class_id)
    .bind(manual_only)
    .fetch_all(pool)
    .await?;

    Ok(spans)
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
