use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{logs::producer::Log, utils::sanitize_string};

use super::{ClickhouseInsertable, DataPlaneBatch, Table, utils::chrono_to_nanoseconds};

/// ClickHouse representation of a log record.
#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHLog {
    #[serde(with = "clickhouse::serde::uuid")]
    pub log_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// Time in nanoseconds
    pub time: i64,
    /// Observed time in nanoseconds
    pub observed_time: i64,
    pub severity_number: u8,
    pub severity_text: String,
    pub body: String,
    pub attributes: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub size_bytes: u64,
}

impl CHLog {
    pub fn from_log(log: &Log) -> Self {
        let body_string = sanitize_string(&log.body.to_string());
        let attributes_string = sanitize_string(&log.attributes.to_string());

        CHLog {
            log_id: log.log_id,
            project_id: log.project_id,
            time: chrono_to_nanoseconds(log.time),
            observed_time: chrono_to_nanoseconds(log.observed_time),
            severity_number: log.severity_number as u8,
            severity_text: log.severity_text.clone(),
            body: body_string,
            attributes: attributes_string,
            trace_id: log.trace_id.unwrap_or(Uuid::nil()),
            span_id: log.span_id.unwrap_or(Uuid::nil()),
            size_bytes: log.estimate_size_bytes() as u64,
        }
    }
}

impl ClickhouseInsertable for CHLog {
    const TABLE: Table = Table::Logs;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::Logs(items)
    }
}
