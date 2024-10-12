//! This module reads spans from RabbitMQ and processes them: writes to DB,
//! clickhouse, and semantic search.

use std::sync::Arc;

use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};

use super::{
    attributes::TraceAttributes, events::create_events, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE,
    OBSERVATIONS_ROUTING_KEY,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    ch::{self, spans::CHSpan},
    db::{
        self,
        events::EventSource,
        spans::{Span, SpanType},
        trace, DB,
    },
    language_model::LanguageModelRunner,
};

pub async fn process_queue_spans(
    db: Arc<DB>,
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

        let mut span: Span = rabbitmq_span_message.span;

        let mut trace_attributes = TraceAttributes::new(span.trace_id);
        let span_usage = super::utils::get_llm_usage_for_span(
            &mut span.get_attributes(),
            language_model_runner.clone(),
        );
        trace_attributes.update_start_time(span.start_time);
        trace_attributes.update_end_time(span.end_time);

        let mut span_attributes = span.get_attributes();

        trace_attributes.update_user_id(span_attributes.user_id());
        trace_attributes.update_session_id(span_attributes.session_id());
        trace_attributes.update_trace_type(span_attributes.trace_type());

        if span.span_type == SpanType::LLM {
            trace_attributes.add_cost(span_usage.total_cost);
            trace_attributes.add_tokens(span_usage.total_tokens);
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
            log::error!("Failed to update trace attributes: {:?}", e);
        }

        let record_span_res = db::spans::record_span(&db.pool, &span).await;
        if let Err(e) = record_span_res {
            log::error!("Failed to record span: {:?}", e);
        }

        let ch_span = CHSpan::from_db_span(&span, span_usage, rabbitmq_span_message.project_id);
        // TODO: Queue batches and send them every 1-2 seconds
        let insert_span_res = ch::spans::insert_span(clickhouse.clone(), &ch_span).await;
        if let Err(e) = insert_span_res {
            log::error!("Failed to insert span into Clickhouse: {:?}", e);
        }

        let add_instrumentation_events_res = create_events(
            db.clone(),
            clickhouse.clone(),
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
