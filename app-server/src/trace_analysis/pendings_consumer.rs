//! This module reads pending LLM batch requests from RabbitMQ and processes them:
//! wait till completion, make tool calls, push new messages to clickhouse
//! - if no next steps required, create event and update status
//! - otherwise, push to LLM Batch Submissions Queue for next step

use async_trait::async_trait;
use std::sync::Arc;

use crate::{
    db::DB,
    mq::MessageQueue,
    trace_analysis::RabbitMqLLMBatchPendingMessage,
    worker::{HandlerError, MessageHandler},
};

pub struct LLMBatchPendingHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
}

impl LLMBatchPendingHandler {
    pub fn new(db: Arc<DB>, queue: Arc<MessageQueue>, clickhouse: clickhouse::Client) -> Self {
        Self {
            db,
            queue,
            clickhouse,
        }
    }
}

#[async_trait]
impl MessageHandler for LLMBatchPendingHandler {
    type Message = Vec<RabbitMqLLMBatchPendingMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        process(
            messages,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
        )
        .await
    }
}

async fn process(
    _: Vec<RabbitMqLLMBatchPendingMessage>,
    _: Arc<DB>,
    _: clickhouse::Client,
    _: Arc<MessageQueue>,
) -> Result<(), HandlerError> {
    // TODO: Implement

    Ok(())
}
