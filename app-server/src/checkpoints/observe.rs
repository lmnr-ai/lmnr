//! Self-traces the checkpointing pipeline's LLM calls as nested OTEL spans
//! (`checkpoint` → `classify_agent` / `extract_stable_system_prompt`) on the
//! `lmnr::internal` target. Those spans flow through the internal OTEL provider
//! (see `crate::instrumentation`) and are no-ops when no internal project is
//! configured (`CHECKPOINTS_INTERNAL_PROJECT_ID` unset).

use serde_json::{Value, json};
use tracing::{Instrument, info_span};
use tracing_opentelemetry::OpenTelemetrySpanExt;
use uuid::Uuid;

use crate::instrumentation::spans::{InternalSpan, SpanType, record_error, set_output, set_usage};
use crate::llm::{
    LlmClient, ProviderRequest, ProviderResponse, ProviderResult, ProviderUsageMetadata,
    request_to_span_input, request_to_tools_attr,
};
use crate::traces::span_attributes::CHECKPOINT_INTERNAL_SPAN;

// `info_span!` needs a literal target; mirrors `crate::instrumentation::INTERNAL_TRACING_TARGET`.
const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

/// Routing + association context shared by every span in one checkpoint run.
#[derive(Clone, Copy)]
pub struct CheckpointScope {
    /// Destination project for the internal spans. `None` → not stamped (tracing disabled).
    pub project_id: Option<Uuid>,
    /// The client trace being analyzed; surfaced as the internal trace's session id + metadata.
    pub trace_id: Uuid,
}

/// The checkpoint pipeline's two span shapes, each pre-applying the per-run association attributes
/// and the `CHECKPOINT_INTERNAL_SPAN` flag so the producer never re-checkpoints our own spans.
pub struct SpanBuilder;

impl SpanBuilder {
    fn base(span: tracing::Span, span_type: SpanType, scope: &CheckpointScope) -> InternalSpan {
        // The producer's self-ingestion guard (`is_checkpoint_internal`) reads this raw bool attr.
        span.set_attribute(CHECKPOINT_INTERNAL_SPAN, true);
        InternalSpan::wrap(span, span_type)
            .project(scope.project_id)
            .session_id(&scope.trace_id.to_string())
            .metadata_str("trace_id", &scope.trace_id.to_string())
    }

    /// Root span for one checkpoint; `parent: None` roots a fresh internal trace.
    pub fn checkpoint_root(scope: &CheckpointScope) -> tracing::Span {
        let span = info_span!(target: INTERNAL_TRACING_TARGET, parent: None, "checkpoint");
        Self::base(span, SpanType::Default, scope).build()
    }

    fn llm(scope: &CheckpointScope, name: &str) -> InternalSpan {
        // Literal names so `otel.name` is reliable rather than relying on a runtime field.
        let span = match name {
            "classify_agent" => info_span!(target: INTERNAL_TRACING_TARGET, "classify_agent"),
            "extract_stable_system_prompt" => {
                info_span!(target: INTERNAL_TRACING_TARGET, "extract_stable_system_prompt")
            }
            _ => info_span!(target: INTERNAL_TRACING_TARGET, "llm_call"),
        };
        Self::base(span, SpanType::LLM, scope)
    }
}

/// Run an LLM call, tracing it as a child `LLM` span when `scope` is set. Without a scope the call
/// runs untraced. The span attaches to the ambient `checkpoint` root via the tracing context.
pub async fn run_llm(
    scope: Option<&CheckpointScope>,
    llm_client: &LlmClient,
    name: &str,
    request: &ProviderRequest,
) -> ProviderResult<ProviderResponse> {
    let Some(scope) = scope else {
        return llm_client.generate_content(request).await;
    };

    let (model, provider) = llm_client.resolve_model_provider(request);
    let span = SpanBuilder::llm(scope, name)
        .input(&request_to_span_input(request))
        .model(&provider, &model)
        .tools(request_to_tools_attr(request).as_ref())
        .build();

    let result = llm_client
        .generate_content(request)
        .instrument(span.clone())
        .await;

    match &result {
        Ok(response) => {
            set_output(&span, &response_to_output(response));
            if let Some(usage) = response.usage_metadata.as_ref() {
                set_llm_usage(&span, usage);
            }
        }
        Err(e) => record_error(&span, format!("{e:?}")),
    }
    result
}

fn set_llm_usage(span: &tracing::Span, usage: &ProviderUsageMetadata) {
    set_usage(
        span,
        usage.prompt_token_count,
        usage.cache_read_input_tokens,
        usage.candidates_token_count,
    );
}

/// Serialize the response's first candidate content as the span output — a `ProviderContent`
/// (`{role, parts}`), matching `request_to_span_input` so the trace UI parses both identically.
fn response_to_output(response: &ProviderResponse) -> Value {
    response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|content| serde_json::to_value(content).ok())
        .unwrap_or_else(|| json!({ "role": "model", "parts": [] }))
}
