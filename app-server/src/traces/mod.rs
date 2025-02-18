use std::sync::Arc;

use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{
        events::Event, labels::get_registered_label_classes_for_path, spans::Span,
        stats::add_spans_and_events_to_project_usage_stats, DB,
    },
    mq::MessageQueueDelivery,
    pipeline::runner::PipelineRunner,
    traces::{
        evaluators::run_evaluator,
        events::record_events,
        utils::{get_llm_usage_for_span, record_labels_to_db_and_ch, record_span_to_db},
    },
};

pub mod attributes;
pub mod consumer;
pub mod evaluators;
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

pub async fn process_spans_and_events<T>(
    span: &mut Span,
    events: Vec<Event>,
    project_id: &Uuid,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    delivery: Box<dyn MessageQueueDelivery<T>>,
) {
    let span_usage =
        get_llm_usage_for_span(&mut span.get_attributes(), db.clone(), cache.clone()).await;

    match record_span_to_db(db.clone(), &span_usage, &project_id, span).await {
        Ok(_) => {
            let _ = delivery.ack().await.map_err(|e| {
                log::error!("Failed to ack MQ delivery (span): {:?}", e);
            });
        }
        Err(e) => {
            log::error!(
                "Failed to record span. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                project_id,
                e
            );
            // TODO: Implement proper nacks and DLX
            let _ = delivery.reject(false).await.map_err(|e| {
                log::error!("Failed to reject MQ delivery (span): {:?}", e);
            });
        }
    }

    let events_count = events.len() as i64;

    if let Err(e) =
        add_spans_and_events_to_project_usage_stats(&db.pool, &project_id, 1, events_count).await
    {
        log::error!(
            "Failed to add spans and events to project usage stats: {:?}",
            e
        );
    }

    if let Err(e) = record_events(db.clone(), clickhouse.clone(), events).await {
        log::error!("Failed to record events: {:?}", e);
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

    let ch_span = CHSpan::from_db_span(span, span_usage, *project_id);

    if let Err(e) = ch::spans::insert_span(clickhouse.clone(), &ch_span).await {
        log::error!(
            "Failed to insert span into Clickhouse. span_id [{}], project_id [{}]: {:?}",
            span.span_id,
            project_id,
            e
        );
    }
}

pub async fn process_label_classes(
    span: &Span,
    project_id: &Uuid,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    pipeline_runner: Arc<PipelineRunner>,
) {
    let registered_label_classes = match get_registered_label_classes_for_path(
        &db.pool,
        *project_id,
        &span.get_attributes().flat_path().unwrap_or_default(),
    )
    .await
    {
        Ok(classes) => classes,
        Err(e) => {
            log::error!(
                "Failed to get registered label classes. project_id [{}]: {:?}",
                project_id,
                e
            );
            Vec::new() // Return an empty vector if there's an error
        }
    };

    for registered_label_class in registered_label_classes {
        match run_evaluator(
            pipeline_runner.clone(),
            *project_id,
            registered_label_class.label_class_id,
            &span,
            db.clone(),
            clickhouse.clone(),
        )
        .await
        {
            Ok(_) => (),
            Err(e) => log::error!("Failed to run evaluator: {:?}", e),
        }
    }
}
