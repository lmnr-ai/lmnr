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
    message_dedup::{MessageDedup, MessageField, build_message_dedup},
    provider::convert_span_to_provider_format,
    tool_dedup::{ToolDedup, build_tool_dedup},
    utils::is_top_span,
};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
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

/// Producer's per-span dedup verdicts. Each is `None` when the span isn't
/// an LLM span, the field isn't present, or the field isn't a non-empty
/// JSON array.
struct DedupVerdicts {
    input: Option<MessageDedup>,
    output: Option<MessageDedup>,
    tools: Option<ToolDedup>,
}

/// Run the producer-side preprocessing pipeline that the consumer would
/// otherwise run in-process:
///
///   1. parse + enrich attributes (input/output extraction from OTel attrs)
///   2. provider conversion (LangChain rewrites `input`)
///   3. prompt-hash extraction (system message → `lmnr.span.prompt_hash`)
///   4. project-scoped dedup verdicts: input messages, output messages,
///      tool definitions (LAM-1634)
///
/// On success, replaces `span.input` / `span.output` with `None` whenever a
/// dedup verdict was produced — the verdict carries the full hash list, the
/// storage-miss content, and the trace-new positions for search. Root spans
/// keep their `input` / `output` populated so `TraceAggregation::from_spans`
/// can build the trace-list preview.
async fn preprocess_for_queue(span: &mut Span, cache: Arc<Cache>) -> DedupVerdicts {
    span.parse_and_enrich_attributes();
    convert_span_to_provider_format(span);

    if span.is_llm_span() {
        if let Some((system_text, _)) = span.input.as_ref().and_then(|v| extract_system_message(v))
        {
            span.attributes.raw_attributes.insert(
                SPAN_PROMPT_HASH.to_string(),
                serde_json::Value::String(structural_skeleton_hash(&system_text)),
            );
        }
    }

    // Tool dedup runs first so its source attributes are stripped before
    // anything else looks at `raw_attributes`.
    let tools = build_tool_dedup(span, cache.clone()).await;
    let input = build_message_dedup(span, MessageField::Input, cache.clone()).await;
    let output = build_message_dedup(span, MessageField::Output, cache).await;

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
    for msg in &mut messages {
        if msg.pre_processed {
            continue;
        }
        let verdicts = preprocess_for_queue(&mut msg.span, cache.clone()).await;
        msg.pre_processed = true;
        msg.input_dedup = verdicts.input;
        msg.output_dedup = verdicts.output;
        msg.tool_dedup = verdicts.tools;
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
