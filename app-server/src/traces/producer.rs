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
    input_dedup::{LlmInputDedup, build_dedup},
    provider::convert_span_to_provider_format,
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

/// Run the producer-side preprocessing pipeline that the consumer would
/// otherwise run in-process:
///
///   1. parse + enrich attributes (input/output extraction from OTel attrs)
///   2. provider conversion (LangChain rewrites `input`)
///   3. prompt-hash extraction (system message → `lmnr.span.prompt_hash`)
///   4. structural input dedup verdict vs Redis
///
/// On success, replaces `span.input` with `None` whenever a dedup is produced
/// — the verdict carries everything the consumer needs (full hash list, new
/// indices, new contents). For non-LLM spans / non-array inputs `input` is
/// untouched.
async fn preprocess_for_queue(span: &mut Span, cache: Arc<Cache>) -> Option<LlmInputDedup> {
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

    let dedup = build_dedup(span, cache).await;
    if dedup.is_some() && span.parent_span_id.is_some() && !is_top_span(span, &span.attributes) {
        // The dedup is the source of truth from here on; the consumer rebuilds
        // any per-message Value it needs (Quickwit indexing) from
        // `dedup.new_contents`. Dropping `input` is the wire savings.
        //
        // Carve-outs both protect `TraceAggregation::from_spans`'s
        // `root_span_input` preview:
        //   - `parent_span_id.is_none()` — natural OTel root.
        //   - `is_top_span(...)` — Laminar SDK top span that has an OTel
        //     parent now, but `prepare_span_for_recording` will null
        //     `parent_span_id` on the consumer. If we stripped here,
        //     the trace's `root_span_input` would silently disappear.
        // Root spans are 1 per trace; dedup savings come from the long
        // tail of nested LLM spans either way.
        span.input = None;
    }
    dedup
}

/// Publish pre-built span messages to the appropriate queue based on workspace deployment mode.
///
/// Returns the number of rejected spans (0 on success).
#[instrument(skip(messages, queue, db, cache))]
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
        let dedup = preprocess_for_queue(&mut msg.span, cache.clone()).await;
        msg.pre_processed = true;
        msg.input_dedup = dedup;
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
