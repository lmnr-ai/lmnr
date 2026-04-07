use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// ClickHouse representation of a raw notification event.
/// Stored in the `notifications` table for UI display and auditing.
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotification {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    pub definition_type: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub definition_id: Uuid,
    /// Serialized NotificationKind (structured JSON, no HTML/markdown).
    pub notification_data: String,
    pub created_at: i64,
}

impl ClickhouseInsertable for CHNotification {
    const TABLE: Table = Table::Notifications;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_option("wait_for_async_insert", "0")
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Notifications(items)
    }
}
