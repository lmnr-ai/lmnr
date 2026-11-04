use clickhouse::Row;
use serde::Serialize;
use uuid::Uuid;

/// Field order must match the `audit_events` columns (migration 82): the
/// clickhouse crate writes `RowBinary` by position.
#[derive(Debug, Clone, Row, Serialize)]
pub struct AuditEventCHRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    pub timestamp: i64,
    pub inserted_at: i64,
    #[serde(with = "clickhouse::serde::uuid")]
    pub workspace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub project_name: String,
    pub actor_type: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub actor_id: Uuid,
    pub actor_label: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub actor_owner_user_id: Uuid,
    pub actor_owner_label: String,
    pub source: String,
    pub resource_type: String,
    pub action: String,
    pub resource_id: String,
    pub resource_label: String,
    pub outcome: String,
    pub ip: String,
    pub user_agent: String,
    pub metadata: String,
}

pub async fn insert_audit_events(
    clickhouse: &clickhouse::Client,
    rows: &[AuditEventCHRow],
) -> Result<(), clickhouse::error::Error> {
    let mut insert = clickhouse
        .insert::<AuditEventCHRow>("audit_events")
        .await?
        .with_setting("async_insert", "1")
        .with_setting("wait_for_async_insert", "1");
    for row in rows {
        insert.write(row).await?;
    }
    insert.end().await
}
