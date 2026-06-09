//! Traces the checkpointing pipeline's LLM calls as a single trace in an
//! internal project (`CHECKPOINTS_INTERNAL_PROJECT_ID`).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::spans::{Span, SpanType},
    llm::{LlmClient, ProviderContent, ProviderRequest, ProviderResponse, ProviderResult},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    traces::{
        OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY,
        span_attributes::{
            CHECKPOINT_INTERNAL_SPAN, GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_TOKENS,
            GEN_AI_REQUEST_MODEL, GEN_AI_SYSTEM,
        },
        spans::SpanAttributes,
    },
};

pub struct CheckpointObserver {
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    root_span_id: Uuid,
    start_time: DateTime<Utc>,
    spans: Mutex<Vec<Span>>,
}

impl CheckpointObserver {
    pub fn new(queue: Arc<MessageQueue>, project_id: Uuid) -> Self {
        Self {
            queue,
            project_id,
            trace_id: Uuid::new_v4(),
            root_span_id: Uuid::new_v4(),
            start_time: Utc::now(),
            spans: Mutex::new(Vec::new()),
        }
    }

    pub async fn run_llm_call(
        &self,
        llm_client: &LlmClient,
        name: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        let (model, provider) = llm_client.resolve_model_provider(request);
        let start = Utc::now();
        let result = llm_client.generate_content(request).await;
        let end = Utc::now();

        let (output, status) = match &result {
            Ok(response) => (response_to_output(response), None),
            Err(e) => (json!({ "error": e.to_string() }), Some("error".to_string())),
        };
        let usage = result.as_ref().ok().and_then(|r| r.usage_metadata.as_ref()).map(|u| {
            (
                u.prompt_token_count.unwrap_or(0),
                u.candidates_token_count.unwrap_or(0),
            )
        });

        self.push_span(name, request, &model, &provider, output, status, usage, start, end);
        result
    }

    #[allow(clippy::too_many_arguments)]
    fn push_span(
        &self,
        name: &str,
        request: &ProviderRequest,
        model: &str,
        provider: &str,
        output: Value,
        status: Option<String>,
        usage: Option<(i32, i32)>,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) {
        let mut attributes = HashMap::from([
            (CHECKPOINT_INTERNAL_SPAN.to_string(), json!(true)),
            (GEN_AI_REQUEST_MODEL.to_string(), json!(model)),
            (GEN_AI_SYSTEM.to_string(), json!(provider)),
        ]);
        if let Some((input_tokens, output_tokens)) = usage {
            attributes.insert(GEN_AI_INPUT_TOKENS.to_string(), json!(input_tokens));
            attributes.insert(GEN_AI_OUTPUT_TOKENS.to_string(), json!(output_tokens));
        }

        let span = Span {
            span_id: Uuid::new_v4(),
            trace_id: self.trace_id,
            project_id: self.project_id,
            parent_span_id: Some(self.root_span_id),
            name: name.to_string(),
            attributes: SpanAttributes::new(attributes),
            input: Some(request_to_input(request)),
            output: Some(output),
            span_type: SpanType::LLM,
            start_time,
            end_time,
            status,
            events: vec![],
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        if let Ok(mut spans) = self.spans.lock() {
            spans.push(span);
        }
    }

    pub async fn finish(self) {
        let mut spans = self.spans.into_inner().unwrap_or_else(|e| e.into_inner());
        if spans.is_empty() {
            return;
        }

        spans.push(Span {
            span_id: self.root_span_id,
            trace_id: self.trace_id,
            project_id: self.project_id,
            parent_span_id: None,
            name: "checkpoint".to_string(),
            attributes: SpanAttributes::new(HashMap::from([(
                CHECKPOINT_INTERNAL_SPAN.to_string(),
                json!(true),
            )])),
            input: None,
            output: None,
            span_type: SpanType::Default,
            start_time: self.start_time,
            end_time: Utc::now(),
            status: None,
            events: vec![],
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        });

        let messages: Vec<RabbitMqSpanMessage> = spans
            .into_iter()
            .map(|span| RabbitMqSpanMessage {
                span,
                pre_processed: true,
                input_dedup: None,
                output_dedup: None,
                tool_dedup: None,
            })
            .collect();

        let payload = match serde_json::to_vec(&messages) {
            Ok(payload) => payload,
            Err(e) => {
                log::error!("[CHECKPOINTS] Failed to serialize tracing spans: {e:?}");
                return;
            }
        };
        if payload.len() >= mq_max_payload() {
            log::warn!("[CHECKPOINTS] Tracing span payload too large, skipping");
            return;
        }

        if let Err(e) = self
            .queue
            .publish(&payload, OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, None)
            .await
        {
            log::warn!("[CHECKPOINTS] Failed to publish tracing spans: {e:?}");
        }
    }
}

pub async fn run_llm(
    observer: Option<&CheckpointObserver>,
    llm_client: &LlmClient,
    name: &str,
    request: &ProviderRequest,
) -> ProviderResult<ProviderResponse> {
    match observer {
        Some(observer) => observer.run_llm_call(llm_client, name, request).await,
        None => llm_client.generate_content(request).await,
    }
}

fn content_text(content: &ProviderContent) -> String {
    content
        .parts
        .as_ref()
        .map(|parts| parts.iter().filter_map(|p| p.text.clone()).collect::<Vec<_>>().join(""))
        .unwrap_or_default()
}

/// OpenAI chat-completions shape, matching `response_to_output` so the span
/// renderer parses input and output the same way.
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
