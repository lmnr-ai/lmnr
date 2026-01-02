use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, sqlx::Type, Serialize, Deserialize, Clone, PartialEq)]
#[sqlx(type_name = "tag_source")]
pub enum TagSource {
    MANUAL,
    AUTO,
    CODE,
}

/// Structured representation of a span tag for batch operations
#[derive(Debug, Clone, Serialize)]
pub struct SpanTag {
    pub project_id: Uuid,
    pub name: String,
    pub source: TagSource,
    pub span_id: Uuid,
}

impl SpanTag {
    pub fn new(project_id: Uuid, name: String, source: TagSource, span_id: Uuid) -> Self {
        Self {
            project_id,
            name,
            source,
            span_id,
        }
    }
}
