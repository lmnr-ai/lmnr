use std::{collections::HashMap, sync::Arc};

use attributes::{
    GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_TOKENS, GEN_AI_REQUEST_IS_STREAM, GEN_AI_REQUEST_MODEL,
    GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM, GEN_AI_TOTAL_TOKENS, GEN_AI_USAGE_COST,
};
use events::{create_events, evaluate_and_record_events};
use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};
use serde_json::Value;

use crate::{
    api::v1::traces::Observation,
    cache::Cache,
    db::{
        events::EventSource,
        trace::{self, Span, SpanType, TraceAttributes},
        DB,
    },
    language_model::{
        providers::openai, ChatMessage, ExecuteChatCompletion, LanguageModelProvider,
        LanguageModelProviderName, LanguageModelRunner,
    },
    pipeline::runner::PipelineRunner,
};

pub mod attributes;
pub mod events;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

pub async fn observation_collector(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    language_model_runner: Arc<LanguageModelRunner>,
    rabbitmq_connection: Arc<Connection>,
) {
    let channel = rabbitmq_connection.create_channel().await.unwrap();

    channel
        .queue_bind(
            OBSERVATIONS_QUEUE,
            OBSERVATIONS_EXCHANGE,
            OBSERVATIONS_ROUTING_KEY,
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await
        .unwrap();

    let mut consumer = channel
        .basic_consume(
            OBSERVATIONS_QUEUE,
            OBSERVATIONS_ROUTING_KEY,
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await
        .unwrap();

    while let Some(delivery) = consumer.next().await {
        let delivery = delivery.unwrap();

        let payload = String::from_utf8(delivery.data.clone()).unwrap();
        let observation: Observation = serde_json::from_str(&payload).unwrap();

        match observation {
            Observation::Trace(trace) => {
                let project_id = trace.project_id;
                let _ = trace::record_trace(&db.pool, project_id, trace).await;
            }
            Observation::Span(span) => {
                let span_id = span.span.id;
                let span_end_time = span.span.end_time.clone();
                let mut trace_attributes = TraceAttributes::new(span.span.trace_id);
                let span_usage =
                    get_llm_usage_for_span(&span.span, language_model_runner.clone()).unwrap();
                trace_attributes.update_start_time(span.span.start_time);
                trace_attributes.update_end_time(span.span.end_time);
                if span.span.span_type == SpanType::LLM {
                    trace_attributes.add_cost(span_usage.approximate_cost.unwrap_or(0.0));
                    trace_attributes.add_tokens(span_usage.total_tokens.unwrap_or(0) as i64);
                }

                let _ =
                    trace::update_trace_attributes(&db.pool, &span.project_id, &trace_attributes)
                        .await;
                let record_spans_res = trace::record_span(&db.pool, span.span).await;
                if let Err(e) = record_spans_res {
                    log::error!("Failed to record spans: {:?}", e);
                }

                // Record evaluated events and ordinary events only after all their are recorded
                let eval_res = evaluate_and_record_events(
                    span.evaluate_events,
                    span_id,
                    span_end_time,
                    pipeline_runner.clone(),
                    db.clone(),
                    cache.clone(),
                    span.project_id,
                )
                .await;
                if let Err(e) = eval_res {
                    log::error!("Failed to evaluate and record events: {:?}", e);
                }

                let add_instrumentation_events_res =
                    create_events(db.clone(), span.events, EventSource::CODE, span.project_id)
                        .await;
                if let Err(e) = add_instrumentation_events_res {
                    log::error!("Failed to add instrumentation events: {:?}", e);
                }
            }
        }

        delivery.ack(BasicAckOptions::default()).await.unwrap();
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
