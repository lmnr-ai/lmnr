use std::collections::HashMap;
use std::sync::Arc;

use itertools::Itertools;
use rayon::prelude::*;
use serde_json::Value;
use tracing::instrument;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::{Cache, autocomplete::populate_autocomplete_cache},
    ch::{
        ClickhouseTrait,
        messages::CHMessage,
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
    pii_redactor::{PiiRedactorClient, redact_spans_in_place},
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    traces::{
        message_dedup::{MessageDedup, build_dedup_batch, mark_seen},
        provider::convert_span_to_provider_format,
        realtime::{
            RealtimeDebuggerTrace, RealtimeTrace, TraceChannel, channels_for_trace,
            send_span_updates, send_trace_updates,
        },
        tool_dedup::{ToolDedup, resolve_tool_dedup},
        utils::{get_llm_usage_for_span, prepare_span_for_recording},
    },
    utils::limits::update_workspace_bytes_ingested,
    worker::HandlerError,
};

const MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES: usize = 5120; // 5KB

#[instrument(skip(messages, db, clickhouse, cache, queue, pubsub, ch, pii_redactor, config))]
pub async fn process_span_messages(
    messages: Vec<RabbitMqSpanMessage>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
    ch: impl ClickhouseTrait,
    pii_redactor: Option<PiiRedactorClient>,
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
            let Some(metadata) = m.span.attributes.metadata() else {
                log::warn!(
                    "metadata-only span {} (trace {}) has no metadata attributes; patch dropped",
                    m.span.span_id,
                    m.span.trace_id
                );
                return None;
            };
            match serde_json::to_value(&metadata) {
                Ok(metadata_value) => Some(TraceMetadataPatch {
                    trace_id: m.span.trace_id,
                    project_id: m.span.project_id,
                    metadata: metadata_value,
                }),
                Err(e) => {
                    log::warn!(
                        "metadata-only span {} (trace {}): failed to serialize metadata; patch dropped: {:?}",
                        m.span.span_id,
                        m.span.trace_id,
                        e
                    );
                    None
                }
            }
        })
        .collect();
    messages.retain(|m| !m.span.attributes.is_metadata_only());

    // Enrich spans with usage info
    let mut span_usage_vec = Vec::with_capacity(messages.len());

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
        // `estimate_size_bytes` is deferred until AFTER PII redaction
        // (post-dedup loop below) so the recorded size reflects the
        // redacted output.

        span_usage_vec.push(span_usage);
    }

    // Split into parallel `Vec`s — downstream code reads `spans`, `dedups`
    // (input messages), `output_dedups`, and `tool_dedups` as separate slices
    // keyed by index. All three dedup paths share the project-scoped
    // `messages` table (LAM-1634).
    let (mut spans, dedup_triples): (
        Vec<Span>,
        Vec<(
            Option<MessageDedup>,
            Option<MessageDedup>,
            Option<ToolDedup>,
        )>,
    ) = messages
        .into_iter()
        .map(|m| (m.span, (m.input_dedup, m.output_dedup, m.tool_dedup)))
        .unzip();
    let (input_dedups, output_dedups, tool_dedups): (
        Vec<Option<MessageDedup>>,
        Vec<Option<MessageDedup>>,
        Vec<Option<ToolDedup>>,
    ) = {
        let mut a = Vec::with_capacity(dedup_triples.len());
        let mut b = Vec::with_capacity(dedup_triples.len());
        let mut c = Vec::with_capacity(dedup_triples.len());
        for (i, o, t) in dedup_triples {
            a.push(i);
            b.push(o);
            c.push(t);
        }
        (a, b, c)
    };

    let trace_aggregations = TraceAggregation::from_spans(&spans, &span_usage_vec);

    // Build the unified dedup batch up front so the size-bytes loop and
    // CHSpans build can run before we kick off the parallel inserts. Input,
    // output, and tool dedups all share the project-scoped `messages` table
    // (LAM-1634). The `seen_storage_in_batch` HashSet collapses
    // `(project_id, hash)` across all three paths so a hash that appears as
    // input in span A, output in span B, and as part of a tool definition
    // in span C emits exactly one `messages` row.
    let recordable_indices: Vec<usize> = spans
        .iter()
        .enumerate()
        .filter(|(_, s)| s.should_record_to_clickhouse())
        .map(|(i, _)| i)
        .collect();
    let (mut ch_messages, mut input_batch, mut output_batch, tool_content_bytes_per_recordable) = {
        let _g = tracing::info_span!(
            "preprocess.dedup_batch",
            recordable = recordable_indices.len()
        )
        .entered();
        let dedup_spans: Vec<&Span> = recordable_indices.iter().map(|&i| &spans[i]).collect();
        let recordable_input_dedups: Vec<Option<MessageDedup>> = recordable_indices
            .iter()
            .map(|&i| input_dedups[i].clone())
            .collect();
        let recordable_output_dedups: Vec<Option<MessageDedup>> = recordable_indices
            .iter()
            .map(|&i| output_dedups[i].clone())
            .collect();
        let recordable_tool_dedups: Vec<Option<ToolDedup>> = recordable_indices
            .iter()
            .map(|&i| tool_dedups[i].clone())
            .collect();

        let mut messages: Vec<CHMessage> = Vec::new();
        let mut seen_storage_in_batch: std::collections::HashSet<(Uuid, [u8; 32])> =
            std::collections::HashSet::new();

        let input_batch = build_dedup_batch(
            &dedup_spans,
            &recordable_input_dedups,
            &mut seen_storage_in_batch,
            &mut messages,
        );
        let output_batch = build_dedup_batch(
            &dedup_spans,
            &recordable_output_dedups,
            &mut seen_storage_in_batch,
            &mut messages,
        );

        let mut tool_content_bytes: Vec<usize> = vec![0; recordable_indices.len()];
        for (dedup_idx, span) in dedup_spans.iter().enumerate() {
            if let Some(td) = recordable_tool_dedups[dedup_idx].as_ref() {
                tool_content_bytes[dedup_idx] =
                    resolve_tool_dedup(span, td, &mut seen_storage_in_batch, &mut messages);
            }
        }

        (messages, input_batch, output_batch, tool_content_bytes)
    };

    // Project-level PII redaction. Triggered by `projects.settings.removePii`
    // (cached on `ProjectWithWorkspaceBillingInfo`). Runs AFTER dedup so the
    // redacted bytes flow into both the `messages` insert and Quickwit
    // indexing through the same shared `ch_messages` buffer; runs BEFORE
    // the input-bytes accounting / `messages` CH insert / Quickwit indexing
    // so every storage tier holds the redacted content. Already-seen
    // messages were redacted on first emit and ride the wire as hashes only.
    // Tool-definition blobs share the same `ch_messages` buffer but the
    // redactor walks only the input + output `span_new_message_indices`
    // slices, so tool defs are not redacted (they're schemas, not user
    // text). Best-effort: failures are logged inside `redact_spans_in_place`
    // and do not fail the batch.
    if let Some(redactor) = pii_redactor.as_ref() {
        redact_spans_in_place(
            redactor,
            &mut spans,
            &mut ch_messages,
            crate::pii_redactor::DedupRedactionView {
                span_new_message_indices: &input_batch.span_new_message_indices,
                span_content_bytes: &mut input_batch.span_content_bytes,
            },
            crate::pii_redactor::DedupRedactionView {
                span_new_message_indices: &output_batch.span_new_message_indices,
                span_content_bytes: &mut output_batch.span_content_bytes,
            },
            &recordable_indices,
            db.clone(),
            cache.clone(),
        )
        .await;
    }

    for span in &mut spans {
        // Must run AFTER provider conversion (LangChain rewrites `input`)
        // and AFTER PII redaction so the size reflects redacted content.
        // Input/output are excluded here — the post-dedup input-bytes loop
        // below owns those charges.
        span.estimate_size_bytes();
    }

    // Charge each span for its input + output + tool definitions. Dedup'd
    // fields pay 32B per hash + any newly-inserted `messages.content`
    // (shared content billed once to the first referrer in the batch);
    // non-dedup'd or empty fields pay for the raw JSON. `estimate_size_bytes`
    // intentionally excludes these so this loop owns the accounting.
    let mut dedup_lookup: HashMap<usize, usize> = HashMap::with_capacity(recordable_indices.len());
    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        dedup_lookup.insert(span_idx, dedup_idx);
    }
    for (span_idx, span) in spans.iter_mut().enumerate() {
        let mut added: usize = 0;

        // Input bytes
        added += if let Some(&dedup_idx) = dedup_lookup.get(&span_idx) {
            let hashes = input_batch
                .span_hashes
                .get(dedup_idx)
                .map(|h| h.len())
                .unwrap_or(0);
            if hashes > 0 {
                let content_bytes = input_batch
                    .span_content_bytes
                    .get(dedup_idx)
                    .copied()
                    .unwrap_or(0);
                hashes * 32 + content_bytes
            } else {
                span.input
                    .as_ref()
                    .map_or(0, crate::utils::estimate_json_size)
            }
        } else if let Some(d) = input_dedups.get(span_idx).and_then(|d| d.as_ref()) {
            // Non-recordable LLM span whose `span.input` was stripped to None
            // on the producer. Without this branch the fall-through would
            // bill 0 bytes, regressing the "non-recorded spans contribute
            // input bytes to workspace usage" invariant.
            d.hashes.len() * 32 + d.new_contents.iter().map(|s| s.len()).sum::<usize>()
        } else {
            span.input
                .as_ref()
                .map_or(0, crate::utils::estimate_json_size)
        };

        // Output bytes. `estimate_size_bytes` already counted `self.output`
        // (unlike input, which it deliberately skips). Only add dedup'd
        // accounting when the producer actually stripped `span.output` to
        // `None` — for root / top spans the producer keeps `output`
        // populated for `TraceAggregation::from_spans`, and adding hash +
        // content bytes on top of the JSON `estimate_size_bytes` already
        // counted would double-bill those spans.
        if span.output.is_none() {
            if let Some(&dedup_idx) = dedup_lookup.get(&span_idx) {
                let hashes = output_batch
                    .span_hashes
                    .get(dedup_idx)
                    .map(|h| h.len())
                    .unwrap_or(0);
                if hashes > 0 {
                    let content_bytes = output_batch
                        .span_content_bytes
                        .get(dedup_idx)
                        .copied()
                        .unwrap_or(0);
                    added += hashes * 32 + content_bytes;
                }
            } else if let Some(d) = output_dedups.get(span_idx).and_then(|d| d.as_ref()) {
                // Non-recordable LLM span whose `span.output` was stripped to
                // None on the producer.
                added += d.hashes.len() * 32 + d.new_contents.iter().map(|s| s.len()).sum::<usize>();
            }
        }

        // Tool-definition bytes. `should_keep_attribute` already filters the
        // source `ai.prompt.tools` / `llm.request.functions.*` /
        // `gen_ai.tool.definitions` keys out of `CHSpan.attributes`, so
        // `estimate_size_bytes` doesn't double-count them. Charge 32B for
        // the hash plus any newly-inserted content (first referrer in batch).
        if let Some(&dedup_idx) = dedup_lookup.get(&span_idx) {
            if tool_dedups.get(span_idx).and_then(|d| d.as_ref()).is_some() {
                let content_bytes = tool_content_bytes_per_recordable
                    .get(dedup_idx)
                    .copied()
                    .unwrap_or(0);
                added += 32 + content_bytes;
            }
        } else if let Some(td) = tool_dedups.get(span_idx).and_then(|d| d.as_ref()) {
            added += 32 + td.content.as_ref().map(|c| c.len()).unwrap_or(0);
        }

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

                let input_hashes = input_batch
                    .span_hashes
                    .get(dedup_idx)
                    .cloned()
                    .unwrap_or_default();
                if !input_hashes.is_empty() {
                    ch_span.input = String::new();
                    ch_span.input_message_hashes = input_hashes;
                    ch_span.input_new_message_indices = input_batch
                        .span_new_indices
                        .get(dedup_idx)
                        .cloned()
                        .unwrap_or_default();
                }

                let output_hashes = output_batch
                    .span_hashes
                    .get(dedup_idx)
                    .cloned()
                    .unwrap_or_default();
                if !output_hashes.is_empty() {
                    ch_span.output = String::new();
                    ch_span.output_message_hashes = output_hashes;
                    ch_span.output_new_message_indices = output_batch
                        .span_new_indices
                        .get(dedup_idx)
                        .cloned()
                        .unwrap_or_default();
                }

                if let Some(td) = tool_dedups.get(span_idx).and_then(|d| d.as_ref()) {
                    ch_span.tool_definition_hash = td.hash;
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
        // patch for unrelated trace B, and an aggregation upsert error must
        // not drop B's patch. Run each step independently.
        //
        // Aggregation results are tracked separately so signals only see
        // traces whose state actually changed via real span ingestion —
        // metadata patches don't touch any field signals evaluate, and
        // passing patch-only traces (from a pure metadata-only flush, or
        // from a mixed flush touching different traces) to
        // `check_and_push_signals` would trigger spurious re-evaluations.
        let had_aggregations = !trace_aggregations.is_empty();
        let mut aggregation_traces: Vec<Trace> = Vec::new();
        let aggregation_ok = if had_aggregations {
            match upsert_trace_statistics_batch(&db.pool, &trace_aggregations).await {
                Ok(traces) => {
                    aggregation_traces = traces;
                    true
                }
                Err(e) => {
                    log::error!("Failed to upsert trace statistics to PostgreSQL: {:?}", e);
                    false
                }
            }
        } else {
            true
        };

        // Patches are skipped (no row created) when the trace doesn't exist
        // — the route handler validates existence up front.
        let mut patched_traces: Vec<Trace> = Vec::new();
        if !metadata_patches.is_empty() {
            match merge_trace_metadata_batch(&db.pool, &metadata_patches).await {
                Ok(patched) => patched_traces = patched,
                Err(e) => {
                    log::error!("Failed to merge trace metadata patches: {:?}", e);
                }
            }
        }

        // Build the CH / realtime payload as the deduped union, keeping the
        // LATEST occurrence per `(project_id, id)`. When a single flush
        // touches the same trace via BOTH the aggregation upsert AND a
        // metadata patch, both stages return the same row keyed by
        // `(project_id, id)`. The patch UPDATE bumps `num_spans` by 1, so
        // `traces_replacing` (ReplacingMergeTree(num_spans)) would pick the
        // patched row even if we shipped both — but skipping the redundant
        // pre-patch insert saves a part on the hot ingest table. Patches
        // are appended after aggregation, so last-write-wins preserves the
        // patched metadata.
        let mut updated_traces: Vec<Trace> =
            Vec::with_capacity(aggregation_traces.len() + patched_traces.len());
        updated_traces.extend(aggregation_traces.iter().cloned());
        updated_traces.extend(patched_traces);
        if updated_traces.len() > 1 {
            let mut last_idx_by_key: HashMap<(Uuid, Uuid), usize> =
                HashMap::with_capacity(updated_traces.len());
            for (i, t) in updated_traces.iter().enumerate() {
                last_idx_by_key.insert((t.project_id(), t.id()), i);
            }
            let kept: std::collections::HashSet<usize> =
                last_idx_by_key.into_values().collect();
            let mut idx = 0;
            updated_traces.retain(|_| {
                let keep = kept.contains(&idx);
                idx += 1;
                keep
            });
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

        // Return only the aggregation results to the signals path. `None`
        // suppresses `check_and_push_signals` entirely — used for both an
        // aggregation upsert error AND a pure metadata-only flush (no real
        // spans aggregated). Metadata patches never need signal evaluation:
        // they don't touch any field signals filter on, and re-running
        // signals against a patched-only trace would spuriously refire any
        // signal that already triggered for the trace.
        if aggregation_ok && had_aggregations {
            Some(aggregation_traces)
        } else {
            None
        }
    };

    // Trace-new keys for search "first occurrence per trace" semantic.
    // Project-scoped storage keys for content presence. Both must be stamped
    // on the consumer ONLY after a successful `messages` insert (LAM-1634).
    let storage_keys: Vec<(Uuid, [u8; 32])> = ch_messages
        .iter()
        .map(|m| (m.project_id, m.message_hash))
        .collect();
    let trace_new_keys: Vec<(Uuid, Uuid, [u8; 32])> = {
        let mut acc: Vec<(Uuid, Uuid, [u8; 32])> = Vec::new();
        for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
            let span = &spans[span_idx];
            if let Some(hashes) = input_batch.span_hashes.get(dedup_idx) {
                if let Some(positions) = input_batch.span_new_indices.get(dedup_idx) {
                    for &pos in positions {
                        if let Some(h) = hashes.get(pos as usize) {
                            acc.push((span.project_id, span.trace_id, *h));
                        }
                    }
                }
            }
            if let Some(hashes) = output_batch.span_hashes.get(dedup_idx) {
                if let Some(positions) = output_batch.span_new_indices.get(dedup_idx) {
                    for &pos in positions {
                        if let Some(h) = hashes.get(pos as usize) {
                            acc.push((span.project_id, span.trace_id, *h));
                        }
                    }
                }
            }
        }
        acc
    };

    let span_branch = async {
        // Strict order: messages -> mark_seen -> spans. `spans` is plain
        // MergeTree, so a retry after a successful spans insert + failed
        // messages insert would duplicate every span row. See CLAUDE.md.
        if !ch_messages.is_empty() {
            if let Err(e) = ch.insert_batch(&ch_messages, config).await {
                log::error!(
                    "Failed to insert {} messages to ClickHouse: {:?}",
                    ch_messages.len(),
                    e
                );
                return Err(HandlerError::transient(anyhow::anyhow!(
                    "Failed to insert messages to Clickhouse: {:?}",
                    e
                )));
            }
        }
        // Stamp Redis after the insert succeeded — even when `ch_messages`
        // was empty, trace-new keys may be non-empty (storage hits across
        // traces still need their trace-new positions recorded for search).
        if !storage_keys.is_empty() || !trace_new_keys.is_empty() {
            mark_seen(&storage_keys, &trace_new_keys, cache.clone()).await;
        }
        // Tool-definition Redis keys share the `s:` namespace — already
        // covered by `storage_keys`. No separate tool mark needed.

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
            // For LLM spans: parse this span's new INPUT messages into
            // `Vec<Value>` for the indexer. Output messages flow through
            // `span.output` directly — they're stripped only on dedup, and
            // the index path here picks the right slice from the unified
            // batch. `span_new_message_indices[dedup_idx]` points into
            // `ch_messages` — no layout assumption. Works for both the
            // producer path (where `span.input` is `None`) and the legacy
            // path. Unparseable JSON is dropped (filter_map) — the row
            // still went to `messages`, it just isn't searchable. A span
            // with no hashes (non-array input) gets `None`, so `from_span`
            // falls through to raw `span.input`.
            let new_messages = if s.is_llm_span()
                && input_batch
                    .span_hashes
                    .get(dedup_idx)
                    .map(|h| !h.is_empty())
                    .unwrap_or(false)
            {
                input_batch
                    .span_new_message_indices
                    .get(dedup_idx)
                    .map(|idxs| {
                        idxs.iter()
                            .filter_map(|&i| ch_messages.get(i))
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
