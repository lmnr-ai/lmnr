//! This module reads spans from RabbitMQ and processes them: writes to DB
//! and clickhouse, and quickwit
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::future::join_all;
use itertools::Itertools;
use opentelemetry::trace::FutureExt;
use rayon::prelude::*;
use tracing::instrument;
use uuid::Uuid;

use super::trigger::get_signal_triggers_cached;
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    batch_worker::{
        config::BatchingConfig,
        message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery},
    },
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
        spans::Span,
        trace::{Trace, upsert_trace_statistics_batch},
    },
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    storage::Storage,
    traces::{
        limits::update_workspace_limit_exceeded_by_project_id,
        provider::convert_span_to_provider_format,
        realtime::{send_span_updates, send_trace_updates},
        utils::{get_llm_usage_for_span, group_traces_by_project, prepare_span_for_recording},
    },
    worker::HandlerError,
};

const SIGNAL_TRIGGER_LOCK_TTL_SECONDS: u64 = 3600; // 1 hour

/// Handler for span processing with batch accumulation.
///
/// Accumulates span messages from multiple queue deliveries and flushes them
/// together when the batch size threshold is reached or the flush interval fires.
/// This mirrors the batching pattern used by `BrowserEventHandler`.
pub struct SpanHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub storage: Arc<Storage>,
    pub pubsub: Arc<PubSub>,
    pub config: BatchingConfig,
}

#[async_trait]
impl BatchMessageHandler for SpanHandler {
    type Message = Vec<RabbitMqSpanMessage>;
    type State = Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>;

    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn initial_state(&self) -> Self::State {
        Vec::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Skip empty batches
        if delivery.message.is_empty() {
            return HandlerResult::ack(vec![delivery]);
        }

        // Add delivery to the batch
        state.push(delivery);

        // Check if we've reached the batch size threshold (count total spans across deliveries)
        let total_spans: usize = state.iter().map(|d| d.message.len()).sum();
        log::debug!(
            "Spans batch size: {}, total spans accumulated: {}",
            self.config.size,
            total_spans
        );

        if total_spans >= self.config.size {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        if !state.is_empty() {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }
}

impl SpanHandler {
    /// Flushes accumulated deliveries: processes all spans and inserts them into ClickHouse.
    /// Returns a HandlerResult with all deliveries to ack on success, or requeue/reject on failure.
    async fn flush_batch(
        &self,
        state: &mut Vec<MessageDelivery<Vec<RabbitMqSpanMessage>>>,
    ) -> HandlerResult<Vec<RabbitMqSpanMessage>> {
        log::debug!("Flushing spans batch");

        // Take ownership of deliveries and reset state
        let deliveries_to_flush = std::mem::take(state);

        match self.flush_batch_inner(&deliveries_to_flush).await {
            Ok(()) => HandlerResult::ack(deliveries_to_flush),
            Err(HandlerError::Transient(_)) => HandlerResult::requeue(deliveries_to_flush),
            Err(HandlerError::Permanent(_)) => HandlerResult::reject(deliveries_to_flush),
        }
    }

    async fn flush_batch_inner(
        &self,
        deliveries_to_flush: &[MessageDelivery<Vec<RabbitMqSpanMessage>>],
    ) -> Result<(), HandlerError> {
        // Flatten all deliveries into a single list of span messages
        let messages: Vec<RabbitMqSpanMessage> = deliveries_to_flush
            .iter()
            .flat_map(|delivery| delivery.message.iter().cloned())
            .collect();

        if messages.is_empty() {
            return Ok(());
        }

        process_span_messages(
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
async fn process_span_messages(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    storage: Arc<Storage>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
) -> Result<(), HandlerError> {
    // Parsing and enriching attributes for all spans in parallel (heavy CPU work)
    let mut spans: Vec<Span> = messages
        .into_par_iter()
        .map(|message| {
            let mut span = message.span;
            span.estimate_size_bytes();
            span.parse_and_enrich_attributes();
            span
        })
        .collect();

    // Store payloads in parallel if enabled
    if is_feature_enabled(Feature::Storage) {
        let storage_futures = spans
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

    // Enrich spans with usage info
    let mut span_usage_vec = Vec::with_capacity(spans.len());

    for span in &mut spans {
        let span_usage =
            get_llm_usage_for_span(&mut span.attributes, db.clone(), cache.clone(), &span.name)
                .await;

        prepare_span_for_recording(span, &span_usage);
        convert_span_to_provider_format(span);

        span_usage_vec.push(span_usage);
    }

    // Process trace aggregations and update trace statistics
    let trace_aggregations = TraceAggregation::from_spans(&spans, &span_usage_vec);

    // Upsert trace statistics in PostgreSQL
    match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
        Ok(updated_traces) => {
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

            send_trace_updates(&updated_traces, &pubsub).await;

            if is_feature_enabled(Feature::Signals) {
                let traces_by_project = group_traces_by_project(&updated_traces);
                for (project_id, project_traces) in &traces_by_project {
                    check_and_push_signals(
                        *project_id,
                        project_traces,
                        &spans,
                        db.clone(),
                        cache.clone(),
                        clickhouse.clone(),
                        queue.clone(),
                    )
                    .await;
                }
            }
        }
        Err(e) => {
            log::error!("Failed to upsert trace statistics to PostgreSQL: {:?}", e);
        }
    }

    // Build CHSpans with embedded events and insert to ClickHouse
    let ch_spans: Vec<CHSpan> = spans
        .iter()
        .zip(span_usage_vec.iter())
        .filter(|(span, _)| span.should_record_to_clickhouse())
        .map(|(span, usage)| CHSpan::from_db_span(span, usage, span.project_id))
        .collect();

    if let Err(e) = ch::spans::insert_spans_batch(clickhouse.clone(), &ch_spans).await {
        log::error!(
            "Failed to record {} spans to clickhouse: {:?}",
            ch_spans.len(),
            e
        );
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to insert spans to Clickhouse: {:?}",
            e
        )));
    }

    // Send realtime span updates
    let recordable: Vec<&Span> = spans
        .iter()
        .filter(|span| span.should_record_to_clickhouse())
        .collect();

    let spans_for_realtime: Vec<Span> = recordable.iter().map(|s| (*s).clone()).collect();
    send_span_updates(&spans_for_realtime, &pubsub).await;

    // Index spans and events in Quickwit
    let quickwit_spans: Vec<QuickwitIndexedSpan> = recordable.iter().map(|s| (*s).into()).collect();
    let quickwit_events: Vec<QuickwitIndexedEvent> = recordable
        .iter()
        .flat_map(|s| s.events.iter().map(|e| e.into()))
        .collect();

    if !quickwit_spans.is_empty() {
        if let Err(e) =
            publish_for_indexing(&IndexerQueuePayload::Spans(quickwit_spans), queue.clone()).await
        {
            log::error!("Failed to publish spans for Quickwit indexing: {:?}", e);
        }
    }
    if !quickwit_events.is_empty() {
        if let Err(e) =
            publish_for_indexing(&IndexerQueuePayload::Events(quickwit_events), queue.clone()).await
        {
            log::error!("Failed to publish events for Quickwit indexing: {:?}", e);
        }
    }

    // Populate autocomplete cache per project
    let project_ids: Vec<Uuid> = spans.iter().map(|s| s.project_id).unique().collect();
    for project_id in &project_ids {
        let project_spans: Vec<Span> = spans
            .iter()
            .filter(|s| s.project_id == *project_id)
            .cloned()
            .collect();
        populate_autocomplete_cache(
            *project_id,
            &project_spans,
            cache.clone(),
            clickhouse.clone(),
        )
        .await;
    }

    // Update usage limits per project
    if is_feature_enabled(Feature::UsageLimit) {
        let mut bytes_per_project: HashMap<Uuid, usize> = HashMap::new();
        for span in &spans {
            *bytes_per_project.entry(span.project_id).or_default() += span.size_bytes;
        }

        for (project_id, bytes) in bytes_per_project {
            if let Err(e) = update_workspace_limit_exceeded_by_project_id(
                db.clone(),
                clickhouse.clone(),
                cache.clone(),
                project_id,
                bytes,
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

    Ok(())
}

async fn check_and_push_signals(
    project_id: Uuid,
    traces: &[&Trace],
    spans: &[Span],
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
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

            // Lock acquired - enqueue signal trigger run
            if let Err(e) = crate::signals::enqueue::enqueue_signal_trigger_run(
                trace.id(),
                trace.project_id(),
                trigger.id,
                trigger.signal.clone(),
                clickhouse.clone(),
                queue.clone(),
            )
            .await
            {
                log::error!(
                    "Failed to enqueue signal trigger run: trace_id={}, project_id={}, trigger_id={}, signal={}, error={:?}",
                    trace.id(),
                    trace.project_id(),
                    trigger.id,
                    trigger.signal.name,
                    e
                );
            }
        }
    }
}
