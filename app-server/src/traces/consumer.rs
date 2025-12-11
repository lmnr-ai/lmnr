//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse, and quickwit
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use futures_util::future::join_all;
use itertools::Itertools;
use opentelemetry::trace::FutureExt;
use rayon::prelude::*;
use serde_json::Value;
use tracing::instrument;
use uuid::Uuid;

use super::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY,
    summary::push_to_trace_summary_queue,
    trigger::{check_span_trigger, get_summary_trigger_spans_cached},
};
use crate::cache::autocomplete::populate_autocomplete_cache;
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{
        spans::CHSpan,
        traces::{CHTrace, TraceAggregation},
    },
    data_processor::write::{write_spans, write_tags, write_traces},
    db::{
        DB,
        events::Event,
        spans::Span,
        tags::{SpanTag, TagSource},
        trace::upsert_trace_statistics_batch,
    },
    evaluators::{get_evaluators_by_path, push_to_evaluators_queue},
    features::{Feature, is_feature_enabled},
    mq::{
        MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
        MessageQueueTrait,
    },
    pubsub::PubSub,
    quickwit::{QuickwitIndexedSpan, producer::publish_spans_for_indexing},
    storage::Storage,
    traces::{
        IngestedBytes,
        events::record_events,
        limits::update_workspace_limit_exceeded_by_project_id,
        provider::convert_span_to_provider_format,
        realtime::{send_span_updates, send_trace_updates},
        utils::{get_llm_usage_for_span, prepare_span_for_recording},
    },
};

pub async fn process_queue_spans(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    storage: Arc<Storage>,
    pubsub: Arc<PubSub>,
    http_client: Arc<reqwest::Client>,
) {
    loop {
        inner_process_queue_spans(
            db.clone(),
            cache.clone(),
            queue.clone(),
            clickhouse.clone(),
            storage.clone(),
            pubsub.clone(),
            http_client.clone(),
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
    pubsub: Arc<PubSub>,
    http_client: Arc<reqwest::Client>,
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
            pubsub.clone(),
            http_client.clone(),
        )
        .await;
    }

    log::warn!("Queue closed connection. Shutting down span listener");
}

#[instrument(skip(
    messages,
    db,
    clickhouse,
    cache,
    storage,
    acker,
    queue,
    pubsub,
    http_client
))]
async fn process_spans_and_events_batch(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    storage: Arc<Storage>,
    acker: MessageQueueAcker,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
    http_client: Arc<reqwest::Client>,
) {
    let mut all_spans = Vec::new();
    let mut all_events = Vec::new();
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

        join_all(storage_futures).with_current_context().await;
    }

    // Process spans and events in batches
    process_batch(
        all_spans,
        spans_ingested_bytes,
        all_events,
        db,
        clickhouse,
        cache,
        acker,
        queue,
        pubsub,
        http_client,
    )
    .with_current_context()
    .await;
}

struct StrippedSpan {
    span_id: Uuid,
    project_id: Uuid,
    tags: Vec<String>,
    path: Vec<String>,
    output: Option<Value>,
}

#[instrument(skip(
    spans,
    spans_ingested_bytes,
    events,
    db,
    clickhouse,
    cache,
    acker,
    queue,
    pubsub,
    http_client,
))]
async fn process_batch(
    mut spans: Vec<Span>,
    spans_ingested_bytes: Vec<IngestedBytes>,
    events: Vec<Event>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    acker: MessageQueueAcker,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
    http_client: Arc<reqwest::Client>,
) {
    let mut span_usage_vec = Vec::new();
    let mut all_events = Vec::new();

    // we get project id from the first span in the batch
    // because all spans in the batch have the same project id
    // batching is happening on the Otel SpanProcessor level
    // project_id can never be None, because batch is never empty
    // but we do unwrap_or_default to avoid Option<Uuid> in the rest of the code
    let project_id = spans.first().map(|s| s.project_id).unwrap_or_default();

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
        let filtered_events: Vec<Event> = span_events
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

        prepare_span_for_recording(span, &span_usage, &filtered_events);
        convert_span_to_provider_format(span);

        span_usage_vec.push(span_usage);
        all_events.extend(filtered_events);
    }

    // Process trace aggregations and update trace statistics
    let trace_aggregations = TraceAggregation::from_spans(&spans, &span_usage_vec);
    // Upsert trace statistics in PostgreSQL
    match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
        Ok(updated_traces) => {
            // Convert to ClickHouse traces and upsert
            let ch_traces: Vec<CHTrace> = updated_traces
                .iter()
                .map(|trace| CHTrace::from_db_trace(trace))
                .collect();

            if let Err(e) =
                write_traces(&db.pool, &clickhouse, &http_client, project_id, &ch_traces).await
            {
                log::error!(
                    "Failed to upsert {} traces to ClickHouse: {:?}",
                    ch_traces.len(),
                    e
                );
            }

            // Send trace_update events for realtime updates
            send_trace_updates(&updated_traces, &pubsub).await;
        }
        Err(e) => {
            log::error!(
                "Failed to upsert trace statistics to PostgreSQL. project_id: [{}], error: [{:?}]",
                project_id,
                e
            );
        }
    }

    // Record spans to clickhouse
    let ch_spans: Vec<CHSpan> = spans
        .iter()
        .zip(span_usage_vec.iter())
        .zip(spans_ingested_bytes.iter())
        .filter(|((span, _), _)| span.should_record_to_clickhouse())
        .map(|((span, span_usage), ingested_bytes)| {
            CHSpan::from_db_span(
                &span,
                &span_usage,
                span.project_id,
                ingested_bytes.span_bytes,
            )
        })
        .collect();

    if let Err(e) = write_spans(&db.pool, &clickhouse, &http_client, project_id, &ch_spans).await {
        log::error!("Failed to write spans: {:?}", e);
        let _ = acker.reject(false).await.map_err(|e| {
            log::error!(
                "[Write to Clickhouse] Failed to reject MQ delivery (batch): {:?}",
                e
            );
        });
        return;
    }

    // Send realtime span updates directly to SSE connections after successful ClickHouse writes
    send_span_updates(&spans, &pubsub).await;

    // Check for spans matching trigger conditions and push to trace summary queue
    check_and_push_trace_summaries(project_id, &spans, db.clone(), cache.clone(), queue.clone())
        .await;

    // Index spans in Quickwit
    let quickwit_spans: Vec<QuickwitIndexedSpan> = spans.iter().map(|span| span.into()).collect();
    if let Err(e) = publish_spans_for_indexing(&quickwit_spans, queue.clone()).await {
        log::error!(
            "Failed to publish {} spans for Quickwit indexing: {:?}",
            quickwit_spans.len(),
            e
        );
    }

    let _ = acker.ack().await.map_err(|e| {
        log::error!("Failed to ack MQ delivery (batch): {:?}", e);
    });

    // Populate autocomplete cache
    populate_autocomplete_cache(project_id, &spans, cache.clone(), clickhouse.clone()).await;

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

    let total_events_ingested_bytes = match record_events(
        cache.clone(),
        db.clone(),
        project_id,
        clickhouse.clone(),
        &all_events,
    )
    .await
    {
        Ok(bytes) => bytes,
        Err(e) => {
            log::error!("Failed to record events: {:?}", e);
            0
        }
    };

    let total_ingested_bytes = spans_ingested_bytes
        .iter()
        .map(|b| b.span_bytes)
        .sum::<usize>()
        + total_events_ingested_bytes;

    if is_feature_enabled(Feature::UsageLimit) {
        if let Err(e) = update_workspace_limit_exceeded_by_project_id(
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            project_id,
            total_ingested_bytes,
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

    // Collect all tags from all spans for batch insertion
    let tags_batch: Vec<SpanTag> = stripped_spans
        .iter()
        .flat_map(|span| {
            span.tags.iter().map(move |tag| {
                SpanTag::new(span.project_id, tag.clone(), TagSource::CODE, span.span_id)
            })
        })
        .collect();

    // Record all tags in a single batch
    if !tags_batch.is_empty() {
        if let Err(e) =
            write_tags(&db.pool, &clickhouse, &http_client, project_id, &tags_batch).await
        {
            log::error!(
                "Failed to record tags to DB for batch of {} tags: {:?}",
                tags_batch.len(),
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
                            queue.clone(),
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

/// Check spans against trigger conditions and push matching traces to summary queue
/// This function groups spans by project to minimize database/cache queries
async fn check_and_push_trace_summaries(
    project_id: Uuid,
    spans: &[Span],
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    match get_summary_trigger_spans_cached(db.clone(), cache.clone(), project_id).await {
        Ok(trigger_spans) => {
            // Check each span against its project's trigger spans
            for span in spans {
                // Check if this span name matches any trigger
                let matching_triggers = check_span_trigger(&span.name, &trigger_spans);

                // Send one message per matching trigger
                for trigger in matching_triggers {
                    if let Err(e) = push_to_trace_summary_queue(
                        span.trace_id,
                        span.project_id,
                        span.span_id,
                        trigger.event_definition,
                        queue.clone(),
                    )
                    .await
                    {
                        log::error!(
                            "Failed to push trace completion to summary queue: trace_id={}, project_id={}, span_name={}, error={:?}",
                            span.trace_id,
                            span.project_id,
                            span.name,
                            e
                        );
                    }
                }
            }
        }
        Err(e) => {
            log::error!(
                "Failed to get summary trigger spans for project {}: {:?}",
                project_id,
                e
            );
        }
    }
}
