use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// ClickHouse representation of a notification event.
/// One entry per notification event, regardless of how many recipients it was sent to.
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotification {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    pub notification_kind: String,
    pub payload: String,
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

/// ClickHouse representation of a notification delivery.
/// One entry per delivery attempt (per recipient/channel).
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotificationDelivery {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub notification_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    /// "EMAIL" or "SLACK"
    pub channel: String,
    /// Email address or Slack channel ID
    pub destination: String,
    pub delivered: bool,
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
