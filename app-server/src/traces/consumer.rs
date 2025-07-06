//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse

use std::sync::Arc;

use super::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY, process_spans_and_events,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{DB, spans::Span},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
    storage::Storage,
    traces::IngestedBytes,
    utils::estimate_json_size,
};

pub async fn process_queue_spans(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    storage: Arc<Storage>,
) {
    loop {
        inner_process_queue_spans(
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
                    if limits_exceeded.bytes_ingested {
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
        let span_id = span.span_id;
        let events = rabbitmq_span_message.events;

        // Make sure we count the sizes before any processing, as soon as
        // we pick up the span from the queue.

        // TODO: do not convert to serde_json::Value, iterate over HashMap, and call
        // estimate_json_size on each value
        let span_bytes = estimate_json_size(
            &serde_json::to_value(&span.attributes.raw_attributes).unwrap_or_default(),
        );
        let events_bytes = estimate_json_size(&serde_json::to_value(&events).unwrap_or_default());

        // Parse and enrich span attributes for input/output extraction
        // This heavy processing is done on the consumer side
        span.parse_and_enrich_attributes();

        if is_feature_enabled(Feature::Storage) {
            if let Err(e) = span
                .store_payloads(&rabbitmq_span_message.project_id, storage.clone())
                .await
            {
                log::error!(
                    "Failed to store input images. span_id [{}], project_id [{}]: {:?}",
                    span_id,
                    rabbitmq_span_message.project_id,
                    e
                );
            }
        }

        process_spans_and_events(
            &mut span,
            events,
            &rabbitmq_span_message.project_id,
            &IngestedBytes {
                span_bytes,
                events_bytes,
            },
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            acker,
            queue.clone(),
        )
        .await;
    }

    log::warn!("Queue closed connection. Shutting down span listener");
}
