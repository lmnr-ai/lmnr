use std::sync::Arc;

use futures::StreamExt;
use uuid::Uuid;

use crate::db::{self, agent_manager::MessageType, DB};

use super::{
    channel::AgentManagerChannel,
    types::{ModelProvider, RunAgentResponseStreamChunk, WorkerStreamChunk},
    AgentManager, AgentManagerTrait,
};

pub struct RunAgentWorkerOptions {
    pub model_provider: Option<ModelProvider>,
    pub model: Option<String>,
    pub enable_thinking: bool,
}

pub async fn run_agent_worker(
    agent_manager: Arc<AgentManager>,
    worker_channel: Arc<AgentManagerChannel>,
    db: Arc<DB>,
    session_id: Uuid,
    user_id: Uuid,
    prompt: String,
    options: RunAgentWorkerOptions,
) {
    let agent_state = match db::agent_manager::get_agent_state(&db.pool, &session_id).await {
        Ok(Some(agent_state)) => Some(agent_state),
        Ok(None) => {
            log::debug!("No agent state found for session_id: {}", session_id);
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
            Some(session_id),
            None,
            None,
            agent_state,
            options.model_provider,
            options.model,
            options.enable_thinking,
        )
        .await;

    if let Err(e) = db::agent_manager::update_agent_user_id(&db.pool, &session_id, &user_id).await {
        log::error!("Error updating agent user id: {}", e);
    }

    while let Some(chunk) = stream.next().await {
        if worker_channel.is_stopped(session_id) {
            break;
        }
        match chunk {
            Ok(chunk) => {
                let message_type = match chunk {
                    RunAgentResponseStreamChunk::Step(_) => MessageType::Step,
                    RunAgentResponseStreamChunk::FinalOutput(_) => MessageType::Assistant,
                };

                // TODO: Run these DB tasks in parallel for the last message?
                if let Err(e) = db::agent_manager::insert_agent_message(
                    &db.pool,
                    &chunk.message_id(),
                    &session_id,
                    &user_id,
                    &message_type,
                    &chunk.message_content(),
                )
                .await
                {
                    log::error!("Error inserting agent message: {}", e);
                }

                if let RunAgentResponseStreamChunk::FinalOutput(final_output) = &chunk {
                    if let Err(e) = db::agent_manager::update_agent_state(
                        &db.pool,
                        &session_id,
                        &final_output.content.state,
                        &user_id,
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
                    .try_publish(session_id, Ok(WorkerStreamChunk::AgentChunk(chunk.clone())))
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
                    worker_channel.end_session(session_id);
                }
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
                let mut retry_count = 0;
                while worker_channel
                    .try_publish(session_id, Err(anyhow::anyhow!(e.to_string())))
                    .await
                    .is_err()
                {
                    retry_count += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    if retry_count > 3 {
                        break;
                    }
                }
                worker_channel.end_session(session_id);
            }
        }
    }
}
