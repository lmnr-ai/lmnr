use std::collections::HashMap;
use std::sync::Arc;

use itertools::Itertools;
use rayon::prelude::*;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::{Cache, autocomplete::populate_autocomplete_cache},
    ch::{
        ClickhouseTrait,
        spans::CHSpan,
        traces::{CHTrace, TraceAggregation},
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
        realtime::{
            RealtimeDebuggerTrace, RealtimeTrace, TraceChannel, channels_for_trace,
            send_span_updates, send_trace_updates,
        },
        utils::{get_llm_usage_for_span, prepare_span_for_recording},
    },
    utils::limits::update_workspace_bytes_ingested,
    worker::HandlerError,
};

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
            let ch_traces: Vec<CHTrace> = updated_traces
                .iter()
                .map(|trace| CHTrace::from_db_trace(trace))
                .collect();

            if let Err(e) = ch.insert_batch(&ch_traces, config).await {
                log::error!(
                    "Failed to upsert {} traces to ClickHouse: {:?}",
                    ch_traces.len(),
                    e
                );
            }

            dispatch_trace_realtime_updates(&updated_traces, cache.clone(), &pubsub).await;

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
    // The signals entry point handles its own runtime feature gate and
    // per-project filtering/grouping internally — when the cargo feature
    // is off (OSS) or the runtime feature is disabled, this returns
    // immediately without cloning/grouping the traces.
    if let Some(updated_traces) = &updated_traces {
        crate::signals::check_and_push_signals(
            updated_traces,
            &spans,
            db.clone(),
            cache.clone(),
            clickhouse.clone(),
            queue.clone(),
        )
        .await;
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

async fn dispatch_trace_realtime_updates(traces: &[Trace], cache: Arc<Cache>, pubsub: &PubSub) {
    if traces.is_empty() {
        return;
    }

    let mut project_buckets: HashMap<Uuid, Vec<RealtimeTrace>> = HashMap::new();
    let mut evaluation_buckets: HashMap<(Uuid, Uuid), Vec<RealtimeTrace>> = HashMap::new();
    let mut debugger_buckets: HashMap<(Uuid, String), Vec<RealtimeDebuggerTrace>> = HashMap::new();

    for trace in traces {
        for channel in channels_for_trace(trace, cache.as_ref()).await {
            match channel {
                TraceChannel::Project => {
                    project_buckets
                        .entry(trace.project_id())
                        .or_default()
                        .push(RealtimeTrace::from_trace(trace));
                }
                TraceChannel::Evaluation(evaluation_id) => {
                    evaluation_buckets
                        .entry((trace.project_id(), evaluation_id))
                        .or_default()
                        .push(RealtimeTrace::from_trace(trace));
                }
                TraceChannel::RolloutDebugger(rollout_session_id) => {
                    debugger_buckets
                        .entry((trace.project_id(), rollout_session_id))
                        .or_default()
                        .push(RealtimeDebuggerTrace::from_trace(trace));
                }
            }
        }
    }

    for (project_id, traces_data) in project_buckets {
        send_trace_updates(&project_id, "traces", &traces_data, pubsub).await;
    }
    for ((project_id, evaluation_id), traces_data) in evaluation_buckets {
        let key = format!("evaluation_{}", evaluation_id);
        send_trace_updates(&project_id, &key, &traces_data, pubsub).await;
    }
    for ((project_id, rollout_session_id), traces_data) in debugger_buckets {
        let key = format!("rollout_session_{}", rollout_session_id);
        send_trace_updates(&project_id, &key, &traces_data, pubsub).await;
    }
}
