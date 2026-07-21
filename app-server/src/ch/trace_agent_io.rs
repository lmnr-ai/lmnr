//! Extracted agent input/output rows (LAM-1953). One row per trace per
//! table, ReplacingMergeTree(ver): inserts are blind and idempotent —
//! `ver` encodes winner strength (depth-major, then tokens / end time),
//! so rows converge to the true winner regardless of arrival order or
//! MQ redelivery. `value` is the raw JSON value (string or `false`),
//! matching the `traces_agg` metadata map encoding.

use clickhouse::Row;
use clickhouse::insert::Insert;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    ClickhouseInsertable, DataPlaneBatch, SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS, Table,
};

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgentInput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub ver: u64,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgentOutput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub ver: u64,
    pub value: String,
}

impl ClickhouseInsertable for CHTraceAgentInput {
    const TABLE: Table = Table::TraceAgentInput;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TraceAgentInput(items)
    }
}

impl ClickhouseInsertable for CHTraceAgentOutput {
    const TABLE: Table = Table::TraceAgentOutput;

    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert.with_setting(
            "async_insert_busy_timeout_max_ms",
            SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS.as_str(),
        )
    }

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TraceAgentOutput(items)
    }
}
