use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
};

/// One `unique_content` row: any JSON blob the spans table references by
/// hash (input / output messages, tool-definition arrays). Keyed by
/// `(project_id, group_id, content_hash)` — see `traces::dedup` for the group.
/// Field order is the table's column order: the clickhouse crate binds by
/// position.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHUniqueContent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub group_id: String,
    pub content_hash: [u8; 32],
    pub content: String,
    /// Redacted copy, filled only in `dual` PII mode when the redactor
    /// changed the content (`crate::pii_redactor`). Trailing columns: the
    /// table's `last_seen_at` keeps its DEFAULT.
    #[serde(default)]
    pub content_redacted: String,
    /// The redactor screened `content`; see `crate::pii_redactor::SpanPii`.
    #[serde(default)]
    pub pii_checked: bool,
}

impl CHUniqueContent {
    pub fn new(
        project_id: Uuid,
        group_id: String,
        content_hash: [u8; 32],
        content: String,
    ) -> Self {
        Self {
            project_id,
            group_id,
            content_hash,
            content,
            content_redacted: String::new(),
            pii_checked: false,
        }
    }
}

/// Resolve one blob by hash: the group-scoped table first, then the legacy
/// project-scoped `deduped_content` for rows written before migration 64.
pub async fn get_content_by_hash(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    group_id: &str,
    content_hash_hex: &str,
) -> clickhouse::error::Result<Option<String>> {
    let grouped = clickhouse
        .query(
            "SELECT content FROM unique_content
             WHERE project_id = ? AND group_id = ? AND content_hash = toFixedString(unhex(?), 32)
             LIMIT 1",
        )
        .bind(project_id)
        .bind(group_id)
        .bind(content_hash_hex)
        .fetch_optional::<String>()
        .await?;
    if grouped.is_some() {
        return Ok(grouped);
    }
    clickhouse
        .query(
            "SELECT content FROM deduped_content
             WHERE project_id = ? AND content_hash = toFixedString(unhex(?), 32)
             LIMIT 1",
        )
        .bind(project_id)
        .bind(content_hash_hex)
        .fetch_optional::<String>()
        .await
}

impl ClickhouseInsertable for CHUniqueContent {
    const TABLE: Table = Table::UniqueContent;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::UniqueContent(items)
    }
}
