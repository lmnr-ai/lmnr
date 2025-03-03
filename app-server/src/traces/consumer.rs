//! This module reads spans from RabbitMQ and processes them: writes to DB,
//! clickhouse, and semantic search.

use std::sync::Arc;

use super::{
    process_label_classes, process_spans_and_events, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE,
    OBSERVATIONS_ROUTING_KEY,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{spans::Span, DB},
    features::{is_feature_enabled, Feature},
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
    pipeline::runner::PipelineRunner,
    storage::Storage,
};

pub async fn process_queue_spans(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    storage: Arc<Storage>,
) {
    loop {
        inner_process_queue_spans(
            pipeline_runner.clone(),
            db.clone(),
            cache.clone(),
            queue.clone(),
            clickhouse.clone(),
            storage.clone(),
        )
        .await;
        log::warn!("Span listener exited. Rebinding queue conneciton...");
    }
}

async fn inner_process_queue_spans(
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    storage: Arc<Storage>,
) {
    // Safe to unwrap because we checked is_feature_enabled above
    let mut receiver = queue
        .get_receiver(
            OBSERVATIONS_QUEUE,
            OBSERVATIONS_EXCHANGE,
            OBSERVATIONS_ROUTING_KEY,
        )
        .await
        .unwrap();

    log::info!("Started processing spans from queue");

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let rabbitmq_span_message =
            match serde_json::from_slice::<RabbitMqSpanMessage>(&delivery.data()) {
                Ok(rabbitmq_span_message) => rabbitmq_span_message,
                Err(e) => {
                    log::error!("Failed to deserialize span message: {:?}", e);
                    let _ = acker.reject(false).await;
                    continue;
                }
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
                        let _ = acker
                            .ack()
                            .await
                            .map_err(|e| log::error!("Failed to ack MQ delivery: {:?}", e));
                        continue;
                    }
                }
            }
        }

        let mut span: Span = rabbitmq_span_message.span;

        if is_feature_enabled(Feature::Storage) {
            if let Err(e) = span
                .store_payloads(&rabbitmq_span_message.project_id, storage.clone())
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

        let events = rabbitmq_span_message.events;

        process_spans_and_events(
            &mut span,
            events,
            &rabbitmq_span_message.project_id,
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            acker,
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

    log::warn!("Queue closed connection. Shutting down span listener");
}
f