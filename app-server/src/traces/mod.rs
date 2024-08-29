use std::{collections::HashMap, sync::Arc};

use attributes::{
    GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_TOKENS, GEN_AI_REQUEST_IS_STREAM, GEN_AI_REQUEST_MODEL,
    GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM, GEN_AI_TOTAL_TOKENS, GEN_AI_USAGE_COST,
};
use events::{auto_check_and_record_events, create_events};
use serde_json::Value;
use tokio::sync::mpsc::Receiver;
use uuid::Uuid;

use crate::{
    db::{
        events::{EventObservation, EventSource},
        trace::{self, Span, SpanWithChecksAndEvents, Trace, TraceAttributes},
        DB,
    },
    language_model::{
        providers::openai, ChatMessage, ExecuteChatCompletion, LanguageModelProvider,
        LanguageModelProviderName, LanguageModelRunner,
    },
};

pub mod attributes;
pub mod events;

pub struct BatchObservations {
    pub project_id: Uuid,
    pub traces: Vec<Trace>,
    pub spans_with_checks: Vec<SpanWithChecksAndEvents>,
    pub event_payloads: Vec<EventObservation>,
    pub cumulative_trace_attributes: HashMap<Uuid, TraceAttributes>,
}

pub async fn span_listener(
    db: Arc<DB>,
    mut rx: Receiver<BatchObservations>,
    language_model_runner: Arc<LanguageModelRunner>,
) {
    while let Some(batch) = rx.recv().await {
        let BatchObservations {
            project_id,
            traces,
            spans_with_checks,
            event_payloads,
            cumulative_trace_attributes,
        } = batch;
        // First, need to record all traces, because spans reference traces through foreign key
        // TODO: Sort trace updates by update timestamp (for single-threaded front-end this isn't an issue)
        for trace in traces.into_iter() {
            let _ = trace::record_trace(&db.pool, project_id, trace).await;
        }

        // Update trace attributes
        for trace_attributes in cumulative_trace_attributes.values() {
            let _ = trace::update_trace_attributes(&db.pool, trace_attributes).await;
        }

        // TODO: exponential backoff on span updates
        // Spans don't reference themselves in parent_span_id, so can be recorded in any order
        let spans = spans_with_checks.iter().map(|s| s.span.clone()).collect();
        let _ = trace::record_spans(&db.pool, spans).await;

        // Record events only after all spans are recorded
        let add_instrumentation_events_res =
            create_events(db.clone(), event_payloads, EventSource::CODE).await;
        if let Err(e) = add_instrumentation_events_res {
            log::error!("Failed to add instrumentation events: {:?}", e);
        }

        let tag_res = auto_check_and_record_events(
            spans_with_checks,
            db.clone(),
            language_model_runner.clone(),
            project_id,
        )
        .await;
        if let Err(e) = tag_res {
            log::error!("Failed to tag and record spans: {:?}", e);
        }
    }
    log::info!("Shutting down span listener");
}

pub struct SpanUsage {
    pub total_tokens: Option<u32>,
    pub approximate_cost: Option<f64>,
}

pub fn get_llm_usage_for_span(
    span: &Span,
    language_model_runner: Arc<LanguageModelRunner>,
) -> anyhow::Result<SpanUsage> {
    let attributes = serde_json::from_value::<HashMap<String, Value>>(span.attributes.clone())?;

    let mut total_tokens = attributes
        .get(GEN_AI_TOTAL_TOKENS)
        .and_then(|v| serde_json::from_value::<u32>(v.clone()).ok());
    let mut approximate_cost = attributes
        .get(GEN_AI_USAGE_COST)
        .and_then(|v| serde_json::from_value::<f64>(v.clone()).ok());

    let input_tokens = attributes
        .get(GEN_AI_INPUT_TOKENS)
        .and_then(|v| serde_json::from_value::<u32>(v.clone()).ok());
    let output_tokens = attributes
        .get(GEN_AI_OUTPUT_TOKENS)
        .and_then(|v| serde_json::from_value::<u32>(v.clone()).ok());

    let stream = attributes
        .get(GEN_AI_REQUEST_IS_STREAM)
        .and_then(|v| serde_json::from_value::<bool>(v.clone()).ok())
        .unwrap_or_default();
    let response_model = attributes
        .get(GEN_AI_RESPONSE_MODEL)
        .and_then(|v| serde_json::from_value::<String>(v.clone()).ok());
    let model_name = response_model.or(attributes
        .get(GEN_AI_REQUEST_MODEL)
        .and_then(|v| serde_json::from_value::<String>(v.clone()).ok()));
    let provider_name = attributes
        .get(GEN_AI_SYSTEM)
        .and_then(|v| serde_json::from_value::<String>(v.clone()).ok());
    let provider = provider_name
        .and_then(|v| LanguageModelProviderName::from_str(&v).ok())
        .and_then(|name| language_model_runner.models.get(&name).cloned());

    let messages = span
        .input
        .clone()
        .and_then(|inp| serde_json::from_value::<Vec<ChatMessage>>(inp).ok())
        .unwrap_or_default();

    if approximate_cost.is_none() {
        if let Some(model) = model_name.as_deref() {
            if let Some(provider) = provider {
                if let Some(input_tokens) = input_tokens {
                    if let Some(output_tokens) = output_tokens {
                        approximate_cost =
                            provider.estimate_cost(model, output_tokens, input_tokens);
                        if total_tokens.is_none() {
                            total_tokens = Some(input_tokens + output_tokens);
                        }
                    }
                } else if let Some(output_tokens) = output_tokens {
                    if matches!(provider, LanguageModelProvider::OpenAI(_)) && stream {
                        // OpenAI doesn't provide input token count when streaming, so try and tokenize our side
                        let input_tokens =
                            openai::num_tokens_from_messages(model, &messages).unwrap();

                        approximate_cost =
                            provider.estimate_cost(model, output_tokens, input_tokens);
                        if total_tokens.is_none() {
                            total_tokens = Some(input_tokens + output_tokens);
                        }
                    }
                }
            }
        }
    }

    Ok(SpanUsage {
        total_tokens,
        approximate_cost,
    })
}
