use std::sync::Arc;

use futures::StreamExt;
use uuid::Uuid;

use crate::db::{self, agent_messages::MessageType, DB};
use chrono::Utc;
use super::{
    channel::AgentManagerWorkers,
    cookies,
    types::{ModelProvider, RunAgentResponseStreamChunk, WorkerStreamChunk},
    AgentManager, AgentManagerTrait,
};

pub struct RunAgentWorkerOptions {
    pub model_provider: Option<ModelProvider>,
    pub model: Option<String>,
    pub enable_thinking: bool,
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
    let cookies = if let Some(user_id) = user_id {
        match cookies::get_cookies(&db.pool, &user_id).await {
            Ok(cookies) => cookies,
            Err(e) => {
                log::error!("Error getting cookies: {}", e);
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    let mut stream = agent_manager
        .run_agent_stream(
            prompt,
            session_id,
            user_id.is_some(),
            project_api_key,
            None,
            options.model_provider,
            options.model,
            options.enable_thinking,
            cookies,
            options.return_screenshots,
        )
        .await;

    if let Err(e) = db::agent_chats::update_agent_chat_status(&db.pool, "working", Utc::now(), &session_id).await {
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
                };

                if user_id.is_some() {
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
                    if let Some(cookies) = final_output.content.cookies.as_ref() {
                        if let Some(user_id) = user_id {
                            if let Err(e) =
                                cookies::insert_cookies(&db.pool, &user_id, &cookies).await
                            {
                                log::error!("Error inserting cookies: {}", e);
                            }
                        }
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

    if let Err(e) = db::agent_chats::update_agent_chat_status(&db.pool, "idle", Utc::now(), &session_id).await {
        log::error!("Error updating agent chat: {}", e);
    }
}
