//! Canonical per-trace message store that backs LLM span input deduplication.
//!
//! LLM spans store an ordered `input_message_hashes` array; the full
//! message JSON lives here keyed by BLAKE3-256 of its canonical form. The
//! `spans_v0` view reconstructs the original `input` JSON array by joining
//! against this table.

use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// Field order matches the ClickHouse `llm_messages` table so `SELECT *`
/// deserializes correctly. `last_seen_at` uses the DEFAULT `now()`.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHLlmMessage {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// BLAKE3-256 digest of the message's canonical JSON form.
    pub message_hash: [u8; 32],
    pub content: String,
}

impl ClickhouseInsertable for CHLlmMessage {
    const TABLE: Table = Table::LlmMessages;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::LlmMessages(items)
    }
}
