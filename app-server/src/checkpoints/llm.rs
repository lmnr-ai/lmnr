//! LLM calls for the checkpoints pipeline, instrumented as internal traces:
//! each checkpoint's calls form one trace (a `checkpoint` root + one LLM child
//! per call) on the `lmnr::internal` target. `Option<Uuid>` is the destination
//! project; `None` disables tracing.

use std::sync::OnceLock;

use serde_json::{Value, json};
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;
use uuid::Uuid;

use crate::{
    instrumentation::spans::{InternalSpan, SpanType, record_error, set_output, set_usage},
    llm::{LlmClient, ProviderContent, ProviderRequest, ProviderResponse, ProviderResult},
    traces::span_attributes::CHECKPOINT_INTERNAL_SPAN,
};

/// Lazily-built root grouping one checkpoint's LLM calls into one internal
/// trace. The `checkpoint` span is created on the first `run_llm` call, so a
/// checkpoint that does no LLM work emits nothing.
pub struct CheckpointRoot {
    project_id: Option<Uuid>,
    origin_project_id: Uuid,
    origin_trace_id: Uuid,
    origin_span_id: Uuid,
    span: OnceLock<Option<tracing::Span>>,
}

impl CheckpointRoot {
    pub fn new(
        project_id: Option<Uuid>,
        origin_project_id: Uuid,
        origin_trace_id: Uuid,
        origin_span_id: Uuid,
    ) -> Self {
        Self {
            project_id,
            origin_project_id,
            origin_trace_id,
            origin_span_id,
            span: OnceLock::new(),
        }
    }

    fn span(&self) -> Option<&tracing::Span> {
        self.span
            .get_or_init(|| {
                let project_id = self.project_id?;
                let span = InternalSpan::wrap(
                    tracing::info_span!(target: "lmnr::internal", parent: None, "checkpoint"),
                    SpanType::Default,
                )
                .project(Some(project_id))
                .metadata_str("project_id", &self.origin_project_id.to_string())
                .metadata_str("trace_id", &self.origin_trace_id.to_string())
                .metadata_str("span_id", &self.origin_span_id.to_string())
                .build();
                span.set_attribute(CHECKPOINT_INTERNAL_SPAN, true);
                Some(span)
            })
            .as_ref()
    }
}

/// Run an LLM call, tracing it as an LLM child of `root` when tracing is on.
/// `make_span` is only invoked then, so no orphan span is created otherwise.
pub async fn run_llm<F>(
    root: &CheckpointRoot,
    llm_client: &LlmClient,
    request: &ProviderRequest,
    make_span: F,
) -> ProviderResult<ProviderResponse>
where
    F: FnOnce() -> tracing::Span,
{
    let Some(project_id) = root.project_id else {
        return llm_client.generate_content(request).await;
    };

    let (model, provider) = llm_client.resolve_model_provider(request);
    let span = {
        let _enter = root.span().map(|s| s.enter());
        InternalSpan::wrap(make_span(), SpanType::LLM)
            .project(Some(project_id))
            .model(&provider, &model)
            .input(&request_to_input(request))
            .build()
    };
    span.set_attribute(CHECKPOINT_INTERNAL_SPAN, true);

    async move {
        let result = llm_client.generate_content(request).await;
        let span = tracing::Span::current();
        match &result {
            Ok(response) => {
                set_output(&span, &response_to_output(response));
                if let Some(usage) = response.usage_metadata.as_ref() {
                    set_usage(
                        &span,
                        usage.prompt_token_count,
                        usage.cache_read_input_tokens,
                        usage.candidates_token_count,
                    );
                }
            }
            Err(e) => record_error(&span, e.to_string()),
        }
        result
    }
    .instrument(span)
    .await
}

fn content_text(content: &ProviderContent) -> String {
    content
        .parts
        .as_ref()
        .map(|parts| parts.iter().filter_map(|p| p.text.clone()).collect::<Vec<_>>().join(""))
        .unwrap_or_default()
}

/// OpenAI chat-completions shape, mirrored by `response_to_output`.
fn request_to_input(request: &ProviderRequest) -> Value {
    let mut messages: Vec<Value> = Vec::new();
    if let Some(system) = &request.system_instruction {
        messages.push(json!({ "role": "system", "content": content_text(system) }));
    }
    for content in &request.contents {
        messages.push(json!({
            "role": content.role.clone().unwrap_or_else(|| "user".to_string()),
            "content": content_text(content),
        }));
    }
    json!(messages)
}

fn response_to_output(response: &ProviderResponse) -> Value {
    let parts = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|content| content.parts.as_ref());

    let mut text = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    if let Some(parts) = parts {
        for part in parts {
            if let Some(t) = &part.text {
                text.push_str(t);
            }
            if let Some(fc) = &part.function_call {
                tool_calls.push(json!({ "name": fc.name, "arguments": fc.args }));
            }
        }
    }

    let mut message = json!({ "role": "assistant" });
    if !text.is_empty() {
        message["content"] = json!(text);
    }
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls);
    }
    json!([message])
}
