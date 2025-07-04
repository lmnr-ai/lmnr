//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{events::Event, spans::Span, utils::span_id_to_uuid},
    mq::{MessageQueue, MessageQueueTrait},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
};

use super::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY};

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
) -> Result<ExportTraceServiceResponse> {
    for resource_span in request.resource_spans {
        for scope_span in resource_span.scope_spans {
            for otel_span in scope_span.spans {
                let span_id = span_id_to_uuid(&otel_span.span_id);

                let events = otel_span
                    .events
                    .clone()
                    .into_iter()
                    .map(|event| Event::from_otel(event, span_id, project_id))
                    .collect::<Vec<Event>>();

                let span = Span::from_otel_span(otel_span);

                if !span.should_save() {
                    continue;
                }

                let rabbitmq_span_message = RabbitMqSpanMessage {
                    project_id,
                    span,
                    events,
                };

                queue
                    .publish(
                        &serde_json::to_vec(&rabbitmq_span_message).unwrap(),
                        OBSERVATIONS_EXCHANGE,
                        OBSERVATIONS_ROUTING_KEY,
                    )
                    .await?;
            }
        }
    }

    let response = ExportTraceServiceResponse {
        partial_success: None,
    };

    Ok(response)
}
