//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the LLM Batch Pending Queue for polling

use async_trait::async_trait;
use std::sync::Arc;

use crate::{
    db::DB,
    mq::MessageQueue,
    trace_analysis::{RabbitMqLLMBatchSubmissionMessage, gemini::GeminiClient},
    worker::{HandlerError, MessageHandler},
};

pub struct LLMBatchSubmissionsHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
}

impl LLMBatchSubmissionsHandler {
    pub fn new(
        db: Arc<DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        gemini: Arc<GeminiClient>,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            gemini,
        }
    }
}

#[async_trait]
impl MessageHandler for LLMBatchSubmissionsHandler {
    type Message = Vec<RabbitMqLLMBatchSubmissionMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        process(
            messages,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.gemini.clone(),
        )
        .await
    }
}

async fn process(
    _: Vec<RabbitMqLLMBatchSubmissionMessage>,
    _: Arc<DB>,
    _: clickhouse::Client,
    _: Arc<MessageQueue>,
    _: Arc<GeminiClient>,
) -> Result<(), HandlerError> {
    Ok(())
}
