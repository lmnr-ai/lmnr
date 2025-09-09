//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use super::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY};
use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{events::Event, spans::Span, utils::span_id_to_uuid},
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
};

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
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
                        let span_id = span_id_to_uuid(&otel_span.span_id);

                        let otel_events = otel_span.events.clone();

                        let span = Span::from_otel_span(otel_span, project_id);

                        let events = otel_events
                            .into_iter()
                            .map(|event| {
                                Event::from_otel(event, span_id, project_id, span.trace_id)
                            })
                            .collect::<Vec<Event>>();

                        if span.should_save() {
                            Some(RabbitMqSpanMessage { span, events })
                        } else {
                            None
                        }
                    })
                })
        })
        .collect::<Vec<_>>();

    let mq_message = serde_json::to_vec(&messages).unwrap();

    if mq_message.len() >= mq_max_payload() {
        log::warn!(
            "[SPANS] MQ payload limit exceeded. Project ID: [{}], payload size: [{}]. Span count: [{}]",
            project_id,
            mq_message.len(),
            messages.len()
        );
        // Don't return error for now, skip publishing
    } else {
        queue
            .publish(&mq_message, OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY)
            .await?;
    }

    let response = ExportTraceServiceResponse {
        partial_success: None,
    };

    Ok(response)
}
