use clickhouse::{Row, insert::Insert};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// Content-addressed LLM input message row.
///
/// `message_hash` is a BLAKE3-256 digest of the message's canonical JSON
/// (object keys sorted recursively). Dedup is scoped per `(project_id, trace_id)` —
/// the same content in different traces produces different rows.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHLlmMessage {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub message_hash: [u8; 32],
    pub content: String,
}

impl ClickhouseInsertable for CHLlmMessage {
    const TABLE: Table = Table::LlmMessages;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert
            .with_option("async_insert", "1")
            .with_option("wait_for_async_insert", "1")
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::LlmMessages(items)
    }
}
