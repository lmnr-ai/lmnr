//! This module reads logs from RabbitMQ and processes them: writes to ClickHouse.

use std::sync::Arc;

use async_trait::async_trait;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{self, logs::CHLog},
    db::DB,
    features::{Feature, is_feature_enabled},
    utils::limits::update_workspace_bytes_ingested,
    worker::{HandlerError, MessageHandler},
};

use super::producer::RabbitMqLogMessage;

/// Handler for log processing
pub struct LogsHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
}

#[async_trait]
impl MessageHandler for LogsHandler {
    type Message = Vec<RabbitMqLogMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        process_logs_batch(
            messages,
            self.db.clone(),
            self.cache.clone(),
            self.clickhouse.clone(),
        )
        .await
    }
}

#[instrument(skip(messages, db, cache, clickhouse))]
async fn process_logs_batch(
    messages: Vec<RabbitMqLogMessage>,
    db: Arc<DB>,
    cache: Arc<Cache>,
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

    // Calculate total ingested bytes before conversion
    let total_ingested_bytes: usize = messages.iter().map(|m| m.log.estimate_size_bytes()).sum();

    // Convert logs to ClickHouse format
    let ch_logs: Vec<CHLog> = messages
        .iter()
        .map(|message| CHLog::from_log(&message.log))
        .collect();

    // Insert logs into ClickHouse
    if let Err(e) = ch::logs::insert_logs_batch(clickhouse.clone(), &ch_logs).await {
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

    // Update workspace limits cache
    if is_feature_enabled(Feature::UsageLimit) {
        if let Err(e) =
            update_workspace_bytes_ingested(db, clickhouse, cache, project_id, total_ingested_bytes)
                .await
        {
            log::error!(
                "Failed to update workspace limit exceeded for project [{}]: {:?}",
                project_id,
                e
            );
        }
    }

    Ok(())
}
