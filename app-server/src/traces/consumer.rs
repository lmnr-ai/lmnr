//! This module reads spans from RabbitMQ and processes them: writes to DB,
//! clickhouse, and semantic search.

use std::sync::Arc;

use futures::StreamExt;
use lapin::{options::BasicConsumeOptions, options::*, types::FieldTable, Connection};

use super::{
    process_label_classes, process_spans_and_events, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE,
    OBSERVATIONS_ROUTING_KEY,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{spans::Span, DB},
    features::{is_feature_enabled, Feature},
    pipeline::runner::PipelineRunner,
    semantic_search::SemanticSearch,
    storage::Storage,
    traces::index::index_span,
};

pub async fn process_queue_spans<T: Storage + ?Sized>(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    semantic_search: Arc<dyn SemanticSearch>,
    rabbitmq_connection: Option<Arc<Connection>>,
    clickhouse: clickhouse::Client,
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
    storage: Arc<T>,
) {
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

        let mut span: Span = rabbitmq_span_message.span;

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

        if let Err(e) = index_span(
            &span,
            semantic_search.clone(),
            &format!("spans-{}", rabbitmq_span_message.project_id),
        )
        .await
        {
            log::error!("Failed to index span: {:?}", e);
        }

        let events = rabbitmq_span_message.events;

        process_spans_and_events(
            &mut span,
            events,
            &rabbitmq_span_message.project_id,
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            Some(delivery),
        )
        .await;

        process_label_classes(
            &span,
            &rabbitmq_span_message.project_id,
            db.clone(),
            clickhouse.clone(),
            pipeline_runner.clone(),
        )
        .await;
    }

    log::warn!("RabbitMQ closed connection. Shutting down span listener");
}
