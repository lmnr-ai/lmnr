use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use futures::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::agent_manager::{types::ModelProvider, AgentManager, AgentManagerTrait};
use crate::cache::{keys::PROJECT_API_KEY_CACHE_KEY, Cache, CacheTrait};
use crate::db::project_api_keys::ProjectApiKey;
use crate::project_api_keys::ProjectApiKeyVals;
use crate::routes::types::ResponseResult;

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
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    request: web::Json<RunAgentRequest>,
) -> ResponseResult {
    let request = request.into_inner();
    let agent_manager = agent_manager.as_ref().clone();

    let request_api_key_vals = ProjectApiKeyVals::new();
    let request_api_key = ProjectApiKey {
        project_id: project_api_key.project_id,
        name: Some(format!("tmp-agent-{}", Uuid::new_v4())),
        hash: request_api_key_vals.hash,
        shorthand: request_api_key_vals.shorthand,
    };

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
        let stream = agent_manager
            .run_agent_stream(
                request.prompt,
                None,
                Some(request_api_key_vals.value),
                request.parent_span_context,
                request.model_provider,
                request.model,
                request.enable_thinking,
                Vec::new(),
            )
            .await;

        Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(stream.map(|r| {
                r.map(|chunk| {
                    let data = serde_json::to_string(&chunk).unwrap();
                    bytes::Bytes::from(format!("data: {}\n\n", data))
                })
            })))
    } else {
        let response = agent_manager
            .run_agent(
                request.prompt,
                None,
                Some(request_api_key_vals.value),
                request.parent_span_context,
                request.model_provider,
                request.model,
                request.enable_thinking,
                Vec::new(),
            )
            .await?;

        Ok(HttpResponse::Ok().json(response))
    }
}
