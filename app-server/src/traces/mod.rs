use std::sync::Arc;

use itertools::Itertools;
use utils::prepare_span_for_recording;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{
        DB,
        evaluators::get_evaluators_by_path,
        events::Event,
        spans::Span,
        stats::{add_spans_to_project_usage_stats, increment_project_spans_bytes_ingested},
    },
    evaluators::push_to_evaluators_queue,
    mq::{MessageQueue, MessageQueueAcker},
    traces::{
        events::record_events,
        utils::{get_llm_usage_for_span, record_labels_to_db_and_ch, record_span_to_db},
    },
    utils::estimate_json_size,
};

pub mod attributes;
pub mod consumer;
pub mod events;
pub mod grpc_service;
pub mod limits;

pub mod producer;
pub mod span_attributes;
pub mod spans;
pub mod utils;

pub const OBSERVATIONS_QUEUE: &str = "observations_queue";
pub const OBSERVATIONS_EXCHANGE: &str = "observations_exchange";
pub const OBSERVATIONS_ROUTING_KEY: &str = "observations_routing_key";

pub async fn process_spans_and_events(
    span: &mut Span,
    events: Vec<Event>,
    project_id: &Uuid,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    acker: MessageQueueAcker,
    evaluators_queue: Arc<MessageQueue>,
) {
    let span_usage =
        get_llm_usage_for_span(&mut span.get_attributes(), db.clone(), cache.clone()).await;

    let mut has_seen_first_token = false;

    // OpenLLMetry auto-instrumentation sends this event for every chunk
    // While this is helpful to get TTFT, we don't want to store excessive,
    // so we only keep the first one.
    let events = events
        .into_iter()
        .sorted_by(|a, b| a.timestamp.cmp(&b.timestamp))
        .filter(|event| {
            if event.name == "llm.content.completion.chunk" {
                if !has_seen_first_token {
                    has_seen_first_token = true;
                    true
                } else {
                    false
                }
            } else {
                true
            }
        })
        .collect();

    let trace_attributes = prepare_span_for_recording(span, &span_usage, &events);

    if let Some(span_path) = span.get_attributes().path() {
        match get_evaluators_by_path(&db, *project_id, span_path.clone()).await {
            Ok(evaluators) => {
                if !evaluators.is_empty() {
                    let span_output = span.output.clone().unwrap_or(serde_json::Value::Null);

                    for evaluator in evaluators {
                        if let Err(e) = push_to_evaluators_queue(
                            span.span_id,
                            *project_id,
                            evaluator.id,
                            span_output.clone(),
                            evaluators_queue.clone(),
                        )
                        .await
                        {
                            log::error!(
                                "Failed to push evaluator {} to queue for span {}: {:?}",
                                evaluator.id,
                                span.span_id,
                                e
                            );
                        }
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to get evaluators by path for span {}: {:?}",
                    span.span_id,
                    e
                );
            }
        }
    }

    let recorded_span_bytes =
        match record_span_to_db(db.clone(), &project_id, span, &trace_attributes).await {
            Ok(_) => {
                let _ = acker.ack().await.map_err(|e| {
                    log::error!("Failed to ack MQ delivery (span): {:?}", e);
                });
                estimate_json_size(
                    &serde_json::to_value(&span.get_attributes().attributes).unwrap_or_default(),
                )
            }
            Err(e) => {
                log::error!(
                    "Failed to record span. span_id [{}], project_id [{}]: {:?}",
                    span.span_id,
                    project_id,
                    e
                );
                // TODO: Implement proper nacks and DLX
                let _ = acker.reject(false).await.map_err(|e| {
                    log::error!("Failed to reject MQ delivery (span): {:?}", e);
                });
                0
            }
        };

    if let Err(e) = add_spans_to_project_usage_stats(&db.pool, &project_id, 1).await {
        log::error!(
            "Failed to add spans and events to project usage stats: {:?}",
            e
        );
    }

    let recorded_events_bytes = match record_events(db.clone(), clickhouse.clone(), &events).await {
        Ok(_) => estimate_json_size(&serde_json::to_value(&events).unwrap_or_default()),
        Err(e) => {
            log::error!("Failed to record events: {:?}", e);
            0
        }
    };

    if let Err(e) = increment_project_spans_bytes_ingested(
        &db.pool,
        &project_id,
        recorded_span_bytes + recorded_events_bytes,
    )
    .await
    {
        log::error!("Failed to increment project data ingested: {:?}", e);
    }

    if let Err(e) =
        record_labels_to_db_and_ch(db.clone(), clickhouse.clone(), &span, &project_id).await
    {
        log::error!(
            "Failed to record labels to DB. span_id [{}], project_id [{}]: {:?}",
            span.span_id,
            project_id,
            e
        );
    }

    let ch_span = CHSpan::from_db_span(span, span_usage, *project_id, recorded_span_bytes);

    if let Err(e) = ch::spans::insert_span(clickhouse.clone(), &ch_span).await {
        log::error!(
            "Failed to insert span into Clickhouse. span_id [{}], project_id [{}]: {:?}",
            span.span_id,
            project_id,
            e
        );
    }
}
