pub mod generator;
pub mod scheduler;

use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

pub const REPORT_TRIGGERS_QUEUE: &str = "report_triggers_queue";
pub const REPORT_TRIGGERS_EXCHANGE: &str = "report_triggers_exchange";
pub const REPORT_TRIGGERS_ROUTING_KEY: &str = "report_triggers_routing_key";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReportTriggerMessage {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub r#type: String,
    pub weekdays: Vec<i32>,
    pub hour: i32,
}

pub async fn push_to_reports_queue(
    message: ReportTriggerMessage,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let serialized = serde_json::to_vec(&message)?;

    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "[Reports Scheduler] MQ payload limit exceeded. payload size: [{}].",
            serialized.len(),
        );
        return Ok(());
    }

    queue
        .publish(
            &serialized,
            REPORT_TRIGGERS_EXCHANGE,
            REPORT_TRIGGERS_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(())
}
