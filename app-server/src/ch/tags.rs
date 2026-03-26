use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// ClickHouse representation of a tag entry in the `tags` table.
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHTag {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub created_at: i64,
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    pub name: String,
    pub source: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
}

impl ClickhouseInsertable for CHTag {
    const TABLE: Table = Table::Tags;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Tags(items)
    }
}
