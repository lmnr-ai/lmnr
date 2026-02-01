//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse, and quickwit
use std::sync::Arc;

use async_trait::async_trait;
use futures_util::future::join_all;
use itertools::Itertools;
use opentelemetry::trace::FutureExt;
use rayon::prelude::*;
use serde_json::Value;
use tracing::instrument;
use uuid::Uuid;

use super::trigger::get_signal_triggers_cached;
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::{
        Cache, CacheTrait, autocomplete::populate_autocomplete_cache,
        keys::SIGNAL_TRIGGER_LOCK_CACHE_KEY,
    },
    ch::{
        self,
        spans::CHSpan,
        traces::{CHTrace, TraceAggregation, upsert_traces_batch},
    },
    db::{
        DB,
        events::Event,
        spans::Span,
        tags::{SpanTag, TagSource},
        trace::{Trace, upsert_trace_statistics_batch},
    },
    evaluators::{get_evaluators_by_path, push_to_evaluators_queue},
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    signals::queue::push_to_signals_queue,
    storage::Storage,
    traces::{
        IngestedBytes,
        events::record_span_events,
        limits::update_workspace_limit_exceeded_by_project_id,
        provider::convert_span_to_provider_format,
        realtime::{send_span_updates, send_trace_updates},
        utils::{get_llm_usage_for_span, prepare_span_for_recording},
    },
    worker::{HandlerError, MessageHandler},
};

const SIGNAL_TRIGGER_LOCK_TTL_SECONDS: u64 = 3600; // 1 hour

/// Handler for span processing
pub struct SpanHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub storage: Arc<Storage>,
    pub pubsub: Arc<PubSub>,
}

#[async_trait]
impl MessageHandler for SpanHandler {
    type Message = Vec<RabbitMqSpanMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        process_spans_and_events_batch(
            messages,
            self.db.clone(),
            self.clickhouse.clone(),
            self.cache.clone(),
            self.storage.clone(),
            self.queue.clone(),
            self.pubsub.clone(),
        )
        .await
    }
}

#[instrument(skip(messages, db, clickhouse, cache, storage, queue, pubsub))]
async fn process_spans_and_events_batch(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    storage: Arc<Storage>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
) -> Result<(), HandlerError> {
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
        queue,
        pubsub,
    )
    .with_current_context()
    .await
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
    queue,
    pubsub
))]
async fn process_batch(
    mut spans: Vec<Span>,
    spans_ingested_bytes: Vec<IngestedBytes>,
    events: Vec<Event>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
) -> Result<(), HandlerError> {
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

            if let Err(e) = upsert_traces_batch(clickhouse.clone(), &ch_traces).await {
                log::error!(
                    "Failed to upsert {} traces to ClickHouse: {:?}",
                    ch_traces.len(),
                    e
                );
            }

            // Send trace_update events for realtime updates
            send_trace_updates(&updated_traces, &pubsub).await;

            // Check for trace filter conditions and push matching traces to signals queue
            if is_feature_enabled(Feature::Signals) {
                check_and_push_signals(
                    project_id,
                    &updated_traces,
                    &spans,
                    db.clone(),
                    cache.clone(),
                    queue.clone(),
                )
                .await;
            }
        }
        Err(e) => {
            log::error!(
                "Failed to upsert trace statistics to PostgreSQL. project_id: [{}], error: [{:?}]",
                project_id,
                e
            );
        }
    }

    // Filter out spans that should not be recorded to clickhouse
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

    // Record spans to clickhouse
    if let Err(e) = ch::spans::insert_spans_batch(clickhouse.clone(), &ch_spans).await {
        log::error!(
            "Failed to record {} spans to clickhouse: {:?}",
            ch_spans.len(),
            e
        );
        // We don't want to drop spans if we can't insert them to Clickhouse
        // most likely it's a transient Clickhouse issue, so we want to requeue the message
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to insert spans to Clickhouse: {:?}",
            e
        )));
    }

    // Temporary solution to filter out spans before sending realtime span updates
    let spans: Vec<Span> = spans
        .into_iter()
        .filter(|span| span.should_record_to_clickhouse())
        .collect();

    // Send realtime span updates directly to SSE connections after successful ClickHouse writes
    send_span_updates(&spans, &pubsub).await;

    // Index spans and events in Quickwit
    let quickwit_spans: Vec<QuickwitIndexedSpan> = spans.iter().map(|span| span.into()).collect();
    let quickwit_events: Vec<QuickwitIndexedEvent> =
        all_events.iter().map(|event| event.into()).collect();

    let spans_count = quickwit_spans.len();
    let events_count = quickwit_events.len();
    if spans_count > 0 {
        if let Err(e) =
            publish_for_indexing(&IndexerQueuePayload::Spans(quickwit_spans), queue.clone()).await
        {
            log::error!(
                "Failed to publish {} spans for Quickwit indexing: {:?}",
                spans_count,
                e
            );
        }
    }
    if events_count > 0 {
        if let Err(e) =
            publish_for_indexing(&IndexerQueuePayload::Events(quickwit_events), queue.clone()).await
        {
            log::error!(
                "Failed to publish {} events for Quickwit indexing: {:?}",
                events_count,
                e
            );
        }
    }

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

    let total_events_ingested_bytes =
        match record_span_events(clickhouse.clone(), &all_events).await {
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
        if let Err(e) = crate::ch::tags::insert_tags_batch(clickhouse.clone(), &tags_batch).await {
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

    Ok(())
}

async fn check_and_push_signals(
    project_id: Uuid,
    traces: &[Trace],
    spans: &[Span],
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    let triggers = match get_signal_triggers_cached(db.clone(), cache.clone(), project_id).await {
        Ok(triggers) => triggers,
        Err(e) => {
            log::error!(
                "Failed to get signals triggers for project {}: {:?}",
                project_id,
                e
            );
            return;
        }
    };

    if triggers.is_empty() {
        return;
    }

    for trigger in &triggers {
        let matching_traces = traces
            .iter()
            .filter(|trace| trace.matches_filters(spans, &trigger.filters));

        for trace in matching_traces {
            // Filters matched - try to acquire lock to prevent duplicate triggers
            let lock_key = format!(
                "{}:{}:{}:{}",
                SIGNAL_TRIGGER_LOCK_CACHE_KEY,
                project_id,
                trigger.signal.id,
                trace.id(),
            );

            match cache.exists(&lock_key).await {
                Ok(true) => {
                    continue;
                }
                Ok(false) => {
                    // Lock doesn't exist, try to acquire it
                }
                Err(e) => {
                    log::warn!(
                        "[Signal trigger] Failed to check lock existence (key {}): {:?}",
                        lock_key,
                        e
                    );
                    // Continue to try acquiring lock
                }
            }

            // Try to acquire the lock
            let lock_acquired = match cache
                .try_acquire_lock(&lock_key, SIGNAL_TRIGGER_LOCK_TTL_SECONDS)
                .await
            {
                Ok(acquired) => acquired,
                Err(e) => {
                    // On lock error, still try to push (fail-open behavior)
                    log::error!(
                        "Failed to acquire lock for signal '{}' on trace {}: {:?}",
                        trigger.signal.name,
                        trace.id(),
                        e
                    );
                    true // Proceed anyway
                }
            };

            if !lock_acquired {
                // Lock was already held by another processor
                continue;
            }

            // Lock acquired - push to signals queue
            if let Err(e) = push_to_signals_queue(
                trace.id(),
                trace.project_id(),
                Some(trigger.id),
                trigger.signal.clone(),
                queue.clone(),
            )
            .await
            {
                log::error!(
                    "Failed to push trace to signals queue: trace_id={}, project_id={}, signal={}, error={:?}",
                    trace.id(),
                    trace.project_id(),
                    trigger.signal.name,
                    e
                );
            }
        }
    }
}
