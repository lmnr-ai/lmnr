use std::sync::Arc;

use futures::StreamExt;
use uuid::Uuid;

use crate::db::{self, DB};

use super::{
    channel::AgentManagerChannel,
    types::{ModelProvider, RunAgentResponseStreamChunk},
    AgentManager, AgentManagerTrait,
};

pub async fn run_agent_worker(
    agent_manager: Arc<AgentManager>,
    worker_channel: Arc<AgentManagerChannel>,
    db: Arc<DB>,
    chat_id: Uuid,
    user_id: Uuid,
    prompt: String,
    request_api_key: Option<String>,
    model_provider: Option<ModelProvider>,
    model: Option<String>,
    enable_thinking: bool,
) {
    let mut stream = agent_manager
        .run_agent_stream(
            prompt,
            chat_id,
            request_api_key,
            None,
            model_provider,
            model,
            enable_thinking,
        )
        .await;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => {
                let message_type = match chunk {
                    RunAgentResponseStreamChunk::Step(_) => "step",
                    RunAgentResponseStreamChunk::FinalOutput(_) => "final_output",
                };
                db::agent_messages::insert_agent_message(
                    &db.pool,
                    &chat_id,
                    &user_id,
                    message_type,
                    &serde_json::to_value(&chunk).unwrap(),
                )
                .await
                .unwrap();

                worker_channel.try_publish(chat_id, chunk).await;
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
            }
        }
    }
}
