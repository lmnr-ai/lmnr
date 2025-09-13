use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

#[derive(sqlx::Type, Serialize, Deserialize, Clone, PartialEq)]
#[sqlx(type_name = "tag_source")]
pub enum TagSource {
    MANUAL,
    AUTO,
    CODE,
}

#[derive(Serialize, FromRow, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagClass {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
}

// (type_id, span_id) is a unique constraint
#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DBSpanTag {
    pub id: Uuid,
    pub span_id: Uuid,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub source: TagSource,
    pub project_id: Uuid,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SpanTag {
    pub id: Uuid,
    pub span_id: Uuid,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub source: TagSource,

    pub class_name: String,

    pub updated_at: DateTime<Utc>,
    pub user_id: Option<Uuid>,
    pub user_email: Option<String>,
}

pub async fn get_tag_classes_by_project_id(
    pool: &PgPool,
    project_id: Uuid,
    tag_class_ids: Option<Vec<Uuid>>,
) -> Result<Vec<TagClass>> {
    let mut query = QueryBuilder::new(
        "SELECT
            id,
            created_at,
            name,
            project_id
        FROM tag_classes
        WHERE project_id = ",
    );
    query.push_bind(project_id);
    if let Some(tag_class_ids) = tag_class_ids {
        query.push(" AND id = ANY(");
        query.push_bind(tag_class_ids);
        query.push(")");
    }
    query.push(" ORDER BY created_at DESC");
    let tag_classes = query.build_query_as::<TagClass>().fetch_all(pool).await?;

    Ok(tag_classes)
}

pub async fn update_span_tag(
    pool: &PgPool,
    id: Uuid,
    span_id: Uuid,
    user_email: Option<String>,
    class_id: Option<Uuid>,
    source: &TagSource,
    project_id: Uuid,
    tag_name: &String,
) -> Result<DBSpanTag> {
    let class_id = match class_id {
        Some(class_id) => class_id,
        None => {
            // https://stackoverflow.com/a/62205017/18249562
            // `ON CONFLICT DO NOTHING RETURNING` does not return if there is
            // a conflict, so we union with selecting the existing class id
            sqlx::query_scalar::<_, Uuid>(
                "
                WITH insertion AS (
                    INSERT INTO tag_classes (project_id, name)
                    VALUES ($1, $2)
                    ON CONFLICT (project_id, name) DO NOTHING
                    RETURNING id
                )
                SELECT * FROM insertion
                UNION
                    SELECT id FROM tag_classes
                    WHERE project_id = $1 AND name = $2
                ",
            )
            .bind(project_id)
            .bind(tag_name)
            .fetch_one(pool)
            .await?
        }
    };
    let span_tag = sqlx::query_as::<_, DBSpanTag>(
        "INSERT INTO tags
            (id,
            span_id,
            class_id,
            user_id,
            updated_at,
            source,
            project_id
        )
        VALUES (
            $1,
            $2,
            $3,
            (SELECT id FROM users WHERE email = $4 AND email IS NOT NULL LIMIT 1), 
            now(),
            $5,
            $6
        )
        ON CONFLICT (span_id, class_id)
        DO UPDATE SET
            updated_at = now(),
            source = $5,
            user_id = EXCLUDED.user_id
        RETURNING
            id,
            span_id,
            class_id,
            created_at,
            updated_at,
            user_id,
            source,
            project_id",
    )
    .bind(id)
    .bind(span_id)
    .bind(class_id)
    .bind(user_email)
    .bind(source)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(span_tag)
}
