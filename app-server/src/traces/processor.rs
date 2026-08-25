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
        deduped_content::CHDedupedContent,
        spans::CHSpan,
        traces::TraceAggregation,
        traces_agg::{CHTraceAgg, PATCH_START_TIME_OFFSET_NS},
        traces_static::CHTraceStatic,
        utils::chrono_to_nanoseconds,
    },
    db::{DB, debugger_session_blocks, spans::Span, workspaces::WorkspaceDeployment},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, stream::StreamPublisher},
    pii_redactor::{PiiRedactorClient, redact_spans_in_place},
    pubsub::PubSub,
    quickwit::{
        IndexerQueuePayload, QuickwitIndexedEvent, QuickwitIndexedSpan,
        producer::publish_for_indexing,
    },
    traces::{
        input_dedup::{DedupBatch, MessageDedup, build_dedup_batch, mark_seen},
        metadata::TraceMetadataPatch,
        provider::convert_span_to_provider_format,
        realtime::{
            RealtimeTrace, TraceChannel, channels_for_aggregation, send_agent_input_update,
            send_span_updates, send_trace_updates,
        },
        span_attributes::{SPAN_TRACE_INPUT, SPAN_TRACE_OUTPUT_HASHES},
        spans::SpanUsage,
        tool_dedup::{ToolDedup, resolve_tool_dedup},
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
///   - recordable + dedup'd (hashes > 0): 32B/hash + newly-inserted
///     `shared_content` bytes (first referrer in batch pays the content).
///   - non-recordable + producer stripped the field to `None`: bill from the
///     wire dedup — 32B/hash + every trace-new content. Over-bills the
///     trace-new-but-storage-hit subset (content already in `shared_content`
///     from another trace) by its JSON size; acceptable, bounded by the trace's
///     unique-message tail, and the only post-dedup analogue available without
///     re-running `build_dedup_batch` for these spans.
///   - everyone else (populated, non-array, or genuinely empty field): raw JSON
///     size.
fn field_bytes(
    dedup_idx: Option<usize>,
    wire_dedup: Option<&MessageDedup>,
    batch: &DedupBatch,
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
        d.hashes.len() * 32 + d.trace_new_contents.iter().map(|s| s.len()).sum::<usize>()
    } else {
        raw.as_ref().map_or(0, crate::utils::estimate_json_size)
    }
}

/// Billed bytes for a span's tool definitions: 32B for the hash plus any
/// newly-inserted `shared_content` (first referrer in batch pays the content).
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
/// `deduped_content`. Both land in `traces_static`'s own io columns.
struct RawTraceIo {
    project_id: Uuid,
    trace_id: Uuid,
    input: Option<Value>,
    output_hashes: Option<Vec<[u8; 32]>>,
    /// Stamped by the extraction façade; routes the agent_input event to the
    /// debugger channel.
    rollout_session_id: Option<String>,
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

    // Split metadata-only virtual spans out before the regular pipeline. They
    // don't contribute span / token / time stats and aren't recorded to
    // ClickHouse. Two flavours share the marker:
    //   - genuine metadata patches (POST /v1/traces/metadata);
    //   - extracted trace io (LAM-1953): the RAW value on `SPAN_TRACE_INPUT`
    //     (input) / hex-encoded hashes on `SPAN_TRACE_OUTPUT_HASHES` (output),
    //     routed to `traces_static`'s own io columns.
    let mut raw_trace_io: Vec<RawTraceIo> = Vec::new();
    // Genuine customer metadata patches (`POST /v1/traces/metadata`) only —
    // extracted io never joins this vec: `traces_static.metadata` is one
    // whole-object column with SET semantics, so a synthetic delta would REPLACE
    // the customer's keys rather than sit beside them. Io has its own columns.
    let mut metadata_patches: Vec<TraceMetadataPatch> = Vec::new();
    for m in messages
        .iter()
        .filter(|m| m.span.attributes.is_metadata_only())
    {
        let attrs = &m.span.attributes.raw_attributes;
        let input = attrs.get(SPAN_TRACE_INPUT).cloned();
        let output_hashes = attrs.get(SPAN_TRACE_OUTPUT_HASHES).and_then(|v| {
            v.as_array().and_then(|arr| {
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
                        m.span.span_id,
                    );
                }
                (!decoded.is_empty()).then_some(decoded)
            })
        });
        if input.is_some() || output_hashes.is_some() {
            let rollout_session_id = m.span.attributes.metadata().and_then(|meta| {
                meta.get(ROLLOUT_SESSION_METADATA_KEY)?
                    .as_str()
                    .map(String::from)
            });
            raw_trace_io.push(RawTraceIo {
                project_id: m.span.project_id,
                trace_id: m.span.trace_id,
                input,
                output_hashes,
                rollout_session_id,
            });
            continue;
        }
        let Some(metadata) = m.span.attributes.metadata() else {
            log::warn!(
                "metadata-only span {} (trace {}) has no metadata attributes; patch dropped",
                m.span.span_id,
                m.span.trace_id
            );
            continue;
        };
        match serde_json::to_value(&metadata) {
            Ok(metadata_value) => metadata_patches.push(TraceMetadataPatch {
                trace_id: m.span.trace_id,
                project_id: m.span.project_id,
                metadata: metadata_value,
            }),
            Err(e) => log::warn!(
                "metadata-only span {} (trace {}): failed to serialize metadata; patch dropped: {:?}",
                m.span.span_id,
                m.span.trace_id,
                e
            ),
        }
    }
    messages.retain(|m| !m.span.attributes.is_metadata_only());

    // Live agent_input — the stat delta can't carry it (extraction is async).
    dispatch_input_realtime_updates(&raw_trace_io, cache.clone(), &pubsub).await;

    // Enrich spans with usage info
    let mut span_usage_vec = Vec::with_capacity(messages.len());

    for m in &mut messages {
        // Only LLM spans get token/cost usage. A non-LLM span may still carry stray
        // `gen_ai.usage.*` attributes (some auto-instrumentations set them on Default/Tool
        // spans); counting those would inflate the per-span columns and trace totals (LAM-1873).
        let span_usage = if m.span.is_llm_span() {
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

        prepare_span_for_recording(&mut m.span, &span_usage);
        if !m.pre_processed {
            convert_span_to_provider_format(&mut m.span);
        }
        // `estimate_size_bytes_no_payload` is deferred until AFTER PII redaction
        // (post-dedup loop below) so the recorded size reflects the
        // redacted output.

        span_usage_vec.push(span_usage);
    }

    // Split into parallel `Vec`s — downstream code reads `spans`, `dedups`
    // (input messages), `output_dedups`, and `tool_dedups` as separate slices
    // keyed by index. All three dedup paths share the project-scoped
    // `shared_content` table.
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
    // output, and tool dedups all share the project-scoped `shared_content`
    // table. The `seen_storage_in_batch` HashSet collapses
    // `(project_id, hash)` across all three paths so a hash that appears as
    // input in span A, output in span B, and as part of a tool definition
    // in span C emits exactly one `shared_content` row.
    let recordable_indices: Vec<usize> = spans
        .iter()
        .enumerate()
        .filter(|(_, s)| s.should_record_to_clickhouse())
        .map(|(i, _)| i)
        .collect();
    let (mut shared_content, mut input_batch, mut output_batch, tool_content_bytes_per_recordable) = {
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

        let mut shared_content: Vec<CHDedupedContent> = Vec::new();
        let mut seen_storage_in_batch: std::collections::HashSet<(Uuid, [u8; 32])> =
            std::collections::HashSet::new();

        let input_batch = build_dedup_batch(
            &dedup_spans,
            &recordable_input_dedups,
            &mut seen_storage_in_batch,
            &mut shared_content,
        );
        let output_batch = build_dedup_batch(
            &dedup_spans,
            &recordable_output_dedups,
            &mut seen_storage_in_batch,
            &mut shared_content,
        );

        let mut tool_content_bytes: Vec<usize> = vec![0; recordable_indices.len()];
        for (dedup_idx, span) in dedup_spans.iter().enumerate() {
            if let Some(td) = recordable_tool_dedups[dedup_idx].as_ref() {
                tool_content_bytes[dedup_idx] =
                    resolve_tool_dedup(span, td, &mut seen_storage_in_batch, &mut shared_content);
            }
        }

        (
            shared_content,
            input_batch,
            output_batch,
            tool_content_bytes,
        )
    };

    // Project-level PII redaction. Triggered by `projects.settings.removePii`
    // (cached on `ProjectWithWorkspaceBillingInfo`). Runs AFTER dedup so
    // the redacted bytes flow into both the `shared_content` CH insert and
    // Quickwit indexing; runs BEFORE the `shared_content` CH insert /
    // Quickwit indexing so every storage tier holds the redacted content.
    // Already-seen-in-trace messages were redacted on first emit and ride
    // the wire as hashes only. Tool-definition blobs share the
    // `shared_content` buffer; the redactor walks every `shared_content`
    // row of opted-in projects (so tool defs ARE redacted along with
    // messages — acceptable, the redactor is no-op on schemas) plus the
    // per-span Quickwit content. Best-effort: failures are logged inside
    // `redact_spans_in_place` and do not fail the batch.
    if let Some(redactor) = pii_redactor.as_ref() {
        redact_spans_in_place(
            redactor,
            &mut spans,
            &mut shared_content,
            &mut input_batch.span_trace_new_contents,
            &mut output_batch.span_trace_new_contents,
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
        span.estimate_size_bytes_no_payload();
    }

    // Charge each span for its input + output + tool definitions. Dedup'd
    // fields pay 32B per hash + any newly-inserted `messages.content`
    // (shared content billed once to the first referrer in the batch);
    // non-dedup'd or empty fields pay for the raw JSON. `estimate_size_bytes_no_payload`
    // intentionally excludes input AND output so this loop owns 100% of
    // their accounting.
    let mut dedup_lookup: HashMap<usize, usize> = HashMap::with_capacity(recordable_indices.len());
    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        dedup_lookup.insert(span_idx, dedup_idx);
    }

    for (span_idx, span) in spans.iter_mut().enumerate() {
        let dedup_idx = dedup_lookup.get(&span_idx).copied();
        let mut added: usize = 0;

        added += field_bytes(
            dedup_idx,
            input_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &input_batch,
            &span.input,
        );
        added += field_bytes(
            dedup_idx,
            output_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &output_batch,
            &span.output,
        );
        added += tool_bytes(
            dedup_idx,
            tool_dedups.get(span_idx).and_then(|d| d.as_ref()),
            &tool_content_bytes_per_recordable,
        );

        span.increment_size_bytes(added);
    }

    // Build CHSpans with embedded events to insert to ClickHouse
    let ch_spans: Vec<CHSpan> = {
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
                    ch_span.tool_definitions_hash = td.hash;
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
        let now_ns = chrono_to_nanoseconds(chrono::Utc::now());

        if !trace_aggregations.is_empty() {
            debugger_session_blocks::upsert_blocks_for_traces(&db.pool, &trace_aggregations).await;
            dispatch_trace_realtime_updates(&trace_aggregations, cache.clone(), &pubsub).await;
        }

        // `start_time` is the partition key on both tables, so writes that
        // carry no span times of their own (metadata patches, extracted agent
        // io) resolve it from this batch's aggregation — otherwise they'd land
        // in a different partition than the span-batch writes for the same
        // trace. `resolve_static_start_times` returns nothing for a trace whose
        // spans arrived in an earlier flush; those fall back per table (see
        // `PATCH_START_TIME_OFFSET_NS` for the `min`-safe agg fallback).
        let start_time_by_trace = resolve_static_start_times(&trace_aggregations);

        // Aggregate partials come from the in-memory per-batch deltas — never a
        // cumulative row, which would double-count every `sum` column on each
        // batch. Metadata patches contribute an identity partial carrying only
        // the patched metadata map.
        let mut traces_agg_rows: Vec<CHTraceAgg> =
            Vec::with_capacity(trace_aggregations.len() + metadata_patches.len());
        traces_agg_rows.extend(
            trace_aggregations
                .iter()
                .map(|agg| CHTraceAgg::from_aggregation(agg, now_ns)),
        );
        traces_agg_rows.extend(metadata_patches.iter().map(|patch| {
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
        if !traces_agg_rows.is_empty()
            && let Err(e) = ch.insert_batch(&traces_agg_rows, config).await
        {
            log::error!(
                "Failed to insert {} trace aggregation partials to ClickHouse: {:?}",
                traces_agg_rows.len(),
                e
            );
        }

        // Set-once columns go to `traces_static` (CoalescingMergeTree): each
        // column resolves independently, so a write only touches what it
        // carries and a batch that learned nothing static produces no row.
        // Metadata patches carry ONLY the patched object — SET, not patch,
        // semantics (see `ch::traces_static`).
        let mut traces_static_rows: Vec<CHTraceStatic> = Vec::new();
        traces_static_rows.extend(
            trace_aggregations
                .iter()
                .filter_map(|agg| CHTraceStatic::from_aggregation(agg, now_ns)),
        );
        traces_static_rows.extend(metadata_patches.iter().filter_map(|patch| {
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
        traces_static_rows.extend(collect_static_agent_io_rows(
            &raw_trace_io,
            &start_time_by_trace,
            now_ns,
        ));
        if !traces_static_rows.is_empty()
            && let Err(e) = ch.insert_batch(&traces_static_rows, config).await
        {
            log::error!(
                "Failed to insert {} traces_static rows to ClickHouse: {:?}",
                traces_static_rows.len(),
                e
            );
        }
    };

    // Trace-new keys for search "first occurrence per trace" semantic.
    // Project-scoped storage keys for content presence. Both must be stamped
    // on the consumer ONLY after a successful `shared_content` insert.
    let storage_keys: Vec<(Uuid, [u8; 32])> = shared_content
        .iter()
        .map(|m| (m.project_id, m.content_hash))
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
        // Strict order: shared_content -> spans -> mark_seen. `spans` is plain
        // MergeTree, so a retry after a successful spans insert + failed
        // shared_content insert would duplicate every span row. `mark_seen`
        // runs LAST because the two key axes are backed by different tables:
        // `s:` keys by `shared_content`, but `tn:` (trace-new) keys by
        // `spans.*_new_message_indices`. Stamping `tn:` before the spans insert
        // (the old order) left a window where a permanently-dropped spans
        // insert orphaned the trace-new marker — later spans in the same trace
        // saw the `tn:` key and shipped empty `*_new_message_indices`, so no
        // span recorded the first occurrence. Stamp only after BOTH backing
        // stores are durable. See CLAUDE.md "Ingest order in
        // process_span_messages".
        if !shared_content.is_empty() {
            if let Err(e) = ch.insert_batch(&shared_content, config).await {
                log::error!(
                    "Failed to insert {} shared_content rows to ClickHouse: {:?}",
                    shared_content.len(),
                    e
                );
                return Err(HandlerError::transient(anyhow::anyhow!(
                    "Failed to insert shared_content to Clickhouse: {:?}",
                    e
                )));
            }
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

        if !storage_keys.is_empty() || !trace_new_keys.is_empty() {
            mark_seen(&storage_keys, &trace_new_keys, cache.clone()).await;
        }
        Ok(())
    };

    let ((), span_result) = tokio::join!(trace_branch, span_branch);
    span_result?;

    // Must run AFTER the spans insert: triggers are decided from the in-memory
    // batch delta, but filters read the trace's cumulative state back out of
    // ClickHouse traces_agg, and the signal agent needs the span data too.
    crate::signals::check_and_push_signals(
        &trace_aggregations,
        &spans,
        db.clone(),
        cache.clone(),
        clickhouse.clone(),
        queue.clone(),
    )
    .await;

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
            // For LLM spans: parse this span's trace-new INPUT messages
            // into `Vec<Value>` for the indexer. Read directly from the
            // per-span `span_trace_new_contents` — these cover ALL
            // trace-new positions (storage-miss AND storage-hit-but-trace-
            // new), so cross-trace shared content is still indexed for
            // THIS trace's first-occurrence search. Unparseable JSON is
            // dropped (filter_map) — the row still went to
            // `shared_content` if storage-miss, it just isn't searchable.
            // A span with no hashes (non-array input) gets `None`, so
            // `from_span` falls through to raw `span.input`. Output is
            // dedup'd the same way: `span.output` is `None` on the wire for
            // dedup'd LLM spans, so the trace-new output array is rebuilt
            // from `output_batch.span_trace_new_contents` (mirrors input).
            let new_input_messages = if s.is_llm_span()
                && input_batch
                    .span_hashes
                    .get(dedup_idx)
                    .map(|h| !h.is_empty())
                    .unwrap_or(false)
            {
                input_batch
                    .span_trace_new_contents
                    .get(dedup_idx)
                    .map(|contents| {
                        contents
                            .iter()
                            .filter_map(|c| serde_json::from_str::<Value>(c).ok())
                            .collect::<Vec<Value>>()
                    })
            } else {
                None
            };
            let new_output_messages = if s.is_llm_span()
                && output_batch
                    .span_hashes
                    .get(dedup_idx)
                    .map(|h| !h.is_empty())
                    .unwrap_or(false)
            {
                output_batch
                    .span_trace_new_contents
                    .get(dedup_idx)
                    .map(|contents| {
                        contents
                            .iter()
                            .filter_map(|c| serde_json::from_str::<Value>(c).ok())
                            .collect::<Vec<Value>>()
                    })
            } else {
                None
            };
            QuickwitIndexedSpan::from_span(
                s,
                new_input_messages.as_deref(),
                new_output_messages.as_deref(),
            )
        })
        .collect();
    let quickwit_events: Vec<QuickwitIndexedEvent> = recordable_refs
        .iter()
        .flat_map(|s| s.events.iter().map(|e| e.into()))
        .collect();

    if !quickwit_spans.is_empty() {
        if let Err(e) = publish_for_indexing(
            &IndexerQueuePayload::Spans(quickwit_spans),
            queue.clone(),
            indexer_stream_publisher.clone(),
        )
        .await
        {
            log::error!("Failed to publish spans for Quickwit indexing: {:?}", e);
        }
    }
    if !quickwit_events.is_empty() {
        if let Err(e) = publish_for_indexing(
            &IndexerQueuePayload::Events(quickwit_events),
            queue.clone(),
            indexer_stream_publisher.clone(),
        )
        .await
        {
            log::error!("Failed to publish events for Quickwit indexing: {:?}", e);
        }
    }

    // Emit checkpoints for conversation-start LLM spans. Best-effort: the
    // system prompt is trace-new for these spans, so it's available in
    // `input_batch.span_trace_new_contents` even when storage-deduped.
    if is_feature_enabled(Feature::Checkpoints) {
        crate::checkpoints::producer::publish_checkpoints_for_batch(
            &spans,
            &recordable_indices,
            &input_batch,
            &tool_dedups,
            queue.clone(),
        )
        .await;
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
async fn dispatch_input_realtime_updates(io: &[RawTraceIo], cache: Arc<Cache>, pubsub: &PubSub) {
    for entry in io {
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
