use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
};

/// Project-scoped content-addressed row that backs structural dedup for any
/// hash-referenced JSON blob the spans table points at (LLM input messages,
/// LLM output messages, normalized tool-definition arrays, and any future
/// single-blob dedup we add).
///
/// Keyed by `(project_id, content_hash)`: the same content seen across two
/// traces in the same project collapses to one row. Spans reference rows by
/// hash via `input_message_hashes`, `output_message_hashes`, and
/// `tool_definitions_hash` columns; the spans views reconstruct the JSON on
/// read via the `deduped_content_dict` dictionary.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHDedupedContent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub content_hash: [u8; 32],
    pub content: String,
    /// Redacted copy, filled only in `dual` PII mode when the redactor
    /// changed the content (`crate::pii_redactor`).
    #[serde(default)]
    pub content_redacted: String,
    /// The redactor screened `content`; see `crate::pii_redactor::SpanPii`.
    #[serde(default)]
    pub pii_checked: bool,
}

impl CHDedupedContent {
    pub fn new(project_id: Uuid, content_hash: [u8; 32], content: String) -> Self {
        Self {
            project_id,
            content_hash,
            content,
            content_redacted: String::new(),
            pii_checked: false,
        }
    }
}

pub async fn get_content_by_hash(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    content_hash_hex: &str,
) -> clickhouse::error::Result<Option<String>> {
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

impl ClickhouseInsertable for CHDedupedContent {
    const TABLE: Table = Table::DedupedContent;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::DedupedContent(items)
    }
}
