//! Supplementary ReplacingMergeTree rows for the extracted agent
//! input/output (LAM-1953). One row per trace per table; the server
//! defaults `updated_at` to `now64()`, and `ReplacingMergeTree(updated_at)`
//! converges on the latest-arriving qualifying write. The producer-side
//! cache arbitration gate decides which spans qualify to write here.

use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{ClickhouseInsertable, DataPlaneBatch, Table};

/// A `trace_agent_input` row. `updated_at` is intentionally NOT a struct
/// field: the named-column insert lets the server fill its `now64()`
/// default, which is the RMT version.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgentInput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Raw JSON value (a string, or `false`), matching the metadata map
    /// encoding in `traces_agg`.
    pub value: String,
}

/// A `trace_agent_output` row. Same shape and semantics as
/// [`CHTraceAgentInput`], separate table.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgentOutput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub value: String,
}

impl ClickhouseInsertable for CHTraceAgentInput {
    const TABLE: Table = Table::TraceAgentInput;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TraceAgentInput(items)
    }
}

impl ClickhouseInsertable for CHTraceAgentOutput {
    const TABLE: Table = Table::TraceAgentOutput;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TraceAgentOutput(items)
    }
}
