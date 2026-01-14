//! This module reads logs from RabbitMQ and processes them: writes to ClickHouse.

use async_trait::async_trait;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    ch::{self, logs::CHLog},
    worker::{HandlerError, MessageHandler},
};

use super::producer::RabbitMqLogMessage;

/// Handler for log processing
pub struct LogsHandler {
    pub clickhouse: clickhouse::Client,
}

#[async_trait]
impl MessageHandler for LogsHandler {
    type Message = Vec<RabbitMqLogMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        process_logs_batch(messages, self.clickhouse.clone()).await
    }
}

#[instrument(skip(messages, clickhouse))]
async fn process_logs_batch(
    messages: Vec<RabbitMqLogMessage>,
    clickhouse: clickhouse::Client,
) -> Result<(), HandlerError> {
    if messages.is_empty() {
        return Ok(());
    }

    // Get project_id from the first log (all logs in the batch should have the same project_id)
    let project_id = messages
        .first()
        .map(|m| m.log.project_id)
        .unwrap_or(Uuid::nil());

    // Convert logs to ClickHouse format
    let ch_logs: Vec<CHLog> = messages
        .iter()
        .map(|message| CHLog::from_log(&message.log))
        .collect();

    // Insert logs into ClickHouse
    if let Err(e) = ch::logs::insert_logs_batch(clickhouse, &ch_logs).await {
        log::error!(
            "Failed to record {} logs to ClickHouse: {:?}",
            ch_logs.len(),
            e
        );
        // Requeue the message on transient errors
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to insert logs to ClickHouse: {:?}",
            e
        )));
    }

    log::debug!(
        "Successfully processed {} logs for project {}",
        ch_logs.len(),
        project_id
    );

    Ok(())
}
