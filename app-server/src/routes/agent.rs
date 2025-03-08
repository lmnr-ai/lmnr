use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::types::{
    AgentStreamChunk, ExistingMessagesChunkContent, MessageHistoryItem, RunAgentResponseStreamChunk,
};
use crate::agent_manager::worker::{run_agent_worker, AGENT_WORKER_EXCHANGE, AGENT_WORKER_QUEUE};
// use crate::cache::{keys::PROJECT_API_KEY_CACHE_KEY, Cache, CacheTrait};
use crate::db::user::User;
use crate::mq::{
    MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait,
};
use crate::project_api_keys::ProjectApiKeyVals;
use crate::routes::types::ResponseResult;
use crate::{
    agent_manager::{types::ModelProvider, AgentManager},
    db::{self, DB},
};

// const REQUEST_API_KEY_TTL: u64 = 60 * 60; // 1 hour

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunAgentRequest {
    prompt: String,
    chat_id: Option<Uuid>,
    #[serde(default)]
    model_provider: Option<ModelProvider>,
    #[serde(default)]
    model: Option<String>,
}

#[post("run")]
pub async fn run_agent_manager(
    agent_manager: web::Data<Arc<AgentManager>>,
    // cache: web::Data<Cache>,
    user: User,
    db: web::Data<DB>,
    worker_message_queue: web::Data<Arc<MessageQueue>>,
    request: web::Json<RunAgentRequest>,
) -> ResponseResult {
    let request = request.into_inner();

    let chat_id = request.chat_id.unwrap_or(Uuid::new_v4());
    let mut receiver = worker_message_queue
        .get_receiver(
            AGENT_WORKER_QUEUE,
            AGENT_WORKER_EXCHANGE,
            &chat_id.to_string(),
        )
        .await
        .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;

    let first_chunk = if request.chat_id.is_some() {
        // An existing session, this is a reconnection
        let existing_messages = db::agent_messages::get_chat_messages(&db.pool, &chat_id, &user.id)
            .await
            .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;
        let existing_messages: Vec<MessageHistoryItem> =
            existing_messages.into_iter().map(|m| m.into()).collect();

        dbg!(&existing_messages.len());

        if existing_messages
            .iter()
            .any(|m| matches!(m.content, RunAgentResponseStreamChunk::FinalOutput(_)))
        {
            let chunk = AgentStreamChunk::ExistingMessages(ExistingMessagesChunkContent {
                chat_id,
                message_history: existing_messages,
            });
            return Ok(HttpResponse::Ok()
                .content_type("text/event-stream")
                .streaming(futures::stream::once(async move {
                    anyhow::Ok(bytes::Bytes::from(serde_json::to_vec(&chunk).unwrap()))
                })));
        }
        AgentStreamChunk::ExistingMessages(ExistingMessagesChunkContent {
            chat_id,
            message_history: existing_messages,
        })
    } else {
        // We don't need to pass the project_id to the agent, but currently
        // it fails if we don't pass it.
        // TODO: Clean this up, once the agent is updated.
        let request_api_key_vals = ProjectApiKeyVals::new();
        // let request_api_key = ProjectApiKey {
        //     project_id: Uuid::new_v4(),
        //     name: Some(format!("tmp-agent-{}", chat_id)),
        //     hash: request_api_key_vals.hash,
        //     shorthand: request_api_key_vals.shorthand,
        // };

        // let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{}", request_api_key.hash);
        // cache
        //     .insert::<ProjectApiKey>(&cache_key, request_api_key.clone())
        //     .await
        //     .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;

        // cache
        //     .set_ttl(&cache_key, REQUEST_API_KEY_TTL)
        //     .await
        //     .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;

        let chat_id = Uuid::new_v4();
        // Run agent worker
        tokio::spawn(async move {
            run_agent_worker(
                agent_manager.as_ref().clone(),
                worker_message_queue.as_ref().clone(),
                db.into_inner(),
                chat_id,
                user.id,
                request.prompt,
                request_api_key_vals.value,
                request.model_provider,
                request.model,
            )
            .await;
        });
        AgentStreamChunk::ExistingMessages(ExistingMessagesChunkContent {
            chat_id,
            message_history: vec![],
        })
    };

    let stream = futures::stream::once(async move { anyhow::Ok(first_chunk) });

    let receiver_stream = async_stream::stream! {
        while let Some(delivery) = receiver.receive().await {
            if let Err(e) = delivery {
                log::error!("Error receiving message: {}", e);
                continue;
            }

            let delivery = delivery.unwrap();
            let acker = delivery.acker();
            let chunk = serde_json::from_slice::<RunAgentResponseStreamChunk>(&delivery.data())?;

            let chunk: AgentStreamChunk = chunk.into();
            if matches!(chunk, AgentStreamChunk::FinalOutput(_)) {
                yield anyhow::Ok(chunk);
                break;
            }

            yield anyhow::Ok(chunk);

            acker.ack().await?;
        }
    };

    let combined_stream = stream.chain(receiver_stream);

    // TODO: should we comply with SSE eventstream?
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(
            combined_stream
                .map(|r| r.map(|chunk| bytes::Bytes::from(serde_json::to_vec(&chunk).unwrap()))),
        ))
}
