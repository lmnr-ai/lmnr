//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.
//!
//! Producer-side preprocessing (LAM-1608): we parse + enrich attributes,
//! run provider conversion, compute the prompt hash, settle the span's dedup
//! group (session, else trace — see `dedup::session`), and consult Redis to
//! drop already-seen LLM input messages BEFORE the message hits Rabbit.
//! Already-seen messages ride the wire as 32-byte hashes only, so the queue
//! payload shrinks proportionally with conversation history depth. The
//! consumer trusts the producer's dedup verdict and never re-hashes.

use std::sync::Arc;

use anyhow::Result;
use tracing::instrument;
use uuid::Uuid;

use super::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, SPANS_DATA_PLANE_EXCHANGE,
    SPANS_DATA_PLANE_ROUTING_KEY,
    dedup::{
        BatchSeen,
        messages::{MessageDedup, build_message_dedup},
        session::resolve_session,
        tools::{ToolDedup, build_tool_dedup},
    },
    provider::convert_span_to_provider_format,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    data_plane::get_workspace_deployment,
    db::{DB, spans::Span, workspaces::DeploymentMode},
    mq::{MessageQueue, MessageQueueTrait, stream::StreamPublisher, utils::mq_max_payload},
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::{
        ExportTracePartialSuccess, ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
    traces::{
        input_extraction::{OutputCandidate, UserTaskCandidate},
        prompt_hash::{extract_system_message, prompt_hashes},
        sp_versioning::{
            producer::{StaticPromptCandidate, publish_static_prompt_candidates},
            similarity as sp_similarity,
        },
        span_attributes::{SPAN_AGENT_HASH, SPAN_PROMPT_HASH},
    },
};

/// System prompt of an LLM span with its hashes: the skeleton (naive
/// signature), the first-sentence agent identity, and the byte-identity hash
/// (memo key for classification).
struct SystemPromptVerdict {
    skeleton_hash: String,
    agent_hash: String,
    full_prompt_hash: String,
    text: String,
}

/// Producer's per-span dedup verdicts. Each is `None` when the span isn't
/// an LLM span, the field isn't present, or the field isn't a non-empty
/// JSON array.
struct DedupVerdicts {
    input: Option<MessageDedup>,
    output: Option<MessageDedup>,
    tools: Option<ToolDedup>,
    /// Present when the span carries a system message — feeds static-part
    /// regex extraction (LAM-1899).
    system_prompt: Option<SystemPromptVerdict>,
    user_task: Option<UserTaskCandidate>,
    output_candidate: Option<OutputCandidate>,
}

/// Run the producer-side preprocessing pipeline that the consumer would
/// otherwise run in-process:
///
///   1. parse + enrich attributes (input/output extraction from OTel attrs)
///   2. provider conversion (LangChain rewrites `input`)
///   3. prompt-hash extraction (system message → `lmnr.span.prompt_hash`)
///   4. session resolution — publishes or adopts the trace→session hint so
///      the span's dedup group is settled before any verdict is built
///   5. group-scoped dedup verdicts: input messages, output messages,
///      and tool definitions
///
/// On success, replaces `span.input` / `span.output` with `None` whenever a
/// dedup verdict was produced — the verdict carries the full hash list, the
/// storage-miss content, and the trace-new positions for search.
async fn preprocess_for_queue(
    span: &mut Span,
    cache: &Cache,
    batch_seen: &mut BatchSeen,
) -> DedupVerdicts {
    span.parse_and_enrich_attributes();
    convert_span_to_provider_format(span);

    let mut system_prompt = None;
    if span.is_llm_span() {
        if let Some((system_text, _)) = span.input.as_ref().and_then(|v| extract_system_message(v))
        {
            let hashes = prompt_hashes(&system_text);
            span.attributes.raw_attributes.insert(
                SPAN_PROMPT_HASH.to_string(),
                serde_json::Value::String(hashes.skeleton.clone()),
            );
            span.attributes.raw_attributes.insert(
                SPAN_AGENT_HASH.to_string(),
                serde_json::Value::String(hashes.first_sentence.clone()),
            );
            system_prompt = Some(SystemPromptVerdict {
                skeleton_hash: hashes.skeleton,
                agent_hash: hashes.first_sentence,
                full_prompt_hash: sp_similarity::full_prompt_hash(&system_text),
                text: system_text,
            });
        }
    }

    // Capture the user-task candidate while `span.input` is still
    // populated (the dedup strip below may null it). It keys on the
    // first-sentence hash, not the skeleton, so permutations of the system
    // prompt's XML scaffolding don't re-trigger regex generation.
    let user_task = crate::traces::input_extraction::capture_user_task_candidate(
        span,
        system_prompt.as_ref().map(|sp| sp.agent_hash.as_str()),
    );

    // Session first: every verdict below keys storage by the span's group.
    resolve_session(span, cache).await;
    // Tool dedup runs next so its source attributes are stripped before
    // anything else looks at `raw_attributes`.
    let tools = build_tool_dedup(span, cache, batch_seen).await;
    let input = build_message_dedup(span, span.input.as_ref(), cache, batch_seen).await;
    let output = build_message_dedup(span, span.output.as_ref(), cache, batch_seen).await;

    // Output-candidate capture runs AFTER the output dedup verdict exists —
    // it needs the per-message hashes (`output.hashes`), not the raw
    // `span.output` value (LAM-1953 rework: output is stored as hashes into
    // `deduped_content`, not a rendered string).
    let output_candidate = crate::traces::input_extraction::capture_output_candidate(
        output.as_ref(),
        span.end_time.timestamp_nanos_opt().unwrap_or(i64::MAX),
    );

    if input.is_some() {
        span.input = None;
    }
    if output.is_some() {
        span.output = None;
    }

    DedupVerdicts {
        input,
        output,
        tools,
        system_prompt,
        user_task,
        output_candidate,
    }
}

/// Spans of the batch carrying input/output-extraction candidates; those
/// passes run after publish.
struct ExtractionCandidate {
    span_idx: usize,
    user_task: Option<UserTaskCandidate>,
    output: Option<OutputCandidate>,
}

/// One MQ message under construction. `push` preprocesses each span as it
/// arrives, so a caller generating spans lazily holds only the stripped
/// wire form of earlier spans, never their full input/output.
pub struct SpanMessageBatch {
    project_id: Uuid,
    messages: Vec<RabbitMqSpanMessage>,
    static_prompt_candidates: Vec<StaticPromptCandidate>,
    extraction_candidates: Vec<ExtractionCandidate>,
    batch_seen: BatchSeen,
}

impl SpanMessageBatch {
    /// Dedup against Redis only — safe for any mix of spans.
    pub fn new(project_id: Uuid) -> Self {
        Self::with_batch_seen(project_id, BatchSeen::per_span())
    }

    /// Dedup also against earlier spans of this batch. Only for batches whose
    /// every span is recorded to ClickHouse — see [`BatchSeen`].
    pub fn across_spans(project_id: Uuid) -> Self {
        Self::with_batch_seen(project_id, BatchSeen::across_spans())
    }

    fn with_batch_seen(project_id: Uuid, batch_seen: BatchSeen) -> Self {
        Self {
            project_id,
            messages: Vec::new(),
            static_prompt_candidates: Vec::new(),
            extraction_candidates: Vec::new(),
            batch_seen,
        }
    }

    /// Sequential per span rather than parallel: each Redis check is cheap
    /// and we don't want a thundering herd on large batches.
    pub async fn push(&mut self, mut msg: RabbitMqSpanMessage, cache: &Cache) {
        if !msg.pre_processed {
            // A span the consumer drops must neither claim content for its
            // siblings nor ride theirs hash-only.
            let mut unrecorded_seen = BatchSeen::per_span();
            let batch_seen = if msg.span.should_record_to_clickhouse() {
                &mut self.batch_seen
            } else {
                &mut unrecorded_seen
            };
            let verdicts = preprocess_for_queue(&mut msg.span, cache, batch_seen).await;
            msg.pre_processed = true;
            msg.input_dedup = verdicts.input;
            msg.output_dedup = verdicts.output;
            msg.tool_dedup = verdicts.tools;
            if let Some(verdict) = verdicts.system_prompt {
                self.static_prompt_candidates.push(StaticPromptCandidate {
                    project_id: self.project_id,
                    trace_id: msg.span.trace_id,
                    span_id: msg.span.span_id,
                    prompt_hash: verdict.skeleton_hash,
                    agent_hash: verdict.agent_hash,
                    full_prompt_hash: verdict.full_prompt_hash,
                    system_prompt: verdict.text,
                });
            }
            if verdicts.user_task.is_some() || verdicts.output_candidate.is_some() {
                self.extraction_candidates.push(ExtractionCandidate {
                    span_idx: self.messages.len(),
                    user_task: verdicts.user_task,
                    output: verdicts.output_candidate,
                });
            }
        }
        self.messages.push(msg);
    }

    /// Publish to the appropriate queue based on workspace deployment mode.
    ///
    /// Returns the number of rejected spans (0 on success).
    #[instrument(
        skip_all,
        fields(project_id = %self.project_id, batch_size = self.messages.len())
    )]
    pub async fn publish(
        self,
        queue: Arc<MessageQueue>,
        db: Arc<DB>,
        cache: Arc<Cache>,
        spans_stream_publisher: Option<Arc<StreamPublisher>>,
    ) -> Result<usize> {
        let Self {
            project_id,
            mut messages,
            static_prompt_candidates,
            extraction_candidates,
            batch_seen: _,
        } = self;
        let span_count = messages.len();
        let mq_message = serde_json::to_vec(&messages).unwrap();

        if mq_message.len() >= mq_max_payload() {
            log::warn!(
                "[SPANS] MQ payload limit exceeded. Project ID: [{}], payload size: [{}]. Span count: [{}]",
                project_id,
                mq_message.len(),
                span_count
            );
            return Ok(span_count);
        }

        let workspace_deployment = get_workspace_deployment(&db.pool, cache.clone(), project_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get workspace deployment: {:?}", e))?;

        match workspace_deployment.mode {
            DeploymentMode::CLOUD => {
                // Streams when configured, else the quorum queue. Routing key is the
                // FIRST span's trace_id: a batch from one export call is
                // overwhelmingly single-trace, and keeping the whole batch on one
                // partition preserves the single-writer property for the PG trace
                // upsert. Splitting per-trace would multiply small records for no
                // gain.
                let stream_published = match spans_stream_publisher.as_ref() {
                    Some(publisher) => {
                        let key = messages
                            .first()
                            .map(|m| m.span.trace_id.to_string())
                            .unwrap_or_default();
                        match publisher.publish(&mq_message, &key).await {
                            Ok(()) => true,
                            Err(e) => {
                                // Fall back rather than drop: the queue path is still
                                // running during the transition.
                                log::error!(
                                    "[SPANS] Stream publish failed, falling back to queue: {:?}",
                                    e
                                );
                                false
                            }
                        }
                    }
                    None => false,
                };

                if !stream_published {
                    queue
                        .publish(
                            &mq_message,
                            OBSERVATIONS_EXCHANGE,
                            OBSERVATIONS_ROUTING_KEY,
                            None,
                        )
                        .await?;
                }
            }
            DeploymentMode::HYBRID => {
                queue
                    .publish(
                        &mq_message,
                        SPANS_DATA_PLANE_EXCHANGE,
                        SPANS_DATA_PLANE_ROUTING_KEY,
                        None,
                    )
                    .await?;
            }
        }

        // Static-prompt extraction candidates ride a separate queue and are
        // best-effort — only after the span publish succeeded, so a rejected
        // batch doesn't feed the accumulator with spans that were never stored.
        publish_static_prompt_candidates(static_prompt_candidates, cache.clone(), queue.clone())
            .await;

        // Runs after the batch is on the wire so attribute mutation inside the
        // hook can't affect the published payload. Never fails ingestion.
        let contexts = extraction_candidates
            .into_iter()
            .filter_map(|candidate| {
                let msg = messages.get_mut(candidate.span_idx)?;
                Some(crate::traces::input_extraction::UserTaskSpanContext {
                    trace_id: msg.span.trace_id,
                    span_id: msg.span.span_id,
                    span_name: msg.span.name.clone(),
                    start_time_ns: msg
                        .span
                        .start_time
                        .timestamp_nanos_opt()
                        .unwrap_or(i64::MAX),
                    attributes: std::mem::take(&mut msg.span.attributes),
                    candidate: candidate.user_task,
                    output_candidate: candidate.output,
                })
            })
            .collect();
        crate::traces::input_extraction::process_user_task_candidates(
            contexts,
            project_id,
            queue,
            db,
            cache,
            spans_stream_publisher,
        )
        .await;

        Ok(0)
    }
}

/// Publish pre-built span messages with per-span dedup. Returns the number of
/// rejected spans (0 on success).
pub async fn publish_span_messages(
    messages: Vec<RabbitMqSpanMessage>,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    spans_stream_publisher: Option<Arc<StreamPublisher>>,
) -> Result<usize> {
    let mut batch = SpanMessageBatch::new(project_id);
    for msg in messages {
        batch.push(msg, &cache).await;
    }
    batch
        .publish(queue, db, cache, spans_stream_publisher)
        .await
}

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    spans_stream_publisher: Option<Arc<StreamPublisher>>,
) -> Result<ExportTraceServiceResponse> {
    let messages = request
        .resource_spans
        .into_iter()
        .flat_map(|resource_span| {
            resource_span
                .scope_spans
                .into_iter()
                .flat_map(|scope_span| {
                    scope_span.spans.into_iter().filter_map(|otel_span| {
                        let span = Span::from_otel_span(otel_span, project_id);

                        if span.should_save() {
                            Some(RabbitMqSpanMessage {
                                span,
                                pre_processed: false,
                                input_dedup: None,
                                output_dedup: None,
                                tool_dedup: None,
                            })
                        } else {
                            None
                        }
                    })
                })
        })
        .collect::<Vec<_>>();

    let span_count = messages.len();
    let rejected = publish_span_messages(
        messages,
        project_id,
        queue,
        db,
        cache,
        spans_stream_publisher,
    )
    .await?;

    if rejected > 0 {
        return Ok(ExportTraceServiceResponse {
            partial_success: Some(ExportTracePartialSuccess {
                rejected_spans: span_count as i64,
                error_message: format!(
                    "Payload size exceeds limit. All {} spans rejected.",
                    span_count
                ),
            }),
        });
    }

    Ok(ExportTraceServiceResponse {
        partial_success: None,
    })
}
