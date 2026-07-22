//! Post-factum trace metadata patching, shared by the endpoint and internal callers.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{
        DB,
        spans::{Span, SpanType},
    },
    mq::MessageQueue,
    traces::{
        producer::publish_span_messages,
        span_attributes::{
            ASSOCIATION_PROPERTIES_PREFIX, SPAN_METADATA_ONLY, SPAN_TRACE_INPUT, SPAN_TRACE_OUTPUT,
        },
        spans::SpanAttributes,
    },
};

/// Publish a virtual metadata-only span carrying `attributes` (which must
/// already include the [`SPAN_METADATA_ONLY`] marker). The consumer routes
/// it as a trace patch: not recorded to `spans`, no stats, creates a
/// virtual trace row if the trace hasn't landed yet.
///
/// Returns a boxed future: the user-task hook forms an async cycle
/// (`publish_span_messages` → hook → here → `publish_span_messages`), so the
/// type must be erased here to break the E0733 / Send inference cycle. The
/// runtime recursion is bounded — the virtual span yields no candidate.
fn publish_metadata_only_span(
    trace_id: Uuid,
    project_id: Uuid,
    attributes: HashMap<String, Value>,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send>> {
    Box::pin(async move {
        let now = Utc::now();
        let span = Span {
            span_id: Uuid::new_v4(),
            trace_id,
            project_id,
            parent_span_id: None,
            name: "lmnr.trace.metadata".to_string(),
            attributes: SpanAttributes::new(attributes),
            input: None,
            output: None,
            span_type: SpanType::Default,
            start_time: now,
            end_time: now,
            status: None,
            events: vec![],
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        let messages = vec![RabbitMqSpanMessage {
            span,
            pre_processed: false,
            input_dedup: None,
            output_dedup: None,
            tool_dedup: None,
        }];

        publish_span_messages(messages, project_id, queue, db, cache).await?;
        Ok(())
    })
}

/// Merge `metadata` onto a trace via a virtual metadata-only span. No-op
/// when empty. Used by the public `POST /v1/traces/metadata` endpoint and
/// internal callers patching genuine trace metadata.
pub fn publish_trace_metadata_patch(
    trace_id: Uuid,
    project_id: Uuid,
    metadata: HashMap<String, Value>,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send>> {
    if metadata.is_empty() {
        return Box::pin(async { Ok(()) });
    }
    let mut attributes: HashMap<String, Value> = HashMap::with_capacity(metadata.len() + 1);
    attributes.insert(SPAN_METADATA_ONLY.to_string(), Value::Bool(true));
    for (key, value) in metadata {
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.metadata.{key}"),
            value,
        );
    }
    publish_metadata_only_span(trace_id, project_id, attributes, queue, db, cache)
}

/// Set the extracted trace input. The RAW value rides the virtual span on
/// [`SPAN_TRACE_INPUT`] with no predefined key: the processor stores it
/// directly in the `trace_agent_input` supplementary table. The metadata
/// key is added only on the deprecated `traces_replacing` merge path.
pub async fn publish_trace_input_update(
    trace_id: Uuid,
    project_id: Uuid,
    value: Value,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<()> {
    let attributes = HashMap::from([
        (SPAN_METADATA_ONLY.to_string(), Value::Bool(true)),
        (SPAN_TRACE_INPUT.to_string(), value),
    ]);
    publish_metadata_only_span(trace_id, project_id, attributes, queue, db, cache).await
}

/// Set the extracted trace output. Same raw-transport contract as
/// [`publish_trace_input_update`], on [`SPAN_TRACE_OUTPUT`].
pub async fn publish_trace_output_update(
    trace_id: Uuid,
    project_id: Uuid,
    text: String,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<()> {
    let attributes = HashMap::from([
        (SPAN_METADATA_ONLY.to_string(), Value::Bool(true)),
        (SPAN_TRACE_OUTPUT.to_string(), Value::String(text)),
    ]);
    publish_metadata_only_span(trace_id, project_id, attributes, queue, db, cache).await
}
