use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// ClickHouse representation of a notification delivery record.
/// Each row represents a single delivery attempt (one email or one slack message)
/// for a notification from the `notifications` table.
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotificationDelivery {
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// ID of the notification event from the `notifications` table.
    #[serde(with = "clickhouse::serde::uuid")]
    pub notification_id: Uuid,
    /// Unique ID for this specific delivery attempt.
    #[serde(with = "clickhouse::serde::uuid")]
    pub delivery_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub target_id: Uuid,
    pub target_type: String,
    /// The raw message that was actually sent (email HTML or Slack markdown).
    pub message: String,
    pub created_at: i64,
}

impl ClickhouseInsertable for CHNotificationDelivery {
    const TABLE: Table = Table::NotificationDeliveries;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_option("wait_for_async_insert", "0")
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::NotificationDeliveries(items)
    }
}
