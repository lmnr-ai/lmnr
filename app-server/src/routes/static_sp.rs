//! On-demand runner for the static system prompt extraction agent
//! (`traces::system_extraction`), so it can be evaluated from outside before
//! it's wired into ingest. Internally traced: pass `internalProjectId` to see
//! the run's spans as a Laminar trace, and optionally `parentTraceparent`
//! (W3C) to attach the run under an external eval's span.

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::instrumentation::spans::SpanContextCarrier;
use crate::llm::{LlmClient, models::ModelSize};
use crate::routes::ResponseResult;
use crate::traces::static_sp_extraction::{
    ExtractionConfig, ExtractionResult, ExtractionTracing, extract_static_regexes,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractSystemPromptRequest {
    /// Example system prompts from one template family.
    pub examples: Vec<String>,
    pub provider: Option<String>,
    pub model_size: Option<ModelSize>,
    pub include_diff: Option<bool>,
    /// Destination project for the run's internal-tracing spans; omit to
    /// disable tracing for this run.
    pub internal_project_id: Option<Uuid>,
    /// W3C `traceparent` re-rooting the run under the caller's span;
    /// malformed values degrade to a fresh trace.
    pub parent_traceparent: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractSystemPromptResponse {
    pub regexes: Vec<String>,
    /// Total `regex`-tool invocations across all retry attempts.
    pub tool_calls: usize,
}

#[post("system-extraction")]
pub async fn extract_system_prompt(
    project_id: web::Path<Uuid>,
    request: web::Json<ExtractSystemPromptRequest>,
    llm_client: web::Data<Option<Arc<LlmClient>>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    if request.examples.iter().all(|e| e.trim().is_empty()) {
        return Ok(HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "examples must not be empty" })));
    }

    let Some(llm_client) = llm_client.get_ref() else {
        return Ok(HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "LLM client is not configured (signals disabled or initialization failed)"
        })));
    };

    let mut config = ExtractionConfig {
        model_size: request.model_size.or(Some(ModelSize::Medium)),
        include_diff: request.include_diff.unwrap_or(true),
        ..Default::default()
    };
    // `Default` seeds the provider from `SP_EXTRACTION_LLM_PROVIDER`; only a
    // request-supplied provider overrides it (naming the field unconditionally
    // would clobber the env default with `None`).
    if let Some(provider) = request.provider {
        config.provider = Some(provider);
    }
    let tracing_ctx = ExtractionTracing {
        project_id: request.internal_project_id,
        source_project_id: Some(project_id),
        parent: request
            .parent_traceparent
            .as_deref()
            .and_then(SpanContextCarrier::from_w3c_traceparent),
        prompt_hash: None,
    };

    let ExtractionResult {
        regexes,
        tool_calls,
    } = extract_static_regexes(llm_client, &request.examples, &config, &tracing_ctx).await;

    Ok(HttpResponse::Ok().json(ExtractSystemPromptResponse {
        regexes,
        tool_calls,
    }))
}
