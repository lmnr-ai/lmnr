use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::{logs::producer::Log, utils::sanitize_string};

use super::utils::chrono_to_nanoseconds;

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
    /// Flags as defined in OpenTelemetry LogRecordFlags
    pub flags: u32,
    /// Event name for event-type log records
    pub event_name: String,
    /// Number of attributes that were dropped due to limits
    pub dropped_attributes_count: u32,
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
            flags: log.flags,
            event_name: log.event_name.clone(),
            dropped_attributes_count: log.dropped_attributes_count,
            size_bytes: log.estimate_size_bytes() as u64,
        }
    }
}

#[instrument(skip(clickhouse, logs))]
pub async fn insert_logs_batch(clickhouse: clickhouse::Client, logs: &[CHLog]) -> Result<()> {
    if logs.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert::<CHLog>("logs").await;
    match ch_insert {
        Ok(mut ch_insert) => {
            // Write all logs to the batch
            for log in logs {
                ch_insert.write(log).await?;
            }

            // End the batch insertion
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "Clickhouse batch log insertion failed: {:?}",
                        e
                    ));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert logs batch into Clickhouse: {:?}",
                e
            ));
        }
    }
}
