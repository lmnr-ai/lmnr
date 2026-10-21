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
/// Inserted as `INSERT INTO unique_content(<field names>)`, so fields bind
/// by name; `last_seen_at` is not a field and keeps its DEFAULT.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHUniqueContent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub group_id: String,
    pub content_hash: [u8; 32],
    pub content: String,
    /// PII byte ranges into `content` (`crate::pii_redactor::PiiMask` as
    /// `(start, end, label)`), filled only in `dual` PII mode.
    #[serde(default)]
    pub content_masks: Vec<(u32, u32, String)>,
    /// The redactor screened `content`; see `crate::pii_redactor::SpanVerdict::pii_checked`.
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
            content_masks: Vec::new(),
            pii_checked: false,
        }
    }
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
