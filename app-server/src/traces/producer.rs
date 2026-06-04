//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.
//!
//! Producer-side preprocessing (LAM-1608): we parse + enrich attributes,
//! run provider conversion, compute the prompt hash, and consult Redis to
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
    input_dedup::{MessageDedup, build_message_dedup},
    provider::convert_span_to_provider_format,
    tool_dedup::{ToolDedup, build_tool_dedup},
    utils::is_top_span,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    checkpoints::{
        CHECKPOINTS_EXCHANGE, CHECKPOINTS_ROUTING_KEY, consumer::CheckpointsQueueMessage,
    },
    data_plane::get_workspace_deployment,
    db::{DB, spans::Span, workspaces::DeploymentMode},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    opentelemetry_proto::opentelemetry::proto::collector::trace::v1::{
        ExportTracePartialSuccess, ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
    traces::{
        prompt_hash::{extract_system_message, structural_skeleton_hash},
        span_attributes::SPAN_PROMPT_HASH,
    },
};

/// Number of input messages a span must carry to qualify as a checkpoint:
/// a system prompt + the first turn.
const CHECKPOINT_INPUT_MESSAGE_COUNT: usize = 2;

/// Upper bound on the best-effort checkpoint publish so a slow/blocked broker
/// can't stall span ingestion.
const CHECKPOINT_PUBLISH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// Producer's per-span dedup verdicts. Each is `None` when the span isn't
/// an LLM span, the field isn't present, or the field isn't a non-empty
/// JSON array.
struct DedupVerdicts {
    input: Option<MessageDedup>,
    output: Option<MessageDedup>,
    tools: Option<ToolDedup>,
    /// Set only for LLM spans whose input is an array of exactly
    /// [`CHECKPOINT_INPUT_MESSAGE_COUNT`] messages including a system prompt.
    checkpoint: Option<CheckpointsQueueMessage>,
}

/// Run the producer-side preprocessing pipeline that the consumer would
/// otherwise run in-process:
///
///   1. parse + enrich attributes (input/output extraction from OTel attrs)
///   2. provider conversion (LangChain rewrites `input`)
///   3. prompt-hash extraction (system message → `lmnr.span.prompt_hash`)
///   4. project-scoped dedup verdicts: input messages, output messages,
///      and tool definitions
///
/// On success, replaces `span.input` / `span.output` with `None` whenever a
/// dedup verdict was produced — the verdict carries the full hash list, the
/// storage-miss content, and the trace-new positions for search. Root spans
/// keep their `input` / `output` populated so `TraceAggregation::from_spans`
/// can build the trace-list preview.
async fn preprocess_for_queue(span: &mut Span, cache: Arc<Cache>) -> DedupVerdicts {
    span.parse_and_enrich_attributes();
    convert_span_to_provider_format(span);

    let is_llm = span.is_llm_span();

    // Captured before any input nulling below: a checkpoint needs the raw
    // system prompt, and non-root LLM spans have `input` zeroed out further
    // down.
    let mut system_prompt: Option<String> = None;
    let input_message_count = if is_llm {
        span.input
            .as_ref()
            .and_then(|v| v.as_array())
            .map(|arr| arr.len())
            .unwrap_or(0)
    } else {
        0
    };

    if is_llm {
        if let Some((system_text, _)) = span.input.as_ref().and_then(|v| extract_system_message(v))
        {
            span.attributes.raw_attributes.insert(
                SPAN_PROMPT_HASH.to_string(),
                serde_json::Value::String(structural_skeleton_hash(&system_text)),
            );
            system_prompt = Some(system_text);
        }
    }

    // Tool dedup runs first so its source attributes are stripped before
    // anything else looks at `raw_attributes`.
    let tools = build_tool_dedup(span, cache.clone()).await;
    let input = build_message_dedup(span, span.input.as_ref(), cache.clone()).await;
    let output = build_message_dedup(span, span.output.as_ref(), cache).await;

    // A checkpoint is an LLM span at the start of a conversation: exactly two
    // input messages, one of them a system prompt. Built here (before the
    // input-nulling carve-out) so the raw system prompt survives.
    let checkpoint = if is_llm && input_message_count == CHECKPOINT_INPUT_MESSAGE_COUNT {
        system_prompt.map(|system_prompt| CheckpointsQueueMessage {
            system_prompt,
            tool_definitions_hash: tools
                .as_ref()
                .map(|t| hex::encode(t.hash))
                .unwrap_or_default(),
            model: span.attributes.request_model().unwrap_or_default(),
            span_ids_path: span.attributes.ids_path().unwrap_or_default(),
        })
    } else {
        None
    };

    let keep_root_payload = span.parent_span_id.is_none() || is_top_span(span, &span.attributes);

    if input.is_some() && !keep_root_payload {
        // Keep `input` on any span that is (or will become) the trace root —
        // the consumer's `TraceAggregation::from_spans` reads it for the
        // `root_span_input` preview shown in the trace list:
        //   - `parent_span_id.is_none()` — natural OTel root.
        //   - `is_top_span(...)` — Laminar SDK top span; arrives with an OTel
        //     parent but `prepare_span_for_recording` will null it on the
        //     consumer, promoting the span to root.
        // Root spans are 1 per trace; dedup savings come from the long
        // tail of nested LLM spans either way.
        span.input = None;
    }
    if output.is_some() && !keep_root_payload {
        // Same carve-out for output: root span's `root_span_output` preview
        // is built from `span.output`.
        span.output = None;
    }

    DedupVerdicts {
        input,
        output,
        tools,
        checkpoint,
    }
}

/// Best-effort publish of checkpoint messages to the checkpoints queue.
///
/// Must be called AFTER the main span queue publish. Failures here never
/// propagate — a checkpoint is auxiliary data, so we log and move on rather
/// than failing span ingestion.
async fn publish_checkpoints(checkpoints: Vec<CheckpointsQueueMessage>, queue: Arc<MessageQueue>) {
    if checkpoints.is_empty() {
        return;
    }

    let payload = match serde_json::to_vec(&checkpoints) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[CHECKPOINTS] Failed to serialize checkpoint messages: {e:?}");
            return;
        }
    };

    if let Err(e) = queue
        .publish(
            &payload,
            CHECKPOINTS_EXCHANGE,
            CHECKPOINTS_ROUTING_KEY,
            None,
        )
        .await
    {
        log::error!("[CHECKPOINTS] Failed to publish checkpoint messages: {e:?}");
    }
}

/// Publish pre-built span messages to the appropriate queue based on workspace deployment mode.
///
/// Returns the number of rejected spans (0 on success).
#[instrument(skip(messages, queue, db, cache), fields(batch_size = messages.len()))]
pub async fn publish_span_messages(
    mut messages: Vec<RabbitMqSpanMessage>,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<usize> {
    let span_count = messages.len();

    // Producer-side preprocessing: per-span, sequential rather than parallel
    // because each Redis check is cheap and we don't want to flood Redis with
    // a thundering herd on large batches. Most ingest calls carry 1-N spans.
    let mut checkpoints: Vec<CheckpointsQueueMessage> = Vec::new();
    for msg in &mut messages {
        if msg.pre_processed {
            continue;
        }
        let verdicts = preprocess_for_queue(&mut msg.span, cache.clone()).await;
        msg.pre_processed = true;
        msg.input_dedup = verdicts.input;
        msg.output_dedup = verdicts.output;
        msg.tool_dedup = verdicts.tools;
        if let Some(checkpoint) = verdicts.checkpoint {
            checkpoints.push(checkpoint);
        }
    }

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
            queue
                .publish(
                    &mq_message,
                    OBSERVATIONS_EXCHANGE,
                    OBSERVATIONS_ROUTING_KEY,
                    None,
                )
                .await?;
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

    // Publish checkpoints only after the main span queue publish succeeded.
    // Best-effort — never fails span ingestion, and bounded by a small
    // timeout so a slow broker can't stall the ingest path.
    if tokio::time::timeout(
        CHECKPOINT_PUBLISH_TIMEOUT,
        publish_checkpoints(checkpoints, queue.clone()),
    )
    .await
    .is_err()
    {
        log::error!("[CHECKPOINTS] Publishing checkpoints timed out");
    }

    Ok(0)
}

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
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
    let rejected = publish_span_messages(messages, project_id, queue, db, cache).await?;

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
