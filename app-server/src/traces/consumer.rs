//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use futures_util::future::join_all;
use itertools::Itertools;
use rayon::prelude::*;
use serde_json::Value;
use uuid::Uuid;

use super::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{DB, events::Event, spans::Span},
    evaluators::{get_evaluators_by_path, push_to_evaluators_queue},
    features::{Feature, is_feature_enabled},
    mq::{
        MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
        MessageQueueTrait,
    },
    storage::Storage,
    traces::{
        IngestedBytes,
        events::record_events,
        limits::update_workspace_limit_exceeded_by_project_id,
        provider::convert_span_to_provider_format,
        utils::{
            get_llm_usage_for_span, prepare_span_for_recording, record_spans,
            record_tags_to_db_and_ch,
        },
    },
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
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                OBSERVATIONS_QUEUE,
                OBSERVATIONS_EXCHANGE,
                OBSERVATIONS_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_interval(std::time::Duration::from_secs(60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(300))) // 5 minutes max
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to spans queue");
            receiver
        }
        Err(e) => {
            log::error!("Failed to connect to spans queue after retries: {:?}", e);
            return;
        }
    };

    log::info!("Started processing spans from queue");

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let rabbitmq_span_messages =
            match serde_json::from_slice::<Vec<RabbitMqSpanMessage>>(&delivery.data()) {
                Ok(messages) => messages,
                Err(e) => {
                    log::error!("Failed to deserialize span message: {:?}", e);
                    let _ = acker.reject(false).await;
                    continue;
                }
            };

        // Process all spans in the batch
        process_spans_and_events_batch(
            rabbitmq_span_messages,
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            storage.clone(),
            acker,
            queue.clone(),
        )
        .await;
    }

    log::warn!("Queue closed connection. Shutting down span listener");
}

async fn process_spans_and_events_batch(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    storage: Arc<Storage>,
    acker: MessageQueueAcker,
    queue: Arc<MessageQueue>,
) {
    let mut all_spans = Vec::new();
    let mut all_events = Vec::new();
    let mut project_ids = Vec::new();
    let mut spans_ingested_bytes = Vec::new();

    // Process all spans in parallel (heavy processing)
    let processing_results: Vec<_> = messages
        .into_par_iter()
        .map(|message| {
            let mut span = message.span;

            // Make sure we count the sizes before any processing
            let span_bytes = span.estimate_size_bytes();

            let ingested_bytes = IngestedBytes { span_bytes };

            // Parse and enrich span attributes for input/output extraction
            span.parse_and_enrich_attributes();

            (span, message.events, ingested_bytes)
        })
        .collect();

    // Collect results from parallel processing
    for (span, events, ingested_bytes) in processing_results {
        spans_ingested_bytes.push(ingested_bytes.clone());
        project_ids.push(span.project_id);
        all_spans.push(span);
        all_events.extend(events.into_iter());
    }

    // Store payloads in parallel if enabled
    if is_feature_enabled(Feature::Storage) {
        let storage_futures = all_spans
            .iter_mut()
            .map(|span| {
                let project_id = span.project_id;
                let storage_clone = storage.clone();
                async move {
                    if let Err(e) = span.store_payloads(&project_id, storage_clone).await {
                        log::error!(
                            "Failed to store input images. span_id [{}], project_id [{}]: {:?}",
                            span.span_id,
                            project_id,
                            e
                        );
                    }
                }
            })
            .collect::<Vec<_>>();

        join_all(storage_futures).await;
    }

    // Process spans and events in batches
    process_batch(
        all_spans,
        spans_ingested_bytes,
        all_events,
        project_ids,
        db,
        clickhouse,
        cache,
        acker,
        queue,
    )
    .await;
}

struct StrippedSpan {
    span_id: Uuid,
    project_id: Uuid,
    tags: Vec<String>,
    path: Vec<String>,
    output: Option<Value>,
}

async fn process_batch(
    mut spans: Vec<Span>,
    spans_ingested_bytes: Vec<IngestedBytes>,
    events: Vec<Event>,
    project_ids: Vec<Uuid>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    acker: MessageQueueAcker,
    evaluators_queue: Arc<MessageQueue>,
) {
    let mut trace_attributes_vec = Vec::new();
    let mut span_usage_vec = Vec::new();
    let mut all_events = Vec::new();

    for span in &mut spans {
        let span_usage =
            get_llm_usage_for_span(&mut span.attributes, db.clone(), cache.clone(), &span.name)
                .await;

        // Filter events for this span
        let span_events: Vec<Event> = events
            .iter()
            .filter(|e| e.span_id == span.span_id)
            .cloned()
            .collect();

        // Apply event filtering logic
        let mut has_seen_first_token = false;
        let filtered_events = span_events
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

        let trace_attrs = prepare_span_for_recording(span, &span_usage, &filtered_events);
        convert_span_to_provider_format(span);

        trace_attributes_vec.push(trace_attrs);
        span_usage_vec.push(span_usage);
        all_events.extend(filtered_events);
    }

    // Record spans and traces to database (batch write)
    if let Err(e) = record_spans(db.clone(), &spans, &trace_attributes_vec).await {
        log::error!("Failed to record spans batch: {:?}", e);
        let _ = acker.reject(false).await.map_err(|e| {
            log::error!(
                "[Write to DB] Failed to reject MQ delivery (batch): {:?}",
                e
            );
        });
    }

    // Record spans to clickhouse
    let ch_spans: Vec<CHSpan> = spans
        .iter()
        .zip(span_usage_vec.iter())
        .zip(spans_ingested_bytes.iter())
        .map(|((span, span_usage), ingested_bytes)| {
            CHSpan::from_db_span(
                &span,
                &span_usage,
                span.project_id,
                ingested_bytes.span_bytes,
            )
        })
        .collect();

    if let Err(e) = ch::spans::insert_spans_batch(clickhouse.clone(), &ch_spans).await {
        log::error!(
            "Failed to record {} spans to clickhouse: {:?}",
            ch_spans.len(),
            e
        );
        let _ = acker.reject(false).await.map_err(|e| {
            log::error!(
                "[Write to Clickhouse] Failed to reject MQ delivery (batch): {:?}",
                e
            );
        });
    }

    // Both `spans` and `span_and_metadata_vec` are consumed when building `stripped_spans`
    let stripped_spans = spans
        .into_iter()
        .map(|span| StrippedSpan {
            span_id: span.span_id,
            project_id: span.project_id,
            tags: span.attributes.tags(),
            path: span.attributes.path().unwrap_or_default(),
            output: span.output,
        })
        .collect::<Vec<_>>();

    let _ = acker.ack().await.map_err(|e| {
        log::error!("Failed to ack MQ delivery (batch): {:?}", e);
    });

    match record_events(clickhouse.clone(), &all_events).await {
        Ok(_) => {}
        Err(e) => {
            log::error!("Failed to record events: {:?}", e);
        }
    };

    for project_id in project_ids {
        if is_feature_enabled(Feature::UsageLimit) {
            if let Err(e) = update_workspace_limit_exceeded_by_project_id(
                db.clone(),
                clickhouse.clone(),
                cache.clone(),
                project_id,
            )
            .await
            {
                log::error!(
                    "Failed to update workspace limit exceeded for project [{}]: {:?}",
                    project_id,
                    e
                );
            }
        }
    }

    for span in &stripped_spans {
        if let Err(e) = record_tags_to_db_and_ch(
            db.clone(),
            clickhouse.clone(),
            &span.tags,
            &span.span_id,
            &span.project_id,
        )
        .await
        {
            log::error!(
                "Failed to record tags to DB. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                span.project_id,
                e
            );
        }
    }

    for span in stripped_spans {
        // Push to evaluators queue - get evaluators for this span
        match get_evaluators_by_path(&db, cache.clone(), span.project_id, span.path).await {
            Ok(evaluators) => {
                if !evaluators.is_empty() {
                    let span_output = span.output.clone().unwrap_or(Value::Null);

                    for evaluator in evaluators {
                        if let Err(e) = push_to_evaluators_queue(
                            span.span_id,
                            span.project_id,
                            evaluator.id,
                            span_output.clone(),
                            evaluators_queue.clone(),
                        )
                        .await
                        {
                            log::error!(
                                "Failed to push to evaluators queue. span_id [{}], project_id [{}]: {:?}",
                                span.span_id,
                                span.project_id,
                                e
                            );
                        }
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to get evaluators by path. span_id [{}], project_id [{}]: {:?}",
                    span.span_id,
                    span.project_id,
                    e
                );
            }
        }
    }
}
