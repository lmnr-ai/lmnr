//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{events::Event, spans::Span},
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
                let span = Span::from_otel_span(otel_span.clone());

                let events = otel_span
                    .events
                    .into_iter()
                    .filter_map(|event| {
                        // OpenLLMetry auto-instrumentation sends this event for every chunk
                        // While this is helpful to get TTFT, we don't want to store excessive
                        // events
                        if event.name == "llm.content.completion.chunk" {
                            None
                        } else {
                            Some(Event::from_otel(event, span.span_id, project_id))
                        }
                    })
                    .collect::<Vec<Event>>();

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
