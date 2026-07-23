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

/// A `trace_agent_output` row. Unlike [`CHTraceAgentInput`], `updated_at`
/// (the RMT version) is set EXPLICITLY to the winning span's end time in
/// nanoseconds — output strength is "latest end time", so versioning on it
/// makes FINAL converge on the latest-ending answer regardless of arrival
/// order. `hashes` are per-message hashes into `deduped_content` (LAM-1953
/// rework — was a rendered `value: String`; every output message is already
/// content-hashed by the dedup pipeline, so storing hashes avoids
/// duplicating bytes). Field order MUST match the CREATE TABLE column order
/// (positional RowBinary): `(project_id, trace_id, hashes, updated_at)`.
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTraceAgentOutput {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub hashes: Vec<[u8; 32]>,
    /// Winning span end time, nanoseconds since epoch (CH `DateTime64(9)`).
    pub updated_at: i64,
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
