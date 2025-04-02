use std::env;
use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::channel::AgentManagerWorkers;
use crate::agent_manager::types::{ControlChunk, RunAgentResponseStreamChunk, WorkerStreamChunk};
use crate::agent_manager::worker::{run_agent_worker, RunAgentWorkerOptions};
use crate::routes::types::ResponseResult;
use crate::{
    agent_manager::{types::ModelProvider, AgentManager},
    db::DB,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunAgentRequest {
    session_id: Uuid,
    user_id: Uuid,
    #[serde(default)]
    prompt: Option<String>,
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
    db: web::Data<DB>,
    worker_channel: web::Data<Arc<AgentManagerWorkers>>,
    request: web::Json<RunAgentRequest>,
) -> ResponseResult {
    let request = request.into_inner();

    let session_id = request.session_id;

    if !request.is_new_user_message
        && (worker_channel.is_ended(session_id) || worker_channel.is_stopped(session_id))
    {
        return Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(tokio_stream::empty::<anyhow::Result<bytes::Bytes>>()));
    }
    if request.is_new_user_message && request.prompt.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Prompt is required for new user messages"
        })));
    }

    let mut receiver = worker_channel.create_channel_and_get_rx(session_id);

    if request.is_new_user_message {
        let options = RunAgentWorkerOptions {
            model_provider: request.model_provider,
            model: request.model,
            enable_thinking: request.enable_thinking,
        };
        // Run agent worker
        tokio::spawn(async move {
            run_agent_worker(
                agent_manager.as_ref().clone(),
                worker_channel.as_ref().clone(),
                db.into_inner(),
                session_id,
                Some(request.user_id),
                env::var("LMNR_INDEX_PROJECT_API_KEY").ok(),
                request.prompt.unwrap_or_default(),
                options,
            )
            .await;
        });
    }

    let stream = async_stream::stream! {
        while let Some(message) = receiver.recv().await {
            match message {
                Ok(WorkerStreamChunk::AgentChunk(agent_chunk)) => {
                    match agent_chunk {
                        RunAgentResponseStreamChunk::FinalOutput(_) => {
                            yield anyhow::Ok(agent_chunk.into());
                            break;
                        }
                        RunAgentResponseStreamChunk::Step(_) => {
                            yield anyhow::Ok(agent_chunk.into());
                        }
                    }
                }
                Ok(WorkerStreamChunk::ControlChunk(ControlChunk::Stop)) => {
                    break;
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
                let json = serde_json::to_string::<RunAgentResponseStreamChunk>(&chunk).unwrap();
                bytes::Bytes::from(format!("data: {}\n\n", json))
            })
        })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopAgentRequest {
    session_id: Uuid,
}

#[post("stop")]
pub async fn stop_agent_manager(
    worker_channel: web::Data<Arc<AgentManagerWorkers>>,
    request: web::Json<StopAgentRequest>,
) -> ResponseResult {
    let session_id = request.session_id;
    worker_channel.stop_session(session_id).await;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Agent stopped"
    })))
}
