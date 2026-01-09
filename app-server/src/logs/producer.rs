//! This module takes log exports and pushes them to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{LOGS_EXCHANGE, LOGS_ROUTING_KEY};
use crate::{
    db::utils::span_id_to_uuid,
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    opentelemetry_proto::lmnr::logs::v1::{
        ExportLogsServiceRequest, ExportLogsServiceResponse, LogRecord,
    },
    traces::utils::convert_any_value_to_json_value,
};

/// Internal representation of a log record for processing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Log {
    pub log_id: Uuid,
    pub project_id: Uuid,
    pub time: DateTime<Utc>,
    pub observed_time: DateTime<Utc>,
    pub severity_number: i32,
    pub severity_text: String,
    pub body: Value,
    pub attributes: Value,
    pub trace_id: Option<Uuid>,
    pub span_id: Option<Uuid>,
}

impl Log {
    pub fn from_proto(log_record: LogRecord, project_id: Uuid) -> Self {
        let time = DateTime::from_timestamp_nanos(log_record.time_unix_nano as i64);
        let observed_time =
            DateTime::from_timestamp_nanos(log_record.observed_time_unix_nano as i64);

        // Convert trace_id (16 bytes) to UUID
        let trace_id =
            if log_record.trace_id.is_empty() || log_record.trace_id.iter().all(|&b| b == 0) {
                None
            } else {
                Uuid::from_slice(&log_record.trace_id).ok()
            };

        // Convert span_id (8 bytes) to UUID (padded)
        let span_id = if log_record.span_id.is_empty() || log_record.span_id.iter().all(|&b| b == 0)
        {
            None
        } else {
            Some(span_id_to_uuid(&log_record.span_id))
        };

        // Convert body to JSON using shared converter
        let body = convert_any_value_to_json_value(log_record.body);

        // Convert attributes to JSON object
        let attributes: Value = log_record
            .attributes
            .into_iter()
            .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
            .collect::<serde_json::Map<String, Value>>()
            .into();

        Self {
            log_id: Uuid::new_v4(),
            project_id,
            time,
            observed_time,
            severity_number: log_record.severity_number,
            severity_text: log_record.severity_text,
            body,
            attributes,
            trace_id,
            span_id,
        }
    }

    /// Estimate the size of this log record in bytes.
    pub fn estimate_size_bytes(&self) -> usize {
        // Rough estimate based on field sizes
        16 + // log_id
        16 + // project_id
        8 + // time
        8 + // observed_time
        4 + // severity_number
        self.severity_text.len() +
        self.body.to_string().len() +
        self.attributes.to_string().len() +
        16 + // trace_id
        16 // span_id
    }
}

/// Message format for RabbitMQ log messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RabbitMqLogMessage {
    pub log: Log,
}

pub async fn push_logs_to_queue(
    request: ExportLogsServiceRequest,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
) -> Result<ExportLogsServiceResponse> {
    let messages: Vec<RabbitMqLogMessage> = request
        .resource_logs
        .into_iter()
        .flat_map(|resource_logs| {
            resource_logs.scope_logs.into_iter().flat_map(|scope_logs| {
                scope_logs.log_records.into_iter().map(|log_record| {
                    let log = Log::from_proto(log_record, project_id);
                    RabbitMqLogMessage { log }
                })
            })
        })
        .collect();

    let mq_message = serde_json::to_vec(&messages)?;

    if mq_message.len() >= mq_max_payload() {
        log::warn!(
            "[LOGS] MQ payload limit exceeded. Project ID: [{}], payload size: [{}]. Log count: [{}]",
            project_id,
            mq_message.len(),
            messages.len()
        );
        // Don't return error for now, skip publishing
    } else {
        queue
            .publish(&mq_message, LOGS_EXCHANGE, LOGS_ROUTING_KEY)
            .await?;
    }

    let response = ExportLogsServiceResponse {
        partial_success: None,
    };

    Ok(response)
}
