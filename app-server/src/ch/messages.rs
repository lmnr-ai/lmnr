use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table};

/// Project-scoped content-addressed row that backs structural dedup of LLM
/// span input/output messages and tool-definition blobs (LAM-1634).
///
/// Keyed by `(project_id, message_hash)`: the same content seen across two
/// traces in the same project collapses to one row. Spans reference rows by
/// hash via `input_message_hashes`, `output_message_hashes`, and
/// `tool_definition_hash` columns; the `spans_v0` view reconstructs the JSON
/// on read via the `messages_dict` dictionary.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHMessage {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub message_hash: [u8; 32],
    pub content: String,
}

impl ClickhouseInsertable for CHMessage {
    const TABLE: Table = Table::Messages;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_option(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Messages(items)
    }
}
