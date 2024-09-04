use std::sync::Arc;

use events::{create_events, evaluate_and_record_events};
use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{
        events::EventSource,
        trace::{self, Span, SpanAttributes, SpanType, TraceAttributes},
        DB,
    },
    language_model::{ExecuteChatCompletion, LanguageModelProviderName, LanguageModelRunner},
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
    clickhouse: clickhouse::Client,
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
        let Ok(delivery) = delivery else {
            log::error!("Failed to get delivery from RabbitMQ. Continuing...");
            continue;
        };

        let Ok(payload) = String::from_utf8(delivery.data.clone()) else {
            log::error!("Failed to parse delivery data as UTF-8. Continuing...");
            continue;
        };

        let Ok(rabbitmq_span_message) = serde_json::from_str::<RabbitMqSpanMessage>(&payload)
        else {
            log::error!("Failed to parse delivery data as `RabbitMqSpanMessage`. Continuing...");
            continue;
        };

        let span: Span = rabbitmq_span_message.span;

        let mut trace_attributes = TraceAttributes::new(span.trace_id);
        let span_usage =
            get_llm_usage_for_span(&span.get_attributes(), language_model_runner.clone());
        trace_attributes.update_start_time(span.start_time);
        trace_attributes.update_end_time(span.end_time);

        let span_attributes = span.get_attributes();

        trace_attributes.update_user_id(span_attributes.user_id());
        trace_attributes.update_session_id(span_attributes.session_id());

        if span.span_type == SpanType::LLM {
            trace_attributes.add_cost(span_usage.total_cost);
            trace_attributes.add_tokens(span_usage.total_tokens);
        }

        let update_attrs_res = trace::update_trace_attributes(
            &db.pool,
            &rabbitmq_span_message.project_id,
            &trace_attributes,
        )
        .await;
        if let Err(e) = update_attrs_res {
            log::error!("Failed to update trace attributes: {:?}", e);
        }

        let record_spans_res = trace::record_span(&db.pool, &span).await;
        if let Err(e) = record_spans_res {
            log::error!("Failed to record spans: {:?}", e);
        }

        let ch_span = CHSpan::from_db_span(&span, span_usage, rabbitmq_span_message.project_id);
        // TODO: Queue batches on client-side and send them every 1-2 seconds
        let insert_span_res = ch::spans::insert_span(clickhouse.clone(), &ch_span).await;
        if let Err(e) = insert_span_res {
            log::error!("Failed to insert span into Clickhouse: {:?}", e);
        }

        // Record evaluated events and ordinary events only after all their are recorded
        let eval_res = evaluate_and_record_events(
            rabbitmq_span_message.evaluate_events,
            span.span_id,
            pipeline_runner.clone(),
            db.clone(),
            cache.clone(),
            rabbitmq_span_message.project_id,
        )
        .await;
        if let Err(e) = eval_res {
            log::error!("Failed to evaluate and record events: {:?}", e);
        }

        let add_instrumentation_events_res = create_events(
            db.clone(),
            rabbitmq_span_message.events,
            EventSource::CODE,
            rabbitmq_span_message.project_id,
        )
        .await;
        if let Err(e) = add_instrumentation_events_res {
            log::error!("Failed to add instrumentation events: {:?}", e);
        }

        let _ = delivery
            .ack(BasicAckOptions::default())
            .await
            .map_err(|e| log::error!("Failed to ack RabbitMQ delivery: {:?}", e));
    }

    log::info!("Shutting down span listener");
}

pub struct SpanUsage {
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub model: Option<String>,
    pub provider_name: Option<String>,
}

/// Calculate usage for both default and LLM spans
pub fn get_llm_usage_for_span(
    attributes: &SpanAttributes,
    language_model_runner: Arc<LanguageModelRunner>,
) -> SpanUsage {
    let prompt_tokens = attributes.prompt_tokens();
    let completion_tokens = attributes.completion_tokens();
    let total_tokens = prompt_tokens + completion_tokens;

    let mut input_cost: f64 = 0.0;
    let mut output_cost: f64 = 0.0;
    let mut total_cost: f64 = 0.0;

    let response_model = attributes.response_model();
    let model_name = response_model.or(attributes.request_model());
    let provider_name = attributes.provider_name();
    let provider = provider_name
        .clone()
        .and_then(|v| LanguageModelProviderName::from_str(&v.to_lowercase()).ok())
        .and_then(|name| language_model_runner.models.get(&name).cloned());

    // TODO: Think about it. Maybe first see if prices are present in the attributes.
    if let Some(model) = model_name.as_deref() {
        if let Some(provider) = provider {
            input_cost = provider
                .estimate_input_cost(model, prompt_tokens as u32)
                .unwrap_or(0.0);
            output_cost = provider
                .estimate_output_cost(model, completion_tokens as u32)
                .unwrap_or(0.0);
            total_cost = input_cost + output_cost;
        }
    }

    SpanUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens,
        input_cost,
        output_cost,
        total_cost,
        model: model_name,
        provider_name,
    }
}
