use std::collections::{HashMap, HashSet};
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
        spans::CHSpan,
        traces::TraceAggregation,
        traces_agg::{CHTraceAgg, PATCH_START_TIME_OFFSET_NS},
        traces_static::CHTraceStatic,
        utils::chrono_to_nanoseconds,
    },
    db::{
        DB, debugger_session_blocks, projects::PiiMode, spans::Span,
        workspaces::WorkspaceDeployment,
    },
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, stream::StreamPublisher},
    pii_redactor::{
        PiiOutcome, PiiRedactorClient, ProjectModes, SpanVerdict, redact_spans_in_place,
        resolve_project_pii_modes,
    },
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    traces::{
        dedup::{
            SeenMarks, SharedContentBatch,
            messages::{MessageBatch, MessageDedup},
            tools::{ToolDedup, resolve_tool_dedup},
        },
        metadata::TraceMetadataPatch,
        provider::convert_span_to_provider_format,
        realtime::{
            RealtimeTrace, TraceChannel, channels_for_aggregation, send_agent_input_update,
            send_span_updates, send_trace_updates,
        },
        span_attributes::{SPAN_TRACE_INPUT, SPAN_TRACE_OUTPUT_HASHES},
        spans::SpanUsage,
        utils::{get_llm_usage_for_span, prepare_span_for_recording},
    },
    utils::limits::update_workspace_bytes_ingested,
    worker::HandlerError,
};

const MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES: usize = 5120; // 5KB

const ROLLOUT_SESSION_METADATA_KEY: &str = "rollout.session_id";

/// Billed bytes for one field (input or output) of one span. Input and output
/// are accounted identically (both are excluded from
/// `estimate_size_bytes_no_payload`, so the billing loop owns 100% of their
/// charge):
///   - recordable + dedup'd (hashes > 0): 32B/hash + newly-inserted shared
///     content bytes (first referrer in batch pays the content).
///   - non-recordable + producer stripped the field to `None`: bill from the
///     wire dedup — 32B/hash + every shipped content. Over-bills the
///     trace-new-but-storage-hit subset (content already stored from another
///     trace) by its JSON size; acceptable, bounded by the trace's
///     unique-message tail, and the only post-dedup analogue available without
///     re-running `MessageBatch::build` for these spans.
///   - everyone else (populated, non-array, or genuinely empty field): raw JSON
///     size.
fn field_bytes(
    dedup_idx: Option<usize>,
    wire_dedup: Option<&MessageDedup>,
    batch: &MessageBatch,
    raw: &Option<serde_json::Value>,
) -> usize {
    if let Some(idx) = dedup_idx {
        let hashes = batch.span_hashes.get(idx).map(|h| h.len()).unwrap_or(0);
        if hashes > 0 {
            let content_bytes = batch.span_content_bytes.get(idx).copied().unwrap_or(0);
            hashes * 32 + content_bytes
        } else {
            raw.as_ref().map_or(0, crate::utils::estimate_json_size)
        }
    } else if let Some(d) = wire_dedup {
        d.hashes.len() * 32 + d.contents.values().map(|s| s.len()).sum::<usize>()
    } else {
        raw.as_ref().map_or(0, crate::utils::estimate_json_size)
    }
}

/// Billed bytes for a span's tool definitions: 32B for the hash plus any
/// newly-inserted shared content (first referrer in batch pays the content).
/// `should_keep_attribute` already strips the source `ai.prompt.tools` /
/// `llm.request.functions.*` / `gen_ai.tool.definitions` keys out of
/// `CHSpan.attributes`, so this isn't double-counted by
/// `estimate_size_bytes_no_payload`. Recordable spans read the per-batch
/// content size; non-recordable spans (producer stripped the field) bill from
/// the wire dedup's own content. No tool dedup → 0.
fn tool_bytes(
    dedup_idx: Option<usize>,
    tool_dedup: Option<&ToolDedup>,
    tool_content_bytes: &[usize],
) -> usize {
    match (dedup_idx, tool_dedup) {
        (Some(idx), Some(_)) => 32 + tool_content_bytes.get(idx).copied().unwrap_or(0),
        (None, Some(td)) => 32 + td.content.as_ref().map(|c| c.len()).unwrap_or(0),
        _ => 0,
    }
}

/// Raw extracted trace io carried on a metadata-only virtual span, split out
/// before the regular pipeline. `input` is the verbatim JSON the façade put on
/// `SPAN_TRACE_INPUT`; `output_hashes` are the per-message hashes into
/// `unique_content`. Both land in `traces_static`'s own io columns.
struct RawTraceIo {
    project_id: Uuid,
    trace_id: Uuid,
    input: Option<Value>,
    output_hashes: Option<Vec<[u8; 32]>>,
    /// Stamped by the extraction façade; routes the agent_input event to the
    /// debugger channel.
    rollout_session_id: Option<String>,
}

/// Metadata-only virtual spans split off before the regular pipeline: they
/// carry no span / token / time stats and are never recorded to ClickHouse.
/// Extracted io never joins `metadata_patches`: `traces_static.metadata` is one
/// whole-object column with SET semantics, so a synthetic delta would REPLACE
/// the customer's keys rather than sit beside them. Io has its own columns.
struct MetadataOnlySpans {
    raw_trace_io: Vec<RawTraceIo>,
    /// Customer patches from `POST /v1/traces/metadata`.
    metadata_patches: Vec<TraceMetadataPatch>,
}

/// The regular-pipeline spans of one flush, every `Vec` aligned by span index.
/// The dedup verdicts are the producer's and are authoritative; all three
/// paths share one content batch downstream (see [`DedupBatches`]).
struct SpanBatch {
    spans: Vec<Span>,
    usages: Vec<SpanUsage>,
    input_dedups: Vec<Option<MessageDedup>>,
    output_dedups: Vec<Option<MessageDedup>>,
    tool_dedups: Vec<Option<ToolDedup>>,
}

/// Dedup verdicts resolved for the recordable spans, every `Vec` keyed by
/// `dedup_idx` (position in `recordable_indices`). Input, output and tool
/// content share `shared_content`, which collapses a key that appears as input
/// in span A, output in span B, and in a tool definition in span C into exactly
/// one `unique_content` row.
struct DedupBatches {
    shared_content: SharedContentBatch,
    input: MessageBatch,
    output: MessageBatch,
    /// Newly-inserted tool-definition bytes per recordable span.
    tool_content_bytes: Vec<usize>,
}

/// Resolves each trace's `start_time` from this batch's span aggregation, for
/// the writes that carry no span times of their own (metadata patches, extracted
/// agent io). `start_time` is the partition key on `traces_agg` /
/// `traces_static`, so those writes MUST agree with the span-batch writes' value
/// or they land in a different partition and drop out of `start_time`-bounded
/// reads.
///
/// A trace whose spans arrived in an EARLIER flush isn't in this map — the
/// caller falls back per table (`now_ns` for `traces_static`, `now_ns +
/// PATCH_START_TIME_OFFSET_NS` for `traces_agg`'s `min` aggregate). That's exact
/// whenever the trace started in the current partition period; one that started
/// in a previous month lands a partition late, which `SELECT ... FINAL` still
/// coalesces but a tight `start_time` filter can clip.
fn resolve_static_start_times(aggregations: &[TraceAggregation]) -> HashMap<(Uuid, Uuid), i64> {
    aggregations
        .iter()
        .filter_map(|agg| {
            agg.start_time
                .map(|st| ((agg.project_id, agg.trace_id), chrono_to_nanoseconds(st)))
        })
        .collect()
}

/// Build `traces_static` writes for the extracted agent io (LAM-2026). Output
/// hashes are concatenated hex (64 chars each) because the column can't be a
/// `Nullable(Array(...))` — see `ch::traces_static`. `start_time` comes from
/// [`resolve_static_start_times`].
fn collect_static_agent_io_rows(
    io: &[RawTraceIo],
    start_time_by_trace: &HashMap<(Uuid, Uuid), i64>,
    now_ns: i64,
) -> Vec<CHTraceStatic> {
    io.iter()
        .filter_map(|entry| {
            let output_hashes = entry
                .output_hashes
                .as_ref()
                .map(|hashes| hashes.iter().map(hex::encode).collect::<String>());
            let start_time = start_time_by_trace
                .get(&(entry.project_id, entry.trace_id))
                .copied()
                .unwrap_or(now_ns);
            CHTraceStatic::from_agent_io(
                entry.project_id,
                entry.trace_id,
                // Not `Value::to_string`: that JSON-encodes a string task, and
                // every reader renders this column verbatim.
                entry.input.as_ref().map(crate::utils::json_value_to_string),
                output_hashes,
                start_time,
            )
        })
        .collect()
}

#[instrument(skip(
    messages,
    db,
    clickhouse,
    cache,
    queue,
    pubsub,
    ch,
    pii_redactor,
    config,
    indexer_stream_publisher
))]
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
    indexer_stream_publisher: Option<Arc<StreamPublisher>>,
    quickwit_indexing_enabled: bool,
) -> Result<(), HandlerError> {
    let messages = enrich_attributes(messages);
    let (metadata_only, messages): (Vec<RabbitMqSpanMessage>, Vec<RabbitMqSpanMessage>) = messages
        .into_iter()
        .partition(|m| m.span.attributes.is_metadata_only());
    let MetadataOnlySpans {
        raw_trace_io,
        metadata_patches,
    } = classify_metadata_only_spans(&metadata_only);

    let mut batch = enrich_spans_with_usage(messages, &db, &cache).await;
    let trace_aggregations = TraceAggregation::from_spans(&batch.spans, &batch.usages);

    // Non-recordable spans still bill and aggregate but never reach
    // ClickHouse; every `dedup_idx` downstream is a position in this list.
    let recordable_indices: Vec<usize> = batch
        .spans
        .iter()
        .enumerate()
        .filter(|(_, s)| s.should_record_to_clickhouse())
        .map(|(i, _)| i)
        .collect();

    let mut dedup = resolve_dedup_batches(&batch, &recordable_indices);
    let pii_modes = resolve_pii_modes(
        &batch.spans,
        &recordable_indices,
        &raw_trace_io,
        &db,
        &cache,
    )
    .await?;

    // Live agent_input — the stat delta can't carry it (extraction is async).
    dispatch_input_realtime_updates(&raw_trace_io, &pii_modes, cache.clone(), &pubsub).await;

    let pii_outcome = redact_pii(
        &mut batch.spans,
        &recordable_indices,
        &mut dedup,
        pii_redactor.as_ref(),
        &pii_modes,
    )
    .await;
    charge_span_sizes(&mut batch, &recordable_indices, &dedup);
    let ch_spans = build_ch_spans(&batch, &recordable_indices, &dedup, &pii_outcome);

    let recordable_refs: Vec<&Span> = recordable_indices
        .iter()
        .map(|&i| &batch.spans[i])
        .collect();
    let seen_marks = collect_seen_marks(&dedup, &recordable_refs, &pii_outcome);

    // The trace tables run in parallel with the span path; the span path
    // itself is strictly ordered (see `write_span_tables`).
    let trace_branch = async {
        if !trace_aggregations.is_empty() {
            debugger_session_blocks::upsert_blocks_for_traces(&db.pool, &trace_aggregations).await;
            dispatch_trace_realtime_updates(&trace_aggregations, cache.clone(), &pubsub).await;
        }
        write_trace_tables(
            &ch,
            config,
            &trace_aggregations,
            &metadata_patches,
            &raw_trace_io,
        )
        .await;
    };
    let span_branch = write_span_tables(
        &ch,
        config,
        &dedup.shared_content,
        &ch_spans,
        &seen_marks,
        &cache,
    );
    let ((), span_result) = tokio::join!(trace_branch, span_branch);
    span_result?;

    // Must run AFTER the spans insert: triggers are decided from the in-memory
    // batch delta, but filters read the trace's cumulative state back out of
    // ClickHouse traces_agg, and the signal agent needs the span data too.
    crate::signals::check_and_push_signals(
        &trace_aggregations,
        &batch.spans,
        db.clone(),
        cache.clone(),
        clickhouse.clone(),
        queue.clone(),
    )
    .await;

    let spans_for_realtime: Vec<Span> = recordable_refs.iter().map(|s| (*s).clone()).collect();
    send_span_updates(&spans_for_realtime, &pubsub).await;

    // Skipped entirely when nothing will ever drain `publish_for_indexing`:
    // neither the stream reader nor the queue-path indexer workers exist (see
    // `quickwit_indexing_enabled` at its call site), so building the payload
    // would be wasted work ahead of a publish that errors or piles up unread.
    if quickwit_indexing_enabled {
        publish_for_quickwit(
            &recordable_refs,
            &dedup,
            &pii_outcome,
            &queue,
            indexer_stream_publisher.as_ref(),
        )
        .await;
    }

    // Best-effort: the system prompt is trace-new for conversation-start LLM
    // spans, so it's in `dedup.input.span_trace_new_contents` even when
    // storage-deduped.
    if is_feature_enabled(Feature::Checkpoints) {
        crate::checkpoints::producer::publish_checkpoints_for_batch(
            &batch.spans,
            &recordable_indices,
            &dedup.input,
            &batch.tool_dedups,
            queue.clone(),
        )
        .await;
    }

    populate_autocomplete_caches(&batch.spans, &cache, &clickhouse).await;

    if is_feature_enabled(Feature::UsageLimit) {
        update_usage_limits(&batch.spans, &db, &clickhouse, &cache, &queue).await;
    }

    Ok(())
}

/// `pre_processed` messages already had `parse_and_enrich_attributes` and
/// `convert_span_to_provider_format` run by the producer. Re-running them on
/// the consumer would double-apply the LangChain rewrite and double-copy
/// attributes into `span.input`, breaking dedup identity.
fn enrich_attributes(messages: Vec<RabbitMqSpanMessage>) -> Vec<RabbitMqSpanMessage> {
    messages
        .into_par_iter()
        .map(|mut message| {
            if !message.pre_processed {
                message.span.parse_and_enrich_attributes();
            }
            message
        })
        .collect()
}

/// Routes each metadata-only span to one of the two flavours sharing the
/// marker: extracted trace io (LAM-1953) — the RAW value on `SPAN_TRACE_INPUT`
/// and/or hex-encoded hashes on `SPAN_TRACE_OUTPUT_HASHES`, headed for
/// `traces_static`'s own io columns — or a genuine customer metadata patch.
fn classify_metadata_only_spans(messages: &[RabbitMqSpanMessage]) -> MetadataOnlySpans {
    let mut out = MetadataOnlySpans {
        raw_trace_io: Vec::new(),
        metadata_patches: Vec::new(),
    };
    for m in messages {
        if let Some(io) = parse_raw_trace_io(&m.span) {
            out.raw_trace_io.push(io);
        } else if let Some(patch) = parse_metadata_patch(&m.span) {
            out.metadata_patches.push(patch);
        }
    }
    out
}

/// `None` when the span carries neither io attribute (it's a metadata patch).
fn parse_raw_trace_io(span: &Span) -> Option<RawTraceIo> {
    let attrs = &span.attributes.raw_attributes;
    let input = attrs.get(SPAN_TRACE_INPUT).cloned();
    let output_hashes = attrs
        .get(SPAN_TRACE_OUTPUT_HASHES)
        .and_then(Value::as_array)
        .and_then(|arr| {
            let decoded: Vec<[u8; 32]> = arr
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|s| {
                    let bytes = hex::decode(s).ok()?;
                    <[u8; 32]>::try_from(bytes).ok()
                })
                .collect();
            if decoded.len() < arr.len() {
                log::warn!(
                    "trace-output: {} of {} hashes failed to decode on span {}",
                    arr.len() - decoded.len(),
                    arr.len(),
                    span.span_id,
                );
            }
            (!decoded.is_empty()).then_some(decoded)
        });
    if input.is_none() && output_hashes.is_none() {
        return None;
    }
    let rollout_session_id = span.attributes.metadata().and_then(|meta| {
        meta.get(ROLLOUT_SESSION_METADATA_KEY)?
            .as_str()
            .map(String::from)
    });
    Some(RawTraceIo {
        project_id: span.project_id,
        trace_id: span.trace_id,
        input,
        output_hashes,
        rollout_session_id,
    })
}

/// A dropped patch is silent to the caller, so both drop paths log.
fn parse_metadata_patch(span: &Span) -> Option<TraceMetadataPatch> {
    let Some(metadata) = span.attributes.metadata() else {
        log::warn!(
            "metadata-only span {} (trace {}) has no metadata attributes; patch dropped",
            span.span_id,
            span.trace_id
        );
        return None;
    };
    match serde_json::to_value(&metadata) {
        Ok(metadata) => Some(TraceMetadataPatch {
            trace_id: span.trace_id,
            project_id: span.project_id,
            metadata,
        }),
        Err(e) => {
            log::warn!(
                "metadata-only span {} (trace {}): failed to serialize metadata; patch dropped: {:?}",
                span.span_id,
                span.trace_id,
                e
            );
            None
        }
    }
}

/// Usage lookup + recording prep, then the wire messages split into aligned
/// columns. Only LLM spans get token/cost usage: a non-LLM span may still carry
/// stray `gen_ai.usage.*` attributes (some auto-instrumentations set them on
/// Default/Tool spans), and counting those would inflate the per-span columns
/// and trace totals (LAM-1873). Sizing is deferred to `charge_span_sizes` so
/// the recorded size reflects PII redaction.
async fn enrich_spans_with_usage(
    messages: Vec<RabbitMqSpanMessage>,
    db: &Arc<DB>,
    cache: &Arc<Cache>,
) -> SpanBatch {
    let mut batch = SpanBatch {
        spans: Vec::with_capacity(messages.len()),
        usages: Vec::with_capacity(messages.len()),
        input_dedups: Vec::with_capacity(messages.len()),
        output_dedups: Vec::with_capacity(messages.len()),
        tool_dedups: Vec::with_capacity(messages.len()),
    };
    for mut m in messages {
        let usage = if m.span.is_llm_span() {
            get_llm_usage_for_span(
                &mut m.span.attributes,
                db.clone(),
                cache.clone(),
                &m.span.name,
                &m.span.project_id,
            )
            .await
        } else {
            SpanUsage::default()
        };
        prepare_span_for_recording(&mut m.span, &usage);
        if !m.pre_processed {
            convert_span_to_provider_format(&mut m.span);
        }
        batch.spans.push(m.span);
        batch.usages.push(usage);
        batch.input_dedups.push(m.input_dedup);
        batch.output_dedups.push(m.output_dedup);
        batch.tool_dedups.push(m.tool_dedup);
    }
    batch
}

/// Resolves every dedup verdict up front so billing and the CHSpan build can
/// run before the parallel inserts start.
fn resolve_dedup_batches(batch: &SpanBatch, recordable_indices: &[usize]) -> DedupBatches {
    let spans: Vec<&Span> = recordable_indices
        .iter()
        .map(|&i| &batch.spans[i])
        .collect();
    let input_dedups: Vec<Option<MessageDedup>> = recordable_indices
        .iter()
        .map(|&i| batch.input_dedups[i].clone())
        .collect();
    let output_dedups: Vec<Option<MessageDedup>> = recordable_indices
        .iter()
        .map(|&i| batch.output_dedups[i].clone())
        .collect();

    let mut shared_content = SharedContentBatch::default();
    let input = MessageBatch::build(&spans, &input_dedups, &mut shared_content);
    let output = MessageBatch::build(&spans, &output_dedups, &mut shared_content);
    let tool_content_bytes: Vec<usize> = recordable_indices
        .iter()
        .zip(&spans)
        .map(
            |(&span_idx, span)| match batch.tool_dedups[span_idx].as_ref() {
                Some(td) => resolve_tool_dedup(span, td, &mut shared_content),
                None => 0,
            },
        )
        .collect();

    DedupBatches {
        shared_content,
        input,
        output,
        tool_content_bytes,
    }
}

/// `projects.settings.piiMode` for every project in the flush (cached on
/// `ProjectWithWorkspaceBillingInfo`). A failed lookup fails the batch, since
/// storing a span on a guessed mode is permanent while a retry is not. Modes
/// are resolved whether or not a redactor is configured, so that decision does
/// not depend on the redactor being up. Extraction spans (`raw_trace_io`)
/// usually arrive in a batch of their own, so their projects are resolved
/// here as well: the live agent_input dispatch needs the mode.
async fn resolve_pii_modes(
    spans: &[Span],
    recordable_indices: &[usize],
    raw_trace_io: &[RawTraceIo],
    db: &Arc<DB>,
    cache: &Arc<Cache>,
) -> Result<ProjectModes, HandlerError> {
    resolve_project_pii_modes(
        recordable_indices
            .iter()
            .map(|&i| spans[i].project_id)
            .chain(raw_trace_io.iter().map(|io| io.project_id)),
        db.clone(),
        cache.clone(),
    )
    .await
    .map_err(|e| {
        log::error!("Failed to resolve project PII modes: {e:#}");
        HandlerError::transient(e)
    })
}

/// Project-level PII redaction. Runs AFTER dedup and BEFORE the
/// `unique_content` insert / Quickwit indexing so every storage tier holds the
/// redacted content. Already-seen-in-trace messages were redacted on first
/// emit and ride the wire as hashes only. The redactor walks every shared row
/// of `redact`/`dual` projects (so tool defs ARE screened along with messages —
/// acceptable, the redactor is no-op on schemas) plus the per-span Quickwit
/// content.
///
/// Redactor failures leave rows unchecked inside `redact_spans_in_place` and
/// do not fail the batch. Without a redactor every non-`off` row stays
/// unchecked (unavailable under a masking policy) and `dual` text stays out of
/// the search index.
///
/// The redactor works on the recordable spans in `recordable_indices` order,
/// so the outcome is keyed by `dedup_idx` like the dedup batches.
async fn redact_pii(
    spans: &mut [Span],
    recordable_indices: &[usize],
    dedup: &mut DedupBatches,
    pii_redactor: Option<&PiiRedactorClient>,
    pii_modes: &ProjectModes,
) -> PiiOutcome {
    let recordable_set: HashSet<usize> = recordable_indices.iter().copied().collect();
    let mut recordable: Vec<&mut Span> = spans
        .iter_mut()
        .enumerate()
        .filter(|(i, _)| recordable_set.contains(i))
        .map(|(_, s)| s)
        .collect();
    match pii_redactor {
        Some(redactor) => {
            redact_spans_in_place(
                redactor,
                &mut recordable,
                dedup.shared_content.rows_mut(),
                &mut dedup.input.span_trace_new_contents,
                &mut dedup.output.span_trace_new_contents,
                pii_modes,
            )
            .await
        }
        None => PiiOutcome::without_redactor(recordable.iter().map(|s| s.project_id), pii_modes),
    }
}

/// Sizes every span for billing. `estimate_size_bytes_no_payload` must run
/// AFTER provider conversion (LangChain rewrites `input`) and AFTER PII
/// redaction so the size reflects redacted content. It excludes input AND
/// output, so the per-field charges here (`field_bytes` / `tool_bytes`) own
/// 100% of their accounting.
fn charge_span_sizes(batch: &mut SpanBatch, recordable_indices: &[usize], dedup: &DedupBatches) {
    let dedup_idx_by_span: HashMap<usize, usize> = recordable_indices
        .iter()
        .enumerate()
        .map(|(dedup_idx, &span_idx)| (span_idx, dedup_idx))
        .collect();

    let SpanBatch {
        spans,
        input_dedups,
        output_dedups,
        tool_dedups,
        ..
    } = batch;
    for (span_idx, span) in spans.iter_mut().enumerate() {
        span.estimate_size_bytes_no_payload();

        let dedup_idx = dedup_idx_by_span.get(&span_idx).copied();
        let added = field_bytes(
            dedup_idx,
            input_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &dedup.input,
            &span.input,
        ) + field_bytes(
            dedup_idx,
            output_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &dedup.output,
            &span.output,
        ) + tool_bytes(
            dedup_idx,
            tool_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &dedup.tool_content_bytes,
        );
        span.increment_size_bytes(added);
    }
}

fn build_ch_spans(
    batch: &SpanBatch,
    recordable_indices: &[usize],
    dedup: &DedupBatches,
    pii_outcome: &PiiOutcome,
) -> Vec<CHSpan> {
    recordable_indices
        .iter()
        .enumerate()
        .map(|(dedup_idx, &span_idx)| {
            build_ch_span(
                &batch.spans[span_idx],
                &batch.usages[span_idx],
                batch.tool_dedups[span_idx].as_ref(),
                dedup_idx,
                dedup,
                pii_outcome.verdict(dedup_idx),
            )
        })
        .collect()
}

/// One `spans` row. Dedup'd fields ship hashes + trace-new indices instead of
/// text, and the masks go with the text they index.
fn build_ch_span(
    span: &Span,
    usage: &SpanUsage,
    tool_dedup: Option<&ToolDedup>,
    dedup_idx: usize,
    dedup: &DedupBatches,
    verdict: &SpanVerdict,
) -> CHSpan {
    let mut ch_span = CHSpan::from_db_span(span, usage, span.project_id);

    // `dual` mode: the canonical text replaces the row's own serialization so
    // the masks index the stored bytes.
    ch_span.pii_checked = verdict.pii_checked();
    if let SpanVerdict::Masked { input, output } = verdict {
        if let Some(masked) = input {
            ch_span.input_masks = masked.ch_masks();
            ch_span.input = masked.text.clone();
        }
        if let Some(masked) = output {
            ch_span.output_masks = masked.ch_masks();
            ch_span.output = masked.text.clone();
        }
    }

    let input_hashes = dedup
        .input
        .span_hashes
        .get(dedup_idx)
        .cloned()
        .unwrap_or_default();
    if !input_hashes.is_empty() {
        ch_span.input = String::new();
        ch_span.input_masks = Vec::new();
        ch_span.input_message_hashes = input_hashes;
        ch_span.input_new_message_indices = dedup
            .input
            .span_new_indices
            .get(dedup_idx)
            .cloned()
            .unwrap_or_default();
    }

    let output_hashes = dedup
        .output
        .span_hashes
        .get(dedup_idx)
        .cloned()
        .unwrap_or_default();
    if !output_hashes.is_empty() {
        ch_span.output = String::new();
        ch_span.output_masks = Vec::new();
        ch_span.output_message_hashes = output_hashes;
        ch_span.output_new_message_indices = dedup
            .output
            .span_new_indices
            .get(dedup_idx)
            .cloned()
            .unwrap_or_default();
    }

    if let Some(td) = tool_dedup {
        ch_span.tool_definitions_hash = td.hash;
    }

    ch_span
}

/// Storage marks for content presence, trace-new marks for the search "first
/// occurrence per trace" semantic; stamped ONLY after both inserts (see
/// `write_span_tables`). Rows whose redaction failed get no storage mark, so
/// the next occurrence is a storage miss and re-inserts them (RMT keeps the
/// latest), healing the row once the redactor is back. A span whose text was
/// kept out of the index likewise gets no trace-new marks: its messages stay
/// trace-new so a later span in the trace carries them to Quickwit.
fn collect_seen_marks(
    dedup: &DedupBatches,
    recordable: &[&Span],
    pii_outcome: &PiiOutcome,
) -> SeenMarks {
    let mut marks = SeenMarks::default();
    dedup
        .shared_content
        .storage_marks(&mut marks, |i| pii_outcome.shared_row_failed(i));
    let unindexable = |dedup_idx: usize| !pii_outcome.is_indexable(dedup_idx);
    dedup
        .input
        .trace_new_marks(recordable, &mut marks, unindexable);
    dedup
        .output
        .trace_new_marks(recordable, &mut marks, unindexable);
    marks
}

/// Per-batch DELTA writes to `traces_agg` and `traces_static`. `start_time` is
/// the partition key on both tables, so writes that carry no span times of
/// their own (metadata patches, extracted agent io) resolve it from this
/// batch's aggregation — otherwise they'd land in a different partition than
/// the span-batch writes for the same trace. A trace whose spans arrived in an
/// earlier flush resolves to nothing and falls back per table (see
/// `PATCH_START_TIME_OFFSET_NS` for the `min`-safe agg fallback).
async fn write_trace_tables(
    ch: &impl ClickhouseTrait,
    config: Option<&WorkspaceDeployment>,
    aggregations: &[TraceAggregation],
    metadata_patches: &[TraceMetadataPatch],
    raw_trace_io: &[RawTraceIo],
) {
    let now_ns = chrono_to_nanoseconds(chrono::Utc::now());
    let start_time_by_trace = resolve_static_start_times(aggregations);

    let agg_rows =
        build_traces_agg_rows(aggregations, metadata_patches, &start_time_by_trace, now_ns);
    if !agg_rows.is_empty()
        && let Err(e) = ch.insert_batch(&agg_rows, config).await
    {
        log::error!(
            "Failed to insert {} trace aggregation partials to ClickHouse: {:?}",
            agg_rows.len(),
            e
        );
    }

    let static_rows = build_traces_static_rows(
        aggregations,
        metadata_patches,
        raw_trace_io,
        &start_time_by_trace,
        now_ns,
    );
    if !static_rows.is_empty()
        && let Err(e) = ch.insert_batch(&static_rows, config).await
    {
        log::error!(
            "Failed to insert {} traces_static rows to ClickHouse: {:?}",
            static_rows.len(),
            e
        );
    }
}

/// Aggregate partials from the in-memory per-batch deltas — never a cumulative
/// row, which would double-count every `sum` column on each batch. Metadata
/// patches contribute an identity partial carrying only the patched map.
fn build_traces_agg_rows(
    aggregations: &[TraceAggregation],
    metadata_patches: &[TraceMetadataPatch],
    start_time_by_trace: &HashMap<(Uuid, Uuid), i64>,
    now_ns: i64,
) -> Vec<CHTraceAgg> {
    let mut rows = Vec::with_capacity(aggregations.len() + metadata_patches.len());
    rows.extend(
        aggregations
            .iter()
            .map(|agg| CHTraceAgg::from_aggregation(agg, now_ns)),
    );
    rows.extend(metadata_patches.iter().map(|patch| {
        CHTraceAgg::from_metadata_patch(
            patch.project_id,
            patch.trace_id,
            Some(&patch.metadata),
            start_time_by_trace
                .get(&(patch.project_id, patch.trace_id))
                .copied()
                .unwrap_or(now_ns + PATCH_START_TIME_OFFSET_NS),
        )
    }));
    rows
}

/// Set-once columns for `traces_static` (CoalescingMergeTree): each column
/// resolves independently, so a write only touches what it carries and a batch
/// that learned nothing static produces no row. Metadata patches carry ONLY
/// the patched object — SET, not patch, semantics (see `ch::traces_static`).
fn build_traces_static_rows(
    aggregations: &[TraceAggregation],
    metadata_patches: &[TraceMetadataPatch],
    raw_trace_io: &[RawTraceIo],
    start_time_by_trace: &HashMap<(Uuid, Uuid), i64>,
    now_ns: i64,
) -> Vec<CHTraceStatic> {
    let mut rows = Vec::new();
    rows.extend(
        aggregations
            .iter()
            .filter_map(|agg| CHTraceStatic::from_aggregation(agg, now_ns)),
    );
    rows.extend(metadata_patches.iter().filter_map(|patch| {
        CHTraceStatic::from_metadata_patch(
            patch.project_id,
            patch.trace_id,
            Some(&patch.metadata),
            start_time_by_trace
                .get(&(patch.project_id, patch.trace_id))
                .copied()
                .unwrap_or(now_ns),
        )
    }));
    rows.extend(collect_static_agent_io_rows(
        raw_trace_io,
        start_time_by_trace,
        now_ns,
    ));
    rows
}

/// Strict order: unique_content -> spans -> stamp. `spans` is plain MergeTree,
/// so a retry after a successful spans insert + failed content insert would
/// duplicate every span row. Stamping runs LAST because the two key axes are
/// backed by different tables: `s2:` by `unique_content`, `tn:` by
/// `spans.*_new_message_indices` — a `tn:` key stamped before a
/// permanently-dropped spans insert made later spans ship empty
/// `*_new_message_indices`, so no span recorded the first occurrence. See
/// `docs/internal/dedup-search.md` "Ingest order".
async fn write_span_tables(
    ch: &impl ClickhouseTrait,
    config: Option<&WorkspaceDeployment>,
    shared_content: &SharedContentBatch,
    ch_spans: &[CHSpan],
    seen_marks: &SeenMarks,
    cache: &Cache,
) -> Result<(), HandlerError> {
    if !shared_content.is_empty()
        && let Err(e) = ch.insert_batch(shared_content.rows(), config).await
    {
        log::error!(
            "Failed to insert {} unique_content rows to ClickHouse: {:?}",
            shared_content.len(),
            e
        );
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to insert unique_content to Clickhouse: {:?}",
            e
        )));
    }

    if let Err(e) = ch.insert_batch(ch_spans, config).await {
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

    if !seen_marks.is_empty() {
        seen_marks.stamp(cache).await;
    }
    Ok(())
}

/// Non-LLM spans are only indexed if their size is <= 5KB. For LLM spans, only
/// the deduped "new messages" subset is indexed — older repeated history is
/// already searchable via the prior step's span. Publish failures are logged;
/// a Quickwit hiccup never fails the batch.
async fn publish_for_quickwit(
    recordable: &[&Span],
    dedup: &DedupBatches,
    pii_outcome: &PiiOutcome,
    queue: &Arc<MessageQueue>,
    indexer_stream_publisher: Option<&Arc<StreamPublisher>>,
) {
    let spans: Vec<QuickwitIndexedSpan> = recordable
        .iter()
        .enumerate()
        .filter(|(_, s)| s.is_llm_span() || s.size_bytes <= MAX_NON_LLM_SPAN_INDEX_SIZE_BYTES)
        .map(|(dedup_idx, s)| build_quickwit_span(s, dedup_idx, dedup, pii_outcome))
        .collect();
    let events: Vec<QuickwitIndexedEvent> = recordable
        .iter()
        .flat_map(|s| s.events.iter().map(|e| e.into()))
        .collect();

    if !spans.is_empty()
        && let Err(e) = publish_for_indexing(
            &IndexerQueuePayload::Spans(spans),
            queue.clone(),
            indexer_stream_publisher.cloned(),
        )
        .await
    {
        log::error!("Failed to publish spans for Quickwit indexing: {:?}", e);
    }
    if !events.is_empty()
        && let Err(e) = publish_for_indexing(
            &IndexerQueuePayload::Events(events),
            queue.clone(),
            indexer_stream_publisher.cloned(),
        )
        .await
    {
        log::error!("Failed to publish events for Quickwit indexing: {:?}", e);
    }
}

/// For LLM spans the trace-new message arrays come from the per-span
/// `span_trace_new_contents`, which cover ALL trace-new positions (storage-miss
/// AND storage-hit-but-trace-new), so cross-trace shared content is still
/// indexed for THIS trace's first-occurrence search. `span.output` is `None`
/// on the wire for dedup'd LLM spans, so output is rebuilt the same way.
/// `dual` mode: whole-value text reaches the index only with its masks spliced
/// in; trace-new messages were redacted in place.
fn build_quickwit_span(
    span: &Span,
    dedup_idx: usize,
    dedup: &DedupBatches,
    pii_outcome: &PiiOutcome,
) -> QuickwitIndexedSpan {
    let new_input_messages = trace_new_messages(&dedup.input, dedup_idx, span.is_llm_span());
    let new_output_messages = trace_new_messages(&dedup.output, dedup_idx, span.is_llm_span());
    let view = pii_outcome.index_view(dedup_idx, span);
    let mut doc = QuickwitIndexedSpan::from_span(
        &view,
        new_input_messages.as_deref(),
        new_output_messages.as_deref(),
    );
    // Fail closed: a policy-hidden span whose redaction failed has no safe
    // text, whichever source it would have come from.
    if !pii_outcome.is_indexable(dedup_idx) {
        doc.input = None;
        doc.output = None;
    }
    doc
}

/// One field's trace-new messages parsed for the indexer. `None` for non-LLM
/// spans and for fields without hashes (non-array value), so `from_span` falls
/// through to the raw field. Unparseable JSON is dropped — the row still went
/// to `unique_content` if storage-miss, it just isn't searchable.
fn trace_new_messages(
    batch: &MessageBatch,
    dedup_idx: usize,
    is_llm_span: bool,
) -> Option<Vec<Value>> {
    if !is_llm_span
        || batch
            .span_hashes
            .get(dedup_idx)
            .is_none_or(|h| h.is_empty())
    {
        return None;
    }
    batch
        .span_trace_new_contents
        .get(dedup_idx)
        .map(|contents| {
            contents
                .iter()
                .filter_map(|c| serde_json::from_str::<Value>(c).ok())
                .collect()
        })
}

async fn populate_autocomplete_caches(
    spans: &[Span],
    cache: &Arc<Cache>,
    clickhouse: &clickhouse::Client,
) {
    let project_ids: Vec<Uuid> = spans.iter().map(|s| s.project_id).unique().collect();
    for project_id in project_ids {
        let project_spans: Vec<Span> = spans
            .iter()
            .filter(|s| s.project_id == project_id)
            .cloned()
            .collect();
        populate_autocomplete_cache(
            project_id,
            &project_spans,
            cache.clone(),
            clickhouse.clone(),
        )
        .await;
    }
}

/// Bytes ingested per project, from the sizes `charge_span_sizes` settled.
async fn update_usage_limits(
    spans: &[Span],
    db: &Arc<DB>,
    clickhouse: &clickhouse::Client,
    cache: &Arc<Cache>,
    queue: &Arc<MessageQueue>,
) {
    let mut bytes_per_project: HashMap<Uuid, usize> = HashMap::new();
    for span in spans {
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

async fn dispatch_trace_realtime_updates(
    aggregations: &[TraceAggregation],
    cache: Arc<Cache>,
    pubsub: &PubSub,
) {
    if aggregations.is_empty() {
        return;
    }

    let mut project_buckets: HashMap<Uuid, Vec<RealtimeTrace>> = HashMap::new();
    let mut evaluation_buckets: HashMap<(Uuid, Uuid), Vec<RealtimeTrace>> = HashMap::new();
    let mut debugger_buckets: HashMap<(Uuid, String), Vec<RealtimeTrace>> = HashMap::new();

    for agg in aggregations {
        for channel in channels_for_aggregation(agg, cache.as_ref()).await {
            match channel {
                TraceChannel::Project => {
                    project_buckets
                        .entry(agg.project_id)
                        .or_default()
                        .push(RealtimeTrace::from_aggregation(agg));
                }
                TraceChannel::Evaluation(evaluation_id) => {
                    evaluation_buckets
                        .entry((agg.project_id, evaluation_id))
                        .or_default()
                        .push(RealtimeTrace::from_aggregation(agg));
                }
                TraceChannel::RolloutDebugger(rollout_session_id) => {
                    debugger_buckets
                        .entry((agg.project_id, rollout_session_id))
                        .or_default()
                        .push(RealtimeTrace::from_aggregation(agg));
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

/// Dispatch each trace's extracted agent_input to its realtime channels.
/// Skipped for `dual` projects: the value is PII-bearing text, pubsub cannot
/// know who is subscribed, and members of a `dual` project must only ever see
/// it through `traces_v1` under their policy. `off`/`redact` readers are all
/// unrestricted, so the stored value is safe to push (`docs/internal/rbac.md`).
async fn dispatch_input_realtime_updates(
    io: &[RawTraceIo],
    modes: &ProjectModes,
    cache: Arc<Cache>,
    pubsub: &PubSub,
) {
    for entry in io {
        if modes.get(&entry.project_id) == PiiMode::Dual {
            continue;
        }
        if let Some(value) = &entry.input {
            send_agent_input_update(
                pubsub,
                cache.as_ref(),
                &entry.project_id,
                entry.trace_id,
                value,
                entry.rollout_session_id.as_deref(),
            )
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use chrono::{TimeZone, Utc};
    use serde_json::json;

    use super::*;

    fn agg(
        project_id: Uuid,
        trace_id: Uuid,
        start: Option<chrono::DateTime<Utc>>,
    ) -> TraceAggregation {
        TraceAggregation {
            trace_id,
            project_id,
            start_time: start,
            end_time: None,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0,
            session_id: None,
            user_id: None,
            status: None,
            metadata: None,
            tags: HashSet::new(),
            num_spans: 0,
            top_span_id: None,
            top_span_name: None,
            top_span_type: 0,
            trace_type: 0,
            has_browser_session: None,
            span_names: HashSet::new(),
        }
    }

    // `start_time` is the partition key on both trace tables, so the patch /
    // agent-io writes must resolve the SAME value the span-batch write uses.
    #[test]
    fn batch_start_time_is_the_resolved_value() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let batch_start = Utc.timestamp_opt(1_700_000_500, 0).unwrap();

        let resolved = resolve_static_start_times(&[agg(project_id, trace_id, Some(batch_start))]);
        assert_eq!(
            resolved.get(&(project_id, trace_id)).copied(),
            Some(chrono_to_nanoseconds(batch_start))
        );
    }

    // A patch / io write for a trace whose spans arrived in an EARLIER flush has
    // no aggregation to read, so it resolves to nothing and the caller applies
    // its own per-table fallback.
    #[test]
    fn a_trace_with_no_spans_in_this_flush_resolves_to_nothing() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();

        let resolved = resolve_static_start_times(&[]);
        assert!(resolved.get(&(project_id, trace_id)).is_none());

        // Same when the batch carried the trace but with no span times at all.
        let resolved = resolve_static_start_times(&[agg(project_id, trace_id, None)]);
        assert!(resolved.get(&(project_id, trace_id)).is_none());
    }

    // Agent-io rows must carry the resolved trace start, never their own
    // per-write timestamp, or they'd land in a foreign partition.
    #[test]
    fn agent_io_rows_use_the_resolved_start_time() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let batch_start = Utc.timestamp_opt(1_700_000_500, 0).unwrap();
        let resolved = resolve_static_start_times(&[agg(project_id, trace_id, Some(batch_start))]);

        let rows = collect_static_agent_io_rows(
            &[RawTraceIo {
                project_id,
                trace_id,
                input: Some(json!("the task")),
                output_hashes: None,
                rollout_session_id: None,
            }],
            &resolved,
            999,
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].start_time, chrono_to_nanoseconds(batch_start));

        // With nothing resolvable, the caller's now_ns is the last resort.
        let rows = collect_static_agent_io_rows(
            &[RawTraceIo {
                project_id,
                trace_id,
                input: Some(json!("the task")),
                output_hashes: None,
                rollout_session_id: None,
            }],
            &HashMap::new(),
            999,
        );
        assert_eq!(rows[0].start_time, 999);
    }

    // The stored column is the task TEXT. `Value::to_string()` here wrapped
    // every task in literal quotes and escaped its newlines, and every reader
    // renders the column verbatim, so the encoding reached the UI.
    #[test]
    fn agent_input_is_stored_unencoded() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let io = |input: Value| {
            collect_static_agent_io_rows(
                &[RawTraceIo {
                    project_id,
                    trace_id,
                    input: Some(input),
                    output_hashes: None,
                    rollout_session_id: None,
                }],
                &HashMap::new(),
                0,
            )
        };

        assert_eq!(
            io(json!("fix the test")).remove(0).input.unwrap(),
            "fix the test"
        );
        // Multi-line and embedded quotes survive as themselves, not as `\n` /
        // `\"` escape sequences.
        let multiline = "summarize:\n\n\"the report\"";
        assert_eq!(io(json!(multiline)).remove(0).input.unwrap(), multiline);
        // A non-string has no text form, so it still serializes as JSON.
        assert_eq!(
            io(json!({ "role": "user" })).remove(0).input.unwrap(),
            r#"{"role":"user"}"#
        );
    }
}
