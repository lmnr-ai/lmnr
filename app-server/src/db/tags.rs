use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
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
