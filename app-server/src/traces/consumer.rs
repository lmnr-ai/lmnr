//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse
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
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    ch::{
        self,
        spans::CHSpan,
        traces::{CHTrace, TraceAggregation, upsert_traces_batch},
    },
    db::{DB, events::Event, spans::Span, trace::upsert_trace_statistics_batch},
    evaluators::{get_evaluators_by_path, push_to_evaluators_queue},
    features::{Feature, is_feature_enabled},
    mq::{
        MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
        MessageQueueTrait,
    },
    realtime::{SseConnectionMap, SseMessage, send_to_project_connections},
    storage::Storage,
    traces::{
        IngestedBytes,
        events::record_events,
        limits::update_workspace_limit_exceeded_by_project_id,
        provider::convert_span_to_provider_format,
        utils::{get_llm_usage_for_span, prepare_span_for_recording, record_tags_batch},
    },
};

pub async fn process_queue_spans(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    storage: Arc<Storage>,
    sse_connections: SseConnectionMap,
) {
    loop {
        inner_process_queue_spans(
            db.clone(),
            cache.clone(),
            queue.clone(),
            clickhouse.clone(),
            storage.clone(),
            sse_connections.clone(),
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
    sse_connections: SseConnectionMap,
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
            sse_connections.clone(),
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
    sse_connections
))]
async fn process_spans_and_events_batch(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    storage: Arc<Storage>,
    acker: MessageQueueAcker,
    queue: Arc<MessageQueue>,
    sse_connections: SseConnectionMap,
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
        sse_connections,
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
    sse_connections
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
    sse_connections: SseConnectionMap,
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
        return;
    }

    // Process trace aggregations and update trace statistics
    if is_feature_enabled(Feature::AggregateTraces) {
        let trace_aggregations = TraceAggregation::from_spans(&spans, &span_usage_vec);
        if !trace_aggregations.is_empty() {
            // Upsert trace statistics in PostgreSQL
            match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
                Ok(updated_traces) => {
                    // Convert to ClickHouse traces and upsert
                    let ch_traces: Vec<CHTrace> = updated_traces
                        .iter()
                        .map(|trace| CHTrace::from_db_trace(trace))
                        .collect();

                    if let Err(e) = upsert_traces_batch(clickhouse.clone(), &ch_traces).await {
                        log::error!(
                            "Failed to upsert {} traces to ClickHouse: {:?}",
                            ch_traces.len(),
                            e
                        );
                    }
                }
                Err(e) => {
                    log::error!("Failed to upsert trace statistics to PostgreSQL: {:?}", e);
                }
            }
        }
    }

    // Check for spans matching trigger conditions and push to trace summary queue
    check_and_push_trace_summaries(project_id, &spans, db.clone(), cache.clone(), queue.clone())
        .await;

    // Send realtime messages directly to SSE connections after successful ClickHouse writes
    send_realtime_messages_to_sse(&spans, &sse_connections).await;

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
    let tags_batch: Vec<(Uuid, String, Uuid)> = stripped_spans
        .iter()
        .flat_map(|span| {
            span.tags
                .iter()
                .map(move |tag| (span.project_id, tag.clone(), span.span_id))
        })
        .collect();

    // Record all tags in a single batch
    if !tags_batch.is_empty() {
        if let Err(e) = record_tags_batch(clickhouse.clone(), &tags_batch).await {
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

/// Send realtime span messages directly to SSE connections
async fn send_realtime_messages_to_sse(spans: &[Span], sse_connections: &SseConnectionMap) {
    // Group spans by project_id
    let mut projects_with_spans: std::collections::HashMap<Uuid, Vec<&Span>> =
        std::collections::HashMap::new();

    for span in spans {
        projects_with_spans
            .entry(span.project_id)
            .or_insert_with(Vec::new)
            .push(span);
    }

    // Only send messages for projects that have active SSE connections
    for (project_id, project_spans) in projects_with_spans {
        if !sse_connections.contains_key(&project_id) {
            continue; // Skip if no active connections for this project
        }

        // Send all spans for this project in a single message
        let spans_data: Vec<Value> = project_spans
            .iter()
            .map(|span| span_to_realtime_span(span))
            .collect();

        let spans_message = SseMessage {
            event_type: "new_spans".to_string(),
            data: serde_json::json!({
                "spans": spans_data
            }),
        };

        send_to_project_connections(sse_connections, &project_id, spans_message);
    }
}

/// Convert span to lightweight database row format for realtime updates
/// Includes all span data except heavy input/output fields
fn span_to_realtime_span(span: &Span) -> Value {
    serde_json::json!({
        "spanId": span.span_id,
        "parentSpanId": span.parent_span_id,
        "traceId": span.trace_id,
        "spanType": span.span_type,
        "name": span.name,
        "startTime": span.start_time,
        "endTime": span.end_time,
        "attributes": span.attributes.to_value(),
        "status": span.status,
        "projectId": span.project_id,
        "createdAt": span.start_time, // Use start_time as created_at for compatibility
        // Note: input and output fields are intentionally excluded for performance
    })
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
