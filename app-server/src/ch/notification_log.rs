use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// ClickHouse row for notification_log table.
/// Records every notification (email or Slack) sent by the system for auditing and inspection.
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotificationLog {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// "report" or "alert"
    pub notification_type: String,
    /// "email" or "slack"
    pub channel: String,
    /// Email address or Slack channel ID
    pub recipient: String,
    /// Email subject or Slack message summary
    pub subject: String,
    /// Full HTML body (email) or JSON blocks (Slack)
    pub body: String,
    /// Name of the event that triggered this notification
    pub event_name: String,
    /// "success" or "error"
    pub status: String,
    /// Error message if status is "error", empty otherwise
    pub error: String,
    /// Millisecond-precision timestamp
    pub created_at: i64,
}

impl CHNotificationLog {
    pub fn now_millis() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }
}

/// Insert notification log entries into ClickHouse.
pub async fn insert_notification_logs(
    clickhouse: &clickhouse::Client,
    logs: Vec<CHNotificationLog>,
) -> Result<()> {
    if logs.is_empty() {
        return Ok(());
    }

    let mut insert = clickhouse
        .insert::<CHNotificationLog>("notification_log")
        .await?;
    insert = insert.with_option("wait_for_async_insert", "0");

    for log in logs {
        insert.write(&log).await?;
    }

    insert
        .end()
        .await
        .map_err(|e| anyhow::anyhow!("ClickHouse notification_log insertion failed: {:?}", e))?;

    Ok(())
}
