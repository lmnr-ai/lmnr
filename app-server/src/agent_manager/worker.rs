use std::sync::Arc;

use futures::StreamExt;
use uuid::Uuid;

use crate::{
    db::{self, DB},
    mq::{MessageQueue, MessageQueueTrait},
};

use super::{types::ModelProvider, AgentManager, AgentManagerTrait};

pub const AGENT_WORKER_QUEUE: &str = "agent_worker_queue";
pub const AGENT_WORKER_EXCHANGE: &str = "agent_worker_exchange";

pub async fn run_agent_worker(
    agent_manager: Arc<AgentManager>,
    worker_message_queue: Arc<MessageQueue>,
    db: Arc<DB>,
    chat_id: Uuid,
    user_id: Uuid,
    prompt: String,
    // TODO: remove this once the agent can work without the api key
    api_key_raw: String,
    model_provider: Option<ModelProvider>,
    model: Option<String>,
) {
    let mut stream = agent_manager
        .run_agent_stream(prompt, Some(api_key_raw), None, model_provider, model)
        .await;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => {
                db::agent_messages::insert_agent_message(
                    &db.pool,
                    &chat_id,
                    &user_id,
                    "agent",
                    &serde_json::to_value(&chunk).unwrap(),
                )
                .await
                .unwrap();

                worker_message_queue
                    .publish(
                        serde_json::to_vec(&chunk).unwrap().as_slice(),
                        AGENT_WORKER_EXCHANGE,
                        &chat_id.to_string(),
                    )
                    .await
                    .unwrap();
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
            }
        }
    }
}
