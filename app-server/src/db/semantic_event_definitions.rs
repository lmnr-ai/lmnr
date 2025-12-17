use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Semantic event definition with prompt and schema (from definition or template)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticEventDefinition {
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
}
