use std::sync::Arc;

use futures_util::StreamExt;
use uuid::Uuid;

use super::{
    channel::AgentManagerWorkers,
    storage_state,
    types::{ModelProvider, RunAgentResponseStreamChunk},
    AgentManager, AgentManagerTrait,
};
use crate::db::{self, agent_messages::MessageType, DB};

pub struct RunAgentWorkerOptions {
    pub model_provider: Option<ModelProvider>,
    pub model: Option<String>,
    pub enable_thinking: bool,
    pub agent_state: Option<String>,
    pub timeout: Option<u64>,
    pub storage_state: Option<String>,
    pub cdp_url: Option<String>,
    pub max_steps: Option<u64>,
    pub thinking_token_budget: Option<u64>,
    pub start_url: Option<String>,
    pub return_agent_state: bool,
    pub return_storage_state: bool,
    pub return_screenshots: bool,
}

pub async fn run_agent_worker(
    agent_manager: Arc<AgentManager>,
    worker_channel: Arc<AgentManagerWorkers>,
    db: Arc<DB>,
    session_id: Uuid,
    // If user_id is Some, we are running the agent in Chat mode,
    user_id: Option<Uuid>,
    project_api_key: Option<String>,
    prompt: String,
    options: RunAgentWorkerOptions,
) {
    let storage_state = match options.storage_state {
        Some(storage_state) => Some(storage_state),
        None => {
            // Temporary env var control for sending storage state, while we figure out
            // the auth checks on browser providers side.
            let send_state = std::env::var("SEND_USER_STORAGE_STATE")
                .ok()
                .unwrap_or("0".to_string())
                .parse::<usize>()
                .unwrap_or(0);
            if send_state == 0 {
                None
            } else if let Some(user_id) = user_id {
                match storage_state::get_storage_state(&db.pool, &user_id).await {
                    Ok(storage_state) => Some(storage_state),
                    Err(e) => {
                        log::error!("Error getting storage state: {}", e);
                        None
                    }
                }
            } else {
                None
            }
        }
    };

    let mut stream = agent_manager
        .run_agent_stream(super::RunAgentParams {
            prompt,
            session_id,
            is_chat_request: user_id.is_some(),
            request_api_key: project_api_key,
            parent_span_context: None,
            model_provider: options.model_provider,
            model: options.model,
            enable_thinking: options.enable_thinking,
            storage_state,
            agent_state: options.agent_state,
            timeout: options.timeout,
            cdp_url: options.cdp_url,
            max_steps: options.max_steps,
            thinking_token_budget: options.thinking_token_budget,
            start_url: options.start_url,
            return_agent_state: options.return_agent_state,
            return_screenshots: options.return_screenshots,
            return_storage_state: options.return_storage_state,
        })
        .await;

    if let Err(e) =
        db::agent_chats::update_agent_chat_status(&db.pool, "working", &session_id).await
    {
        log::error!("Error updating agent chat: {}", e);
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
                    RunAgentResponseStreamChunk::Error(_) => MessageType::Error,
                    RunAgentResponseStreamChunk::Timeout(_) => MessageType::Step, // or Error?
                };

                if user_id.is_some() && chunk.trace_id() != Uuid::nil() {
                    if let Err(e) = db::agent_messages::insert_agent_message(
                        &db.pool,
                        &chunk.message_id(),
                        &session_id,
                        &chunk.trace_id(),
                        &message_type,
                        &chunk.message_content(),
                        &chunk.created_at(),
                    )
                    .await
                    {
                        log::error!("Error inserting agent message: {}", e);
                    }
                }

                if let RunAgentResponseStreamChunk::FinalOutput(final_output) = &chunk {
                    if let Some(storage_state) = final_output.content.storage_state.as_ref() {
                        if let Some(user_id) = user_id {
                            if let Err(e) = storage_state::insert_storage_state(
                                &db.pool,
                                &user_id,
                                &storage_state,
                            )
                            .await
                            {
                                log::error!("Error inserting storage state: {}", e);
                            }
                        }
                    }
                }

                // It could be that the frontend connects right at the time when a chunk is sent.
                // To avoid dropping the chunk, we retry sending it a couple times with a small delay.
                let mut retry_count = 0;
                while worker_channel
                    .try_publish(session_id, Ok(chunk.clone()))
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
                    if let Err(e) =
                        db::agent_chats::update_agent_chat_status(&db.pool, "idle", &session_id)
                            .await
                    {
                        log::error!("Error updating agent chat: {}", e);
                    }
                    worker_channel.end_session(session_id);
                    break;
                }
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
                let mut retry_count = 0;
                if let Err(e) =
                    db::agent_chats::update_agent_chat_status(&db.pool, "idle", &session_id).await
                {
                    log::error!("Error updating agent chat: {}", e);
                }
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
