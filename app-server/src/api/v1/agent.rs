use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures_util::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::channel::AgentManagerWorkers;
use crate::agent_manager::types::RunAgentResponseStreamChunk;
use crate::agent_manager::worker::{run_agent_worker, RunAgentWorkerOptions};
use crate::agent_manager::RunAgentParams;
use crate::agent_manager::{types::ModelProvider, AgentManager, AgentManagerTrait};
use crate::cache::Cache;
use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};
use crate::features::{is_feature_enabled, Feature};
use crate::routes::types::ResponseResult;
use crate::traces::limits::get_workspace_limit_exceeded_by_project_id;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunAgentRequest {
    prompt: String,
    #[serde(default)]
    parent_span_context: Option<String>,
    #[serde(default)]
    model_provider: Option<ModelProvider>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    stream: bool,
    #[serde(default = "default_true")]
    enable_thinking: bool,
    #[serde(default)]
    return_screenshots: bool,
    #[serde(default)]
    return_agent_state: bool,
    #[serde(default)]
    return_storage_state: bool,
    #[serde(default)]
    agent_state: Option<String>,
    #[serde(default)]
    storage_state: Option<String>,
    #[serde(default)]
    timeout: Option<u64>,
    #[serde(default)]
    cdp_url: Option<String>,
    #[serde(default)]
    max_steps: Option<u64>,
    #[serde(default)]
    thinking_token_budget: Option<u64>,
    #[serde(default)]
    start_url: Option<String>,
}

fn default_true() -> bool {
    true
}

#[post("agent/run")]
pub async fn run_agent_manager(
    agent_manager: web::Data<Arc<AgentManager>>,
    worker_states: web::Data<Arc<AgentManagerWorkers>>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    request: web::Json<RunAgentRequest>,
) -> ResponseResult {
    let request = request.into_inner();
    let agent_manager = agent_manager.as_ref().clone();
    let db = db.into_inner();
    let cache = cache.into_inner();
    let (drop_sender, drop_guard) = tokio::sync::oneshot::channel::<()>();
    let worker_states = worker_states.into_inner();

    if is_feature_enabled(Feature::UsageLimit) {
        match get_workspace_limit_exceeded_by_project_id(
            db.clone(),
            cache.clone(),
            project_api_key.project_id,
        )
        .await
        {
            Ok(limits_exceeded) => {
                if limits_exceeded.steps {
                    return Ok(HttpResponse::Forbidden().json(
                        serde_json::json!({
                            "error": "Workspace step limit exceeded",
                            "message": "You have exceeded your step limit. Please upgrade to a paid plan to continue.",
                        }),
                    ));
                }
            }
            Err(e) => {
                log::error!("Error getting workspace limit exceeded: {}", e);
            }
        }
    }

    let session_id = Uuid::new_v4();

    let worker_states_clone = worker_states.clone();
    let pool = db.pool.clone();
    tokio::spawn(async move {
        let _ = drop_guard.await;

        if let Err(e) = db::agent_chats::update_agent_chat_status(&pool, "idle", &session_id).await
        {
            log::error!("Error updating agent chat: {}", e);
        }
        worker_states_clone.stop_session(session_id).await;
    });

    if request.stream {
        let mut receiver = worker_states.create_channel_and_get_rx(session_id);
        let options = RunAgentWorkerOptions {
            model_provider: request.model_provider,
            model: request.model,
            enable_thinking: request.enable_thinking,
            agent_state: request.agent_state,
            storage_state: request.storage_state,
            timeout: request.timeout,
            cdp_url: request.cdp_url,
            max_steps: request.max_steps,
            thinking_token_budget: request.thinking_token_budget,
            start_url: request.start_url,
            return_screenshots: request.return_screenshots,
            return_agent_state: request.return_agent_state,
            return_storage_state: request.return_storage_state,
        };
        let pool = db.pool.clone();
        let worker_states_clone = worker_states.clone();
        let handle = tokio::spawn(async move {
            run_agent_worker(
                agent_manager.clone(),
                worker_states_clone.as_ref().clone(),
                db.clone(),
                session_id,
                None,
                Some(project_api_key.raw),
                request.prompt,
                options,
            )
            .await;
        });
        worker_states.insert_abort_handle(session_id, handle.abort_handle());
        let stream = async_stream::stream! {
            let _drop_guard = drop_sender;
            while let Some(message) = receiver.recv().await {
                match message {
                    Ok(agent_chunk) => {
                        if let Err(e) =
                            db::stats::add_agent_steps_to_project_usage_stats(&pool, &project_api_key.project_id, 1)
                                .await
                        {
                            log::error!("Error adding agent steps to project usage stats: {}", e);
                        }

                        match agent_chunk {
                            RunAgentResponseStreamChunk::FinalOutput(_) => {
                                yield anyhow::Ok(agent_chunk.into());
                                break;
                            }
                            RunAgentResponseStreamChunk::Step(_) => {
                                yield anyhow::Ok(agent_chunk.into());
                            }
                            RunAgentResponseStreamChunk::Error(_) => {
                                yield anyhow::Ok(agent_chunk.into());
                                break;
                            }
                            RunAgentResponseStreamChunk::Timeout(_) => {
                                yield anyhow::Ok(agent_chunk.into());
                                break;
                            }
                        }
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
                    let data =
                        serde_json::to_string::<RunAgentResponseStreamChunk>(&chunk).unwrap();
                    bytes::Bytes::from(format!("data: {}\n\n", data))
                })
            })))
    } else {
        let fut = tokio::spawn(async move {
            agent_manager
                .run_agent(RunAgentParams {
                    prompt: request.prompt,
                    session_id,
                    is_chat_request: false,
                    request_api_key: Some(project_api_key.raw),
                    parent_span_context: request.parent_span_context.clone(),
                    model_provider: request.model_provider,
                    model: request.model.clone(),
                    enable_thinking: request.enable_thinking,
                    storage_state: request.storage_state,
                    agent_state: request.agent_state,
                    timeout: request.timeout,
                    cdp_url: request.cdp_url,
                    max_steps: request.max_steps,
                    thinking_token_budget: request.thinking_token_budget,
                    start_url: request.start_url,
                    return_agent_state: request.return_agent_state,
                    return_storage_state: request.return_storage_state,
                    return_screenshots: request.return_screenshots,
                })
                .await
        });

        worker_states.insert_abort_handle(session_id, fut.abort_handle());

        match fut.await {
            Ok(response) => {
                let response = response?;
                if let Err(e) = db::stats::add_agent_steps_to_project_usage_stats(
                    &db.pool,
                    &project_api_key.project_id,
                    response.step_count.unwrap_or(0) as i64,
                )
                .await
                {
                    log::error!("Error adding agent steps to project usage stats: {}", e);
                }
                Ok(HttpResponse::Ok().json(response))
            }
            Err(e) if e.is_cancelled() => Ok(HttpResponse::NoContent().finish()),
            Err(e) => {
                log::error!("Error running agent: {}", e);
                Ok(HttpResponse::InternalServerError().body(e.to_string()))
            }
        }
    }
}
