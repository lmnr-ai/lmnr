use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
};

/// One `spans_large_io` row: the full `input` (`is_output = false`) or
/// `output` of a span whose `spans` row holds only a preview and the matching
/// `offloaded_io` bit. See `traces::large_io`. Inserted by field name.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHSpanLargeIo {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub is_output: bool,
    /// The span's start time in nanoseconds; the partition key.
    pub start_time: i64,
    /// Exactly what `spans.input` / `output` would have held, masks included.
    pub content: String,
    pub content_masks: Vec<(u32, u32, String)>,
    pub pii_checked: bool,
}

impl ClickhouseInsertable for CHSpanLargeIo {
    const TABLE: Table = Table::SpansLargeIo;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::SpansLargeIo(items)
    }
}
