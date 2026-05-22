use std::env;

use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// Row for the `llm_messages` table that backs the structural dedup of LLM
/// span input messages. Each row is a single message's canonical-JSON content
/// keyed by `(project_id, trace_id, message_hash)`. The span carries only
/// an ordered array of hashes; the view reconstructs the input JSON array on
/// read via a LEFT JOIN back onto this table.
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
        let wait_for_async_insert: bool = env::var("LLM_MESSAGES_CH_WAIT_FOR_ASYNC_INSERT")
            .unwrap_or("true".to_string())
            .parse()
            .unwrap_or(true);

        insert.with_option(
            "wait_for_async_insert",
            if wait_for_async_insert { "1" } else { "0" },
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::LlmMessages(items)
    }
}
