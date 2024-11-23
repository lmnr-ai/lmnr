use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

pub mod datapoints;
pub mod utils;

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub id: Uuid,
    #[serde(skip_deserializing)]
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    #[serde(default)]
    pub indexed_on: Option<String>,
}
