use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table};

/// Project-scoped content-addressed row that backs structural dedup for any
/// hash-referenced JSON blob the spans table points at (LLM input messages,
/// LLM output messages, normalized tool-definition arrays, and any future
/// single-blob dedup we add).
///
/// Keyed by `(project_id, content_hash)`: the same content seen across two
/// traces in the same project collapses to one row. Spans reference rows by
/// hash via `input_message_hashes`, `output_message_hashes`, and
/// `tool_definition_hash` columns; the `spans_v0` view reconstructs the JSON
/// on read via the `shared_content_dict` dictionary.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHSharedContent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub content_hash: [u8; 32],
    pub content: String,
}

impl ClickhouseInsertable for CHSharedContent {
    const TABLE: Table = Table::SharedContent;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_option(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::SharedContent(items)
    }
}
