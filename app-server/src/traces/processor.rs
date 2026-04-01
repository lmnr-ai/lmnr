use std::collections::HashMap;
use std::sync::Arc;

use itertools::Itertools;
use rayon::prelude::*;
use tracing::instrument;
use uuid::Uuid;

use super::sampling::{get_sampling_factors_cached, should_sample_trace};
use super::trigger::get_signal_triggers_cached;
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::{
        Cache, CacheTrait, autocomplete::populate_autocomplete_cache,
        keys::SIGNAL_TRIGGER_LOCK_CACHE_KEY,
    },
    ch::{
        ClickhouseTrait,
        spans::CHSpan,
        traces::{CHTrace, TraceAggregation, get_existing_trace_tags},
    },
    db::{
        DB,
        spans::{Span, SpanType},
        trace::{Trace, upsert_trace_statistics_batch},
        workspaces::WorkspaceDeployment,
    },
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    traces::{
        provider::convert_span_to_provider_format,
        realtime::{send_span_updates, send_trace_updates},
        utils::{get_llm_usage_for_span, group_traces_by_project, prepare_span_for_recording},
    },
    utils::limits::{get_workspace_signal_runs_limit_exceeded, update_workspace_bytes_ingested},
    worker::HandlerError,
};

const SIGNAL_TRIGGER_LOCK_TTL_SECONDS: u64 = 3600; // 1 hour
const MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES: usize = 5120; // 5KB

#[instrument(skip(messages, db, clickhouse, cache, queue, pubsub, ch, config))]
pub async fn process_span_messages(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
    ch: impl ClickhouseTrait,
    config: Option<&WorkspaceDeployment>,
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

    // Enrich spans with usage info
    let mut span_usage_vec = Vec::with_capacity(spans.len());

    for span in &mut spans {
        let span_usage = get_llm_usage_for_span(
            &mut span.attributes,
            db.clone(),
            cache.clone(),
            &span.name,
            &span.project_id,
        )
        .await;

        prepare_span_for_recording(span, &span_usage);
        convert_span_to_provider_format(span);

        span_usage_vec.push(span_usage);
    }

    // Process trace aggregations and update trace statistics
    let trace_aggregations = TraceAggregation::from_spans(&spans, &span_usage_vec);

    // Upsert trace statistics in PostgreSQL
    let updated_traces = match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
        Ok(updated_traces) => {
            // Fetch existing trace_tags from ClickHouse so they are preserved
            // when ReplacingMergeTree merges rows with higher num_spans.
            let trace_ids: Vec<Uuid> = updated_traces.iter().map(|t| t.id()).collect();
            let project_ids: Vec<Uuid> =
                updated_traces.iter().map(|t| t.project_id()).unique().collect();
            let existing_tags =
                match get_existing_trace_tags(&clickhouse, &trace_ids, &project_ids).await {
                    Ok(tags) => tags,
                    Err(e) => {
                        log::error!(
                            "Failed to fetch existing trace_tags from ClickHouse, \
                             skipping trace insert to avoid data loss: {:?}",
                            e
                        );
                        // Skip ClickHouse insert entirely to avoid overwriting
                        // existing trace_tags with empty values.
                        send_trace_updates(&updated_traces, &pubsub, &HashMap::new()).await;
                        return Ok(());
                    }
                };

            let ch_traces: Vec<CHTrace> = updated_traces
                .iter()
                .map(|trace| {
                    let tags = existing_tags
                        .get(&trace.id())
                        .cloned()
                        .unwrap_or_default();
                    CHTrace::from_db_trace(trace, tags)
                })
                .collect();

            if let Err(e) = ch.insert_batch(&ch_traces, config).await {
                log::error!(
                    "Failed to upsert {} traces to ClickHouse: {:?}",
                    ch_traces.len(),
                    e
                );
            }

            send_trace_updates(&updated_traces, &pubsub, &existing_tags).await;

            Some(updated_traces)
        }
        Err(e) => {
            log::error!("Failed to upsert trace statistics to PostgreSQL: {:?}", e);
            None
        }
    };

    // Build CHSpans with embedded events and insert to ClickHouse
    let ch_spans: Vec<CHSpan> = spans
        .iter()
        .zip(span_usage_vec.iter())
        .filter(|(span, _)| span.should_record_to_clickhouse())
        .map(|(span, usage)| CHSpan::from_db_span(span, usage, span.project_id))
        .collect();

    // Record spans to clickhouse
    if let Err(e) = ch.insert_batch(&ch_spans, config).await {
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

    // Check signal triggers AFTER spans are inserted into ClickHouse
    // so the signal agent can see the trace data when processing.
    if let Some(updated_traces) = &updated_traces {
        if is_feature_enabled(Feature::Signals) {
            let traces_by_project = group_traces_by_project(updated_traces);
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

    // Send realtime span updates
    let recordable: Vec<&Span> = spans
        .iter()
        .filter(|span| span.should_record_to_clickhouse())
        .collect();

    let spans_for_realtime: Vec<Span> = recordable.iter().map(|s| (*s).clone()).collect();
    send_span_updates(&spans_for_realtime, &pubsub).await;

    // Index spans and events in Quickwit
    // Non-LLM spans are only indexed if their size is <= 5KB
    let quickwit_spans: Vec<QuickwitIndexedSpan> = recordable
        .iter()
        .filter(|s| {
            s.span_type == SpanType::LLM || s.size_bytes <= MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES
        })
        .map(|s| (*s).into())
        .collect();
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
            if let Err(e) = update_workspace_bytes_ingested(
                db.clone(),
                clickhouse.clone(),
                cache.clone(),
                queue.clone(),
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

    if is_feature_enabled(Feature::UsageLimit) {
        let signal_runs_exceeded = get_workspace_signal_runs_limit_exceeded(
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            project_id,
        )
        .await;
        if signal_runs_exceeded.is_ok_and(|exceeded| exceeded) {
            log::debug!(
                "Workspace signal runs limit exceeded for project [{}]. Skipping triggers.",
                project_id,
            );
            return;
        }
    }

    // Lazily fetch pre-computed sampling factors only if any trigger has sampling enabled
    let any_has_sampling = triggers.iter().any(|t| t.signal.sample_rate.is_some());
    let sampling_factors = if any_has_sampling {
        match get_sampling_factors_cached(cache.clone(), &clickhouse, project_id).await {
            Ok(factors) => Some(factors),
            Err(e) => {
                log::error!(
                    "Failed to get sampling factors for project {}: {:?}. \
                     Sampled signals will be skipped; non-sampled signals proceed normally.",
                    project_id,
                    e
                );
                None
            }
        }
    } else {
        None
    };

    for trigger in &triggers {
        let matching_traces = traces
            .iter()
            .filter(|trace| trace.matches_filters(spans, &trigger.filters));

        for trace in matching_traces {
            // Check sampling if enabled for this signal
            if let Some(sample_rate) = trigger.signal.sample_rate {
                if let Some(ref factors) = sampling_factors {
                    if !should_sample_trace(sample_rate, &trace.user_id(), factors) {
                        log::debug!(
                            "Skipping trace for user {}",
                            trace.user_id().unwrap_or_default()
                        );
                        continue;
                    } else {
                        log::debug!(
                            "Processing trace for user {}",
                            trace.user_id().unwrap_or_default()
                        );
                    }
                } else {
                    // Sampling factors failed to load — skip sampled triggers
                    // to avoid processing all traces unsampled (over-billing)
                    continue;
                }
            }

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
                trigger.mode.as_u8(),
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
