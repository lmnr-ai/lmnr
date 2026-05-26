use std::collections::HashMap;
use std::sync::Arc;

use itertools::Itertools;
use rayon::prelude::*;
use serde_json::Value;
use tracing::{Instrument, instrument};
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
        spans::Span,
        trace::{
            Trace, TraceMetadataPatch, merge_trace_metadata_batch, upsert_trace_statistics_batch,
        },
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
        input_dedup::{LlmInputDedup, build_dedup_batch, mark_seen},
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
    // Producer-side preprocessing already ran `parse_and_enrich_attributes`
    // and `convert_span_to_provider_format` for `pre_processed` messages.
    // Re-running on the consumer would double-apply the LangChain rewrite
    // and double-copy attributes into `span.input`, breaking dedup identity.
    let mut messages: Vec<RabbitMqSpanMessage> = messages
        .into_par_iter()
        .map(|mut message| {
            if !message.pre_processed {
                message.span.parse_and_enrich_attributes();
            }
            message
        })
        .collect();

    // Split metadata-only virtual spans (POST /v1/traces/metadata) out before
    // the regular pipeline. They don't contribute span / token / time stats,
    // they aren't recorded to ClickHouse, and their PG path is a metadata
    // merge against an existing trace row — never an insert.
    let metadata_patches: Vec<TraceMetadataPatch> = messages
        .iter()
        .filter(|m| m.span.attributes.is_metadata_only())
        .filter_map(|m| {
            let metadata = m.span.attributes.metadata()?;
            let metadata_value = serde_json::to_value(&metadata).ok()?;
            Some(TraceMetadataPatch {
                trace_id: m.span.trace_id,
                project_id: m.span.project_id,
                metadata: metadata_value,
            })
        })
        .collect();
    messages.retain(|m| !m.span.attributes.is_metadata_only());

    // Enrich spans with usage info
    let mut span_usage_vec = Vec::with_capacity(messages.len());

    let usage_span = tracing::info_span!("preprocess.usage_lookup", span_count = messages.len());
    async {
        for m in &mut messages {
            let span_usage = get_llm_usage_for_span(
                &mut m.span.attributes,
                db.clone(),
                cache.clone(),
                &m.span.name,
                &m.span.project_id,
            )
            .await;

            prepare_span_for_recording(&mut m.span, &span_usage);
            if !m.pre_processed {
                convert_span_to_provider_format(&mut m.span);
            }
            // Must run AFTER provider conversion — LangChain rewrites `input`.
            m.span.estimate_size_bytes();

            span_usage_vec.push(span_usage);
        }
    }
    .instrument(usage_span)
    .await;

    // Split into parallel `Vec`s — downstream code reads `spans` and
    // `dedups` as separate slices keyed by index.
    let (mut spans, dedups): (Vec<Span>, Vec<Option<LlmInputDedup>>) = messages
        .into_iter()
        .map(|m| (m.span, m.input_dedup))
        .unzip();

    // Process trace aggregations
    let trace_aggregations = {
        let _g = tracing::info_span!("preprocess.trace_agg", span_count = spans.len()).entered();
        TraceAggregation::from_spans(&spans, &span_usage_vec)
    };

    // Build the dedup batch up front so the size-bytes loop and CHSpans build
    // can run before we kick off the parallel inserts.
    let recordable_indices: Vec<usize> = spans
        .iter()
        .enumerate()
        .filter(|(_, s)| s.should_record_to_clickhouse())
        .map(|(i, _)| i)
        .collect();
    let dedup = {
        let _g = tracing::info_span!(
            "preprocess.dedup_batch",
            recordable = recordable_indices.len()
        )
        .entered();
        let dedup_input: Vec<&Span> = recordable_indices.iter().map(|&i| &spans[i]).collect();
        let recordable_dedups: Vec<Option<LlmInputDedup>> = recordable_indices
            .iter()
            .map(|&i| dedups[i].clone())
            .collect();
        build_dedup_batch(&dedup_input, &recordable_dedups)
    };

    // Charge each span for its input: dedup'd LLM spans pay for the hash
    // array + any newly-inserted `llm_messages.content` (shared messages are
    // billed once, to the first referrer); everything else pays for the raw
    // JSON. `estimate_size_bytes` intentionally excludes input so this loop
    // owns the accounting.
    let mut dedup_lookup: HashMap<usize, usize> = HashMap::with_capacity(recordable_indices.len());
    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        dedup_lookup.insert(span_idx, dedup_idx);
    }
    for (span_idx, span) in spans.iter_mut().enumerate() {
        let added = if let Some(&dedup_idx) = dedup_lookup.get(&span_idx) {
            let hashes = dedup
                .span_hashes
                .get(dedup_idx)
                .map(|h| h.len())
                .unwrap_or(0);
            if hashes > 0 {
                let content_bytes = dedup
                    .span_content_bytes
                    .get(dedup_idx)
                    .copied()
                    .unwrap_or(0);
                // 32 bytes per BLAKE3-256 hash + new `llm_messages.content` bytes.
                hashes * 32 + content_bytes
            } else {
                span.input
                    .as_ref()
                    .map_or(0, crate::utils::estimate_json_size)
            }
        } else if let Some(d) = dedups.get(span_idx).and_then(|d| d.as_ref()) {
            // Non-recordable LLM span (e.g. CC Bash-tool `anthropic.messages`)
            // whose `span.input` was stripped to None on the producer. Without
            // this branch the fall-through would bill 0 bytes, regressing the
            // "non-recorded spans contribute input bytes to workspace usage"
            // invariant. Closest post-dedup analogue: 32B per hash + the
            // Redis-miss content the producer carried.
            // 32 bytes per BLAKE3-256 hash + producer's Redis-miss content bytes.
            d.hashes.len() * 32 + d.new_contents.iter().map(|s| s.len()).sum::<usize>()
        } else {
            span.input
                .as_ref()
                .map_or(0, crate::utils::estimate_json_size)
        };
        span.increment_size_bytes(added);
    }

    // Build CHSpans with embedded events to insert to ClickHouse
    let ch_spans: Vec<CHSpan> = {
        let _g: tracing::span::EnteredSpan = tracing::info_span!(
            "preprocess.ch_span_build",
            recordable = recordable_indices.len()
        )
        .entered();
        recordable_indices
            .iter()
            .enumerate()
            .map(|(dedup_idx, &span_idx)| {
                let span = &spans[span_idx];
                let usage = &span_usage_vec[span_idx];
                let mut ch_span = CHSpan::from_db_span(span, usage, span.project_id);
                let hashes = dedup
                    .span_hashes
                    .get(dedup_idx)
                    .cloned()
                    .unwrap_or_default();
                if !hashes.is_empty() {
                    ch_span.input = String::new();
                    ch_span.input_message_hashes = hashes;
                    ch_span.input_new_message_indices = dedup
                        .span_new_indices
                        .get(dedup_idx)
                        .cloned()
                        .unwrap_or_default();
                }
                ch_span
            })
            .collect()
    };

    // Parallelize trace upsert against the span path. Within the span path
    // the strict order llm_messages -> mark_seen -> spans must be preserved
    // (`spans` is plain MergeTree, so a retry after a successful spans
    // insert + failed llm_messages insert would duplicate every span row).
    // See CLAUDE.md "Ingest order in process_span_messages".
    let ch = &ch;

    let trace_branch = async {
        // The aggregation upsert and the metadata-patch UPDATE target the same
        // `(project_id, id)` row lock, but their failure modes are independent:
        // a single flush can mix span ingestion for trace A with a metadata
        // patch for trace B, and an aggregation upsert error must not drop the
        // unrelated patch. Run each step independently and collect whatever
        // succeeds for the CH / realtime dispatch.
        let mut updated_traces: Vec<Trace> = Vec::new();
        let aggregation_ok = if trace_aggregations.is_empty() {
            true
        } else {
            match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
                Ok(traces) => {
                    updated_traces.extend(traces);
                    true
                }
                Err(e) => {
                    log::error!("Failed to upsert trace statistics to PostgreSQL: {:?}", e);
                    false
                }
            }
        };

        // Patches are skipped (no row created) when the trace doesn't exist
        // — the route handler validates existence up front.
        if !metadata_patches.is_empty() {
            match merge_trace_metadata_batch(&db.pool, &metadata_patches).await {
                Ok(patched) => updated_traces.extend(patched),
                Err(e) => {
                    log::error!("Failed to merge trace metadata patches: {:?}", e);
                }
            }
        }

        if !updated_traces.is_empty() {
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
        }

        // Signals are gated on the aggregation upsert specifically: if it
        // errored, downstream signal evaluation would see stale data even
        // when a metadata patch in the same flush succeeded. `None` here
        // suppresses the signals call below; metadata-only patches need no
        // signal evaluation regardless.
        if aggregation_ok {
            Some(updated_traces)
        } else {
            None
        }
    };

    let span_branch = async {
        if !dedup.messages.is_empty() {
            let keys: Vec<(Uuid, Uuid, [u8; 32])> = dedup
                .messages
                .iter()
                .map(|m| (m.project_id, m.trace_id, m.message_hash))
                .collect();
            if let Err(e) = ch.insert_batch(&dedup.messages, config).await {
                log::error!(
                    "Failed to insert {} llm_messages to ClickHouse: {:?}",
                    dedup.messages.len(),
                    e
                );
                return Err(HandlerError::transient(anyhow::anyhow!(
                    "Failed to insert llm_messages to Clickhouse: {:?}",
                    e
                )));
            }
            mark_seen(&keys, cache.clone()).await;
        }

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
        Ok(())
    };

    let (updated_traces, span_result) = tokio::join!(trace_branch, span_branch);
    span_result?;

    // Must run AFTER the spans insert so the signal agent sees the trace data.
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
    let recordable_refs: Vec<&Span> = recordable_indices.iter().map(|&i| &spans[i]).collect();

    let spans_for_realtime: Vec<Span> = recordable_refs.iter().map(|s| (*s).clone()).collect();
    send_span_updates(&spans_for_realtime, &pubsub).await;

    // Index spans and events in Quickwit
    // Non-LLM spans are only indexed if their size is <= 5KB.
    // For LLM spans, only the deduped "new messages" subset is indexed —
    // older repeated history already searchable via the prior step's span.
    let quickwit_spans: Vec<QuickwitIndexedSpan> = recordable_refs
        .iter()
        .enumerate()
        .filter(|(_, s)| s.is_llm_span() || s.size_bytes <= MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES)
        .map(|(dedup_idx, s)| {
            // For LLM spans: parse this span's new messages into `Vec<Value>`
            // for the indexer. `span_new_message_indices[dedup_idx]` points
            // into `dedup.messages` — no layout assumption. Works for both
            // the producer path (where `span.input` is `None`) and the
            // legacy path. Unparseable JSON is dropped (filter_map) — the
            // row still went to llm_messages, it just isn't searchable.
            // A span with no hashes (non-array input or empty plan) gets
            // `None`, so `from_span` falls through to raw `span.input`.
            let new_messages = if s.is_llm_span()
                && dedup
                    .span_hashes
                    .get(dedup_idx)
                    .map(|h| !h.is_empty())
                    .unwrap_or(false)
            {
                dedup.span_new_message_indices.get(dedup_idx).map(|idxs| {
                    idxs.iter()
                        .filter_map(|&i| dedup.messages.get(i))
                        .filter_map(|m| serde_json::from_str::<Value>(&m.content).ok())
                        .collect::<Vec<Value>>()
                })
            } else {
                None
            };
            QuickwitIndexedSpan::from_span(s, new_messages.as_deref())
        })
        .collect();
    let quickwit_events: Vec<QuickwitIndexedEvent> = recordable_refs
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
