use std::sync::Arc;

use futures::StreamExt;
use uuid::Uuid;

use crate::db::{self, DB};

use super::{
    channel::AgentManagerChannel,
    types::{AgentState, ModelProvider, RunAgentResponseStreamChunk},
    AgentManager, AgentManagerTrait,
};

pub struct RunAgentWorkerOptions {
    pub request_api_key: Option<String>,
    pub model_provider: Option<ModelProvider>,
    pub model: Option<String>,
    pub enable_thinking: bool,
}

pub async fn run_agent_worker(
    agent_manager: Arc<AgentManager>,
    worker_channel: Arc<AgentManagerChannel>,
    db: Arc<DB>,
    chat_id: Uuid,
    user_id: Uuid,
    prompt: String,
    options: RunAgentWorkerOptions,
) {
    let agent_state = match db::agent_messages::get_agent_state(&db.pool, &chat_id).await {
        Ok(Some(agent_state_json)) => {
            let agent_state = serde_json::from_value::<AgentState>(agent_state_json).unwrap();
            Some(agent_state)
        }
        Ok(None) => {
            log::debug!("No agent state found for chat_id: {}", chat_id);
            None
        }
        Err(e) => {
            log::error!("Error getting agent state: {}", e);
            return;
        }
    };

    let mut stream = agent_manager
        .run_agent_stream(
            prompt,
            chat_id,
            options.request_api_key,
            None,
            options.model_provider,
            options.model,
            options.enable_thinking,
            true,
            agent_state,
        )
        .await;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(mut chunk) => {
                let message_type = match chunk {
                    RunAgentResponseStreamChunk::Step(_) => "step",
                    RunAgentResponseStreamChunk::FinalOutput(_) => "assistant",
                };
                let message_id = Uuid::new_v4();
                chunk.set_message_id(message_id);

                // TODO: Run these DB tasks in parallel for the last message?
                if let Err(e) = db::agent_messages::insert_agent_message(
                    &db.pool,
                    &message_id,
                    &chat_id,
                    &user_id,
                    message_type,
                    &chunk.message_content(),
                )
                .await
                {
                    log::error!("Error inserting agent message: {}", e);
                }

                if let RunAgentResponseStreamChunk::FinalOutput(final_output) = &chunk {
                    if let Err(e) = db::agent_messages::update_agent_state(
                        &db.pool,
                        &chat_id,
                        &serde_json::to_value(&final_output.content.state).unwrap(),
                    )
                    .await
                    {
                        log::error!("Error updating agent state: {}", e);
                    }
                }

                // It could be that the frontend connects right at the time when a chunk is sent.
                // To avoid dropping the chunk, we retry sending it a couple times with a small delay.
                let mut retry_count = 0;
                while worker_channel
                    .try_publish(chat_id, Ok(chunk.clone()))
                    .await
                    .is_err()
                {
                    retry_count += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    if retry_count > 3 {
                        break;
                    }
                }
                if matches!(chunk, RunAgentResponseStreamChunk::FinalOutput(_)) {
                    worker_channel.end_session(chat_id);
                }
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
                let mut retry_count = 0;
                while worker_channel
                    .try_publish(chat_id, Err(anyhow::anyhow!(e.to_string())))
                    .await
                    .is_err()
                {
                    retry_count += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    if retry_count > 3 {
                        break;
                    }
                }
                worker_channel.end_session(chat_id);
            }
        }
    }
}
