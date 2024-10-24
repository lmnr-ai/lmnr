//! This module reads spans from RabbitMQ and processes them: writes to DB,
//! clickhouse, and semantic search.

use std::sync::Arc;

use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};

use super::{
    attributes::TraceAttributes, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE,
    OBSERVATIONS_ROUTING_KEY,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{self, spans::CHSpan},
    chunk,
    db::{
        self,
        labels::get_registered_label_classes_for_path,
        spans::{Span, SpanType},
        stats, trace, DB,
    },
    features::{is_feature_enabled, Feature},
    language_model::LanguageModelRunner,
    pipeline::runner::PipelineRunner,
    semantic_search::SemanticSearch,
    traces::evaluators::run_evaluator,
};

pub async fn process_queue_spans(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    _semantic_search: Arc<SemanticSearch>,
    language_model_runner: Arc<LanguageModelRunner>,
    rabbitmq_connection: Arc<Connection>,
    clickhouse: clickhouse::Client,
    _chunker_runner: Arc<chunk::runner::ChunkerRunner>,
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

        let mut span: Span = rabbitmq_span_message.span;
        let events_count = rabbitmq_span_message.events.len();

        if let Err(e) = stats::add_spans_and_events_to_project_usage_stats(
            &db.pool,
            &rabbitmq_span_message.project_id,
            1,
            events_count as i64,
        )
        .await
        {
            log::error!(
                "Failed to add spans and events to project usage stats: {:?}",
                e
            );
        }

        if is_feature_enabled(Feature::UsageLimit) {
            match super::limits::update_workspace_limit_exceeded_by_project_id(
                db.clone(),
                cache.clone(),
                rabbitmq_span_message.project_id,
            )
            .await
            {
                Err(e) => {
                    log::error!(
                        "Failed to update workspace limit exceeded by project id: {:?}",
                        e
                    );
                }
                // ignore the span if the limit is exceeded
                Ok(limits_exceeded) => {
                    // TODO: do the same for events
                    if limits_exceeded.spans {
                        let _ = delivery
                            .ack(BasicAckOptions::default())
                            .await
                            .map_err(|e| log::error!("Failed to ack RabbitMQ delivery: {:?}", e));
                        continue;
                    }
                }
            }
        }

        let mut trace_attributes = TraceAttributes::new(span.trace_id);
        let span_usage = super::utils::get_llm_usage_for_span(
            &mut span.get_attributes(),
            language_model_runner.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
        trace_attributes.update_start_time(span.start_time);
        trace_attributes.update_end_time(span.end_time);

        let mut span_attributes = span.get_attributes();

        trace_attributes.update_user_id(span_attributes.user_id());
        trace_attributes.update_session_id(span_attributes.session_id());
        trace_attributes.update_trace_type(span_attributes.trace_type());

        if span.span_type == SpanType::LLM {
            trace_attributes.add_input_cost(span_usage.input_cost);
            trace_attributes.add_output_cost(span_usage.output_cost);
            trace_attributes.add_total_cost(span_usage.total_cost);

            trace_attributes.add_input_tokens(span_usage.input_tokens);
            trace_attributes.add_output_tokens(span_usage.output_tokens);
            trace_attributes.add_total_tokens(span_usage.total_tokens);
            span_attributes.set_usage(&span_usage);
        }

        span_attributes.extend_span_path(&span.name);
        span.set_attributes(&span_attributes);

        let update_attrs_res = trace::update_trace_attributes(
            &db.pool,
            &rabbitmq_span_message.project_id,
            &trace_attributes,
        )
        .await;
        if let Err(e) = update_attrs_res {
            log::error!(
                "Failed to update trace attributes [{}]: {:?}",
                span.span_id,
                e
            );
        }

        if let Err(e) = db::spans::record_span(&db.pool, &span).await {
            log::error!("Failed to record span [{}]: {:?}", span.span_id, e);
        } else {
            // ack the message as soon as the span is recorded
            let _ = delivery
                .ack(BasicAckOptions::default())
                .await
                .map_err(|e| log::error!("Failed to ack RabbitMQ delivery: {:?}", e));
        }

        let ch_span = CHSpan::from_db_span(&span, span_usage, rabbitmq_span_message.project_id);
        // TODO: Queue batches and send them every 1-2 seconds
        let insert_span_res = ch::spans::insert_span(clickhouse.clone(), &ch_span).await;
        if let Err(e) = insert_span_res {
            log::error!("Failed to insert span into Clickhouse: {:?}", e);
        }

        let registered_label_classes = match get_registered_label_classes_for_path(
            &db.pool,
            rabbitmq_span_message.project_id,
            &span.get_attributes().path().unwrap_or_default(),
        )
        .await
        {
            Ok(classes) => classes,
            Err(e) => {
                log::error!("Failed to get registered label classes: {:?}", e);
                Vec::new() // Return an empty vector if there's an error
            }
        };

        for registered_label_class in registered_label_classes {
            match run_evaluator(
                pipeline_runner.clone(),
                rabbitmq_span_message.project_id,
                registered_label_class.label_class_id,
                &span,
                db.clone(),
            )
            .await
            {
                Ok(_) => (),
                Err(e) => log::error!("Failed to run evaluator: {:?}", e),
            }
        }
    }

    log::info!("Shutting down span listener");
}
