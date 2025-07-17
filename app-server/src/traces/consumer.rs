//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse

use std::{collections::HashMap, sync::Arc};

use backoff::ExponentialBackoffBuilder;
use itertools::Itertools;
use serde_json::Value;
use uuid::Uuid;

use super::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{self, spans::CHSpan},
    db::{
        DB, evaluators::get_evaluators_by_path, events::Event, spans::Span,
        stats::increment_project_spans_bytes_ingested,
    },
    evaluators::push_to_evaluators_queue,
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
            get_llm_usage_for_span, prepare_span_for_recording, record_labels_to_db_and_ch,
            record_spans_batch,
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
    let mut ingested_bytes_by_project: HashMap<Uuid, IngestedBytes> = HashMap::new();
    let mut spans_ingested_bytes = Vec::new();

    // Process all spans first (heavy processing)
    for message in messages {
        let mut span = message.span;

        let span_id = span.span_id;
        let project_id = span.project_id;

        // Make sure we count the sizes before any processing
        let span_bytes = span.estimate_size_bytes();
        let events_bytes = message
            .events
            .iter()
            .map(|e| e.estimate_size_bytes())
            .sum::<usize>();

        spans_ingested_bytes.push(IngestedBytes {
            span_bytes,
            events_bytes,
        });

        // Parse and enrich span attributes for input/output extraction
        span.parse_and_enrich_attributes();

        // Store payloads if enabled
        if is_feature_enabled(Feature::Storage) {
            if let Err(e) = span.store_payloads(&project_id, storage.clone()).await {
                log::error!(
                    "Failed to store input images. span_id [{}], project_id [{}]: {:?}",
                    span_id,
                    span.project_id,
                    e
                );
            }
        }

        // Add to collections for batch processing
        ingested_bytes_by_project
            .entry(span.project_id)
            .and_modify(|ingested_bytes| {
                ingested_bytes.span_bytes += span_bytes;
                ingested_bytes.events_bytes += events_bytes;
            })
            .or_insert(IngestedBytes {
                span_bytes,
                events_bytes,
            });
        all_spans.push(span);
        all_events.extend(message.events.into_iter());
    }

    // Process spans and events in batches
    process_batch(
        all_spans,
        spans_ingested_bytes,
        all_events,
        ingested_bytes_by_project,
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
    labels: Vec<String>,
    path: Vec<String>,
    output: Option<Value>,
}

async fn process_batch(
    mut spans: Vec<Span>,
    spans_ingested_bytes: Vec<IngestedBytes>,
    events: Vec<Event>,
    mut ingested_bytes_by_project: HashMap<Uuid, IngestedBytes>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    acker: MessageQueueAcker,
    evaluators_queue: Arc<MessageQueue>,
) {
    // Process all spans and prepare for batch operations
    let mut span_usages = Vec::new();
    let mut trace_attributes = Vec::new();

    for span in &mut spans {
        let span_usage =
            get_llm_usage_for_span(&mut span.attributes, db.clone(), cache.clone()).await;

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

        span_usages.push(span_usage);
        trace_attributes.push(trace_attrs);
    }

    // Record spans and traces to database (batch write)
    if let Err(e) = record_spans_batch(db.clone(), &spans, trace_attributes).await {
        log::error!("Failed to record spans batch: {:?}", e);
        let _ = acker.reject(false).await.map_err(|e| {
            log::error!(
                "[Write to DB] Failed to reject MQ delivery (batch): {:?}",
                e
            );
        });
        ingested_bytes_by_project
            .iter_mut()
            .for_each(|(_, ingested_bytes)| ingested_bytes.span_bytes = 0);
    }

    // Record spans to clickhouse
    let ch_spans: Vec<CHSpan> = spans
        .iter()
        .zip(span_usages.iter())
        .zip(spans_ingested_bytes.iter())
        .map(|((span, span_usage), ingested_bytes)| {
            CHSpan::from_db_span(
                span,
                span_usage,
                span.project_id,
                ingested_bytes.span_bytes + ingested_bytes.events_bytes,
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

    let stripped_spans = spans
        .into_iter()
        .map(|span| StrippedSpan {
            span_id: span.span_id,
            project_id: span.project_id,
            labels: span.attributes.labels(),
            path: span.attributes.path().unwrap_or_default(),
            output: span.output,
        })
        .collect::<Vec<_>>();

    let _ = acker.ack().await.map_err(|e| {
        log::error!("Failed to ack MQ delivery (batch): {:?}", e);
    });

    match record_events(db.clone(), clickhouse.clone(), &events).await {
        Ok(_) => {}
        Err(e) => {
            log::error!("Failed to record events: {:?}", e);
            ingested_bytes_by_project
                .iter_mut()
                .for_each(|(_, ingested_bytes)| ingested_bytes.events_bytes = 0);
        }
    };

    for (project_id, bytes) in ingested_bytes_by_project {
        if let Err(e) = increment_project_spans_bytes_ingested(
            &db.pool,
            &project_id,
            bytes.span_bytes + bytes.events_bytes,
        )
        .await
        {
            log::error!(
                "Failed to increment project data ingested for project [{}]: {:?}",
                project_id,
                e
            );
        }

        if is_feature_enabled(Feature::UsageLimit) {
            if let Err(e) =
                update_workspace_limit_exceeded_by_project_id(db.clone(), cache.clone(), project_id)
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
        if let Err(e) = record_labels_to_db_and_ch(
            db.clone(),
            clickhouse.clone(),
            &span.labels,
            &span.span_id,
            &span.project_id,
        )
        .await
        {
            log::error!(
                "Failed to record labels to DB. span_id [{}], project_id [{}]: {:?}",
                span.span_id,
                span.project_id,
                e
            );
        }
    }

    for span in stripped_spans {
        // Push to evaluators queue - get evaluators for this span
        match get_evaluators_by_path(&db, span.project_id, span.path).await {
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
