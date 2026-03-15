use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// ClickHouse representation of a notification log entry
#[derive(Row, Serialize, Deserialize, Clone, Debug)]
pub struct CHNotificationLog {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub definition_type: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub definition_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub target_id: Uuid,
    pub target_type: String,
    pub channel_id: String,
    pub channel_name: String,
    pub email: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub integration_id: Uuid,
    pub payload: String,
    pub created_at: i64,
}

/// Insert notification log entries into ClickHouse
pub async fn insert_notification_logs(
    clickhouse: clickhouse::Client,
    entries: Vec<CHNotificationLog>,
) -> Result<()> {
    if entries.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse
        .insert::<CHNotificationLog>("notification_logs")
        .await;
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert = ch_insert.with_option("wait_for_async_insert", "0");
            for entry in entries {
                ch_insert.write(&entry).await?;
            }
            ch_insert.end().await.map_err(|e| {
                anyhow::anyhow!("Clickhouse notification_logs insertion failed: {:?}", e)
            })?;
            Ok(())
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert notification log into Clickhouse: {:?}",
            e
        )),
    }
}
