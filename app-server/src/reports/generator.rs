//! This module reads report triggers from RabbitMQ and processes them: generates reports and pushes
//! them to the notifications queue.

use async_trait::async_trait;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

use super::ReportTriggerMessage;
use crate::{
    cache::Cache,
    db::DB,
    worker::{HandlerError, MessageHandler},
};

pub struct ReportsGenerator {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
}

#[async_trait]
impl MessageHandler for ReportsGenerator {
    type Message = ReportTriggerMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_report_trigger(
            message,
            self.db.clone(),
            self.cache.clone(),
            self.clickhouse.clone(),
        )
        .await
    }
}

#[instrument(skip(message, db, cache, clickhouse))]
async fn process_report_trigger(
    message: ReportTriggerMessage,
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
) -> Result<(), HandlerError> {
    // TODO: Implement report generation and pushing to the notifications queue

    Ok(())
}
