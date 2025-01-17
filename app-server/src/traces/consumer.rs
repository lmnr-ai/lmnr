//! This module reads spans from RabbitMQ and processes them: writes to DB,
//! clickhouse, and semantic search.

use std::sync::Arc;

use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};

use super::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{self, spans::CHSpan},
    chunk,
    db::{labels::get_registered_label_classes_for_path, spans::Span, stats, DB},
    features::{is_feature_enabled, Feature},
    pipeline::runner::PipelineRunner,
    semantic_search::SemanticSearch,
    storage::Storage,
    traces::{
        evaluators::run_evaluator,
        events::record_events,
        index::index_span,
        utils::{record_labels_to_db_and_ch, record_span_to_db},
    },
};

pub async fn process_queue_spans<T: Storage + ?Sized>(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    semantic_search: Arc<dyn SemanticSearch>,
    rabbitmq_connection: Option<Arc<Connection>>,
    clickhouse: clickhouse::Client,
    chunker_runner: Arc<chunk::runner::ChunkerRunner>,
    storage: Arc<T>,
) {
    loop {
        inner_process_queue_spans(
            pipeline_runner.clone(),
            db.clone(),
            cache.clone(),
            semantic_search.clone(),
            rabbitmq_connection.clone(),
            clickhouse.clone(),
            chunker_runner.clone(),
            storage.clone(),
        )
        .await;
        log::warn!("Span listener exited. Creating a new RabbitMQ channel...");
    }
}

async fn inner_process_queue_spans<T: Storage + ?Sized>(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    semantic_search: Arc<dyn SemanticSearch>,
    rabbitmq_connection: Option<Arc<Connection>>,
    clickhouse: clickhouse::Client,
    chunker_runner: Arc<chunk::runner::ChunkerRunner>,
    storage: Arc<T>,
) {
    if !is_feature_enabled(Feature::FullBuild) {
        return;
    }
    // Safe to unwrap because we checked is_feature_enabled above
    let channel = rabbitmq_connection.unwrap().create_channel().await.unwrap();

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

    log::info!("Started processing spans from RabbitMQ");

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

        let span_usage = super::utils::get_llm_usage_for_span(
            &mut span.get_attributes(),
            db.clone(),
            cache.clone(),
        )
        .await;

        if is_feature_enabled(Feature::Storage) {
            if let Err(e) = span
                .store_input_media(&rabbitmq_span_message.project_id, storage.clone())
                .await
            {
                log::error!(
                    "Failed to store input images. span_id [{}], project_id [{}]: {:?}",
                    span.span_id,
                    rabbitmq_span_message.project_id,
                    e
                );
            }
        }

        if let Err(e) = record_span_to_db(
            db.clone(),
            &span_usage,
            &rabbitmq_span_message.project_id,
            &mut span,
        )
        .await
        {
            log::error!(
                "Failed to record span. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                rabbitmq_span_message.project_id,
                e
            );
        } else {
            // ack the message as soon as the span is recorded
            let _ = delivery
                .ack(BasicAckOptions::default())
                .await
                .map_err(|e| log::error!("Failed to ack RabbitMQ delivery: {:?}", e));
        }

        if let Err(e) = index_span(
            &span,
            semantic_search.clone(),
            &format!("spans-{}", rabbitmq_span_message.project_id),
            chunker_runner.clone(),
        )
        .await
        {
            log::error!("Failed to index span: {:?}", e);
        }

        if let Err(e) =
            record_events(db.clone(), clickhouse.clone(), rabbitmq_span_message.events).await
        {
            log::error!("Failed to record events: {:?}", e);
        }

        if let Err(e) = record_labels_to_db_and_ch(
            db.clone(),
            clickhouse.clone(),
            &span,
            &rabbitmq_span_message.project_id,
        )
        .await
        {
            log::error!(
                "Failed to record labels to DB. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                rabbitmq_span_message.project_id,
                e
            );
        }

        let ch_span = CHSpan::from_db_span(&span, span_usage, rabbitmq_span_message.project_id);
        // TODO: Queue batches and send them every 1-2 seconds
        let insert_span_res = ch::spans::insert_span(clickhouse.clone(), &ch_span).await;
        if let Err(e) = insert_span_res {
            log::error!(
                "Failed to insert span into Clickhouse. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                rabbitmq_span_message.project_id,
                e
            );
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
                log::error!(
                    "Failed to get registered label classes. project_id [{}]: {:?}",
                    rabbitmq_span_message.project_id,
                    e
                );
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
                clickhouse.clone(),
            )
            .await
            {
                Ok(_) => (),
                Err(e) => log::error!("Failed to run evaluator: {:?}", e),
            }
        }
    }

    log::warn!("RabbitMQ closed connection. Shutting down span listener");
}
