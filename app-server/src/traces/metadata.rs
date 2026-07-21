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
        span_attributes::{ASSOCIATION_PROPERTIES_PREFIX, SPAN_AGENT_IO_VER, SPAN_METADATA_ONLY},
        spans::SpanAttributes,
    },
};

/// Merge `metadata` onto a trace via a virtual metadata-only span, creating a
/// virtual trace row when the trace doesn't exist yet. No-op when empty.
///
/// `agent_io_ver` (extraction patches only) rides as an internal span
/// attribute — the processor uses it as the RMT version for the
/// `trace_agent_input` / `trace_agent_output` ClickHouse rows; it never
/// merges into trace metadata.
///
/// Returns a boxed future: the user-task hook forms an async cycle
/// (`publish_span_messages` → hook → here → `publish_span_messages`), so the
/// type must be erased here to break the E0733 / Send inference cycle. The
/// runtime recursion is bounded — the virtual span yields no candidate.
pub fn publish_trace_metadata_patch(
    trace_id: Uuid,
    project_id: Uuid,
    metadata: HashMap<String, Value>,
    agent_io_ver: Option<u64>,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send>> {
    Box::pin(async move {
        if metadata.is_empty() {
            return Ok(());
        }

        let mut attributes: HashMap<String, Value> = HashMap::with_capacity(metadata.len() + 2);
        attributes.insert(SPAN_METADATA_ONLY.to_string(), Value::Bool(true));
        if let Some(ver) = agent_io_ver {
            attributes.insert(SPAN_AGENT_IO_VER.to_string(), Value::from(ver));
        }
        for (key, value) in metadata {
            attributes.insert(
                format!("{ASSOCIATION_PROPERTIES_PREFIX}.metadata.{key}"),
                value,
            );
        }

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
