use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::channel::AgentManagerWorkers;
use crate::agent_manager::types::{ControlChunk, RunAgentResponseStreamChunk, WorkerStreamChunk};
use crate::agent_manager::worker::{run_agent_worker, RunAgentWorkerOptions};
use crate::agent_manager::{types::ModelProvider, AgentManager, AgentManagerTrait};
use crate::cache::{keys::PROJECT_API_KEY_CACHE_KEY, Cache, CacheTrait};
use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};
use crate::features::{is_feature_enabled, Feature};
use crate::project_api_keys::ProjectApiKeyVals;
use crate::routes::types::ResponseResult;
use crate::traces::limits::get_workspace_limit_exceeded_by_project_id;

const REQUEST_API_KEY_TTL: u64 = 60 * 60; // 1 hour

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
                    return Ok(HttpResponse::Forbidden().json("Workspace step limit exceeded"));
                }
            }
            Err(e) => {
                log::error!("Error getting workspace limit exceeded: {}", e);
            }
        }
    }
    let request_api_key_vals = ProjectApiKeyVals::new();
    let request_api_key = ProjectApiKey {
        project_id: project_api_key.project_id,
        name: Some(format!("tmp-agent-{}", Uuid::new_v4())),
        hash: request_api_key_vals.hash,
        shorthand: request_api_key_vals.shorthand,
    };

    let session_id = Uuid::new_v4();

    let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{}", request_api_key.hash);
    cache
        .insert::<ProjectApiKey>(&cache_key, request_api_key.clone())
        .await
        .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;

    cache
        .set_ttl(&cache_key, REQUEST_API_KEY_TTL)
        .await
        .map_err(|e| crate::routes::error::Error::InternalAnyhowError(e.into()))?;

    if request.stream {
        let mut receiver = worker_states.create_channel_and_get_rx(session_id);
        let options = RunAgentWorkerOptions {
            model_provider: request.model_provider,
            model: request.model,
            enable_thinking: request.enable_thinking,
        };
        let pool = db.pool.clone();
        tokio::spawn(async move {
            run_agent_worker(
                agent_manager.clone(),
                worker_states.as_ref().clone(),
                db.clone(),
                session_id,
                None,
                request.prompt,
                options,
            )
            .await;
        });
        let stream = async_stream::stream! {
            while let Some(message) = receiver.recv().await {
                match message {
                    Ok(WorkerStreamChunk::AgentChunk(agent_chunk)) => {
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
                    let data =
                        serde_json::to_string::<RunAgentResponseStreamChunk>(&chunk).unwrap();
                    bytes::Bytes::from(format!("data: {}\n\n", data))
                })
            })))
    } else {
        let fut = tokio::spawn(async move {
            agent_manager
                .run_agent(
                    request.prompt,
                    session_id,
                    false,
                    Some(request_api_key_vals.value),
                    request.parent_span_context.clone(),
                    request.model_provider,
                    request.model.clone(),
                    request.enable_thinking,
                    Vec::new(),
                )
                .await
        });

        worker_states.insert_abort_handle(session_id, fut.abort_handle());

        match fut.await {
            Ok(response) => {
                // TODO: hard-coded 1 for now, but we should get the actual number of steps from the response
                if let Err(e) = db::stats::add_agent_steps_to_project_usage_stats(
                    &db.pool,
                    &project_api_key.project_id,
                    1,
                )
                .await
                {
                    log::error!("Error adding agent steps to project usage stats: {}", e);
                }
                Ok(HttpResponse::Ok().json(response?))
            }
            Err(e) if e.is_cancelled() => Ok(HttpResponse::NoContent().finish()),
            Err(e) => {
                log::error!("Error running agent: {}", e);
                Ok(HttpResponse::InternalServerError().finish())
            }
        }
    }
}
