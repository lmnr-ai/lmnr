use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::channel::AgentManagerChannel;
use crate::agent_manager::types::RunAgentResponseStreamChunk;
use crate::agent_manager::worker::{run_agent_worker, RunAgentWorkerOptions};
use crate::db::user::User;
use crate::routes::types::ResponseResult;
use crate::{
    agent_manager::{types::ModelProvider, AgentManager},
    db::DB,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunAgentRequest {
    prompt: String,
    chat_id: Uuid,
    #[serde(default)]
    model_provider: Option<ModelProvider>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default = "default_true")]
    enable_thinking: bool,

    #[serde(default)]
    /// If true, we start the agent from scratch; otherwise, we connect to the existing stream
    is_new_user_message: bool,
}

fn default_true() -> bool {
    true
}

#[post("run")]
pub async fn run_agent_manager(
    agent_manager: web::Data<Arc<AgentManager>>,
    user: User,
    db: web::Data<DB>,
    worker_channel: web::Data<Arc<AgentManagerChannel>>,
    request: web::Json<RunAgentRequest>,
) -> ResponseResult {
    let request = request.into_inner();

    let chat_id = request.chat_id;

    if !request.is_new_user_message && worker_channel.is_ended(chat_id) {
        return Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(tokio_stream::empty::<anyhow::Result<bytes::Bytes>>()));
    }

    let mut receiver = worker_channel.create_channel_and_get_rx(chat_id);

    if request.is_new_user_message {
        let options = RunAgentWorkerOptions {
            request_api_key: None,
            model_provider: request.model_provider,
            model: request.model,
            enable_thinking: request.enable_thinking,
        };
        // Run agent worker
        // TODO: we should probably remove `request_api_key` from `RunAgentWorkerOptions`
        // and always set None inside the worker
        tokio::spawn(async move {
            run_agent_worker(
                agent_manager.as_ref().clone(),
                worker_channel.as_ref().clone(),
                db.into_inner(),
                chat_id,
                user.id,
                request.prompt,
                options,
            )
            .await;
        });
    }

    let stream = async_stream::stream! {
        while let Some(message) = receiver.recv().await {
            match message {
                Ok(RunAgentResponseStreamChunk::FinalOutput(_)) => {
                    yield message;
                    break;
                }
                Ok(RunAgentResponseStreamChunk::Step(_)) => {
                    yield message;
                }
                Err(e) => {
                    log::error!("Error running agent: {}", e);
                    break;
                }
            }
        }
    };

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(stream.map(|r| {
            r.map(|chunk| {
                let json = serde_json::to_string(&chunk).unwrap();
                bytes::Bytes::from(format!("data: {}\n\n", json))
            })
        })))
}
