use std::sync::Arc;

use anyhow::Result;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::{
        events::{EvaluateEventRequest, EventObservation},
        trace::Span,
        utils::convert_any_value_to_json_value,
    },
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
};

use super::{attributes::EVENT_TYPE, OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY};

// TODO: Implement partial_success
pub async fn process_trace_export(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    rabbitmq_connection: Arc<Connection>,
) -> Result<ExportTraceServiceResponse> {
    let channel = rabbitmq_connection.create_channel().await?;

    for resource_span in request.resource_spans {
        for scope_span in resource_span.scope_spans {
            for otel_span in scope_span.spans {
                let span = Span::from_otel_span(otel_span.clone());

                let mut events = vec![];
                let mut evaluate_events = vec![];

                for event in otel_span.events {
                    let event_attributes = event
                        .attributes
                        .clone()
                        .into_iter()
                        .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
                        .collect::<serde_json::Map<String, serde_json::Value>>();

                    let Some(serde_json::Value::String(event_type)) =
                        event_attributes.get(EVENT_TYPE)
                    else {
                        if event.name != "llm.content.completion.chunk" {
                            log::warn!("Unknown event type: {:?}", event);
                        }
                        continue;
                    };

                    if event_type == "default" {
                        events.push(EventObservation::from_otel(event, span.span_id));
                    } else if event_type == "evaluate" {
                        let evaluate_event = EvaluateEventRequest::try_from_otel(event);
                        if let Err(e) = evaluate_event {
                            log::warn!("Failed to convert event to EvaluateEventRequest: {:?}", e);
                            continue;
                        }
                        evaluate_events.push(evaluate_event.unwrap());
                    } else {
                        log::warn!("Unknown event type: {}", event_type);
                    }
                }

                let rabbitmq_span_message = RabbitMqSpanMessage {
                    project_id,
                    span,
                    events,
                    evaluate_events,
                };

                let payload = serde_json::to_string(&rabbitmq_span_message).unwrap();
                let payload = payload.as_bytes();

                channel
                    .basic_publish(
                        OBSERVATIONS_EXCHANGE,
                        OBSERVATIONS_ROUTING_KEY,
                        BasicPublishOptions::default(),
                        payload,
                        BasicProperties::default(),
                    )
                    .await?
                    .await?;
            }
        }
    }

    let response = ExportTraceServiceResponse {
        partial_success: None,
    };

    Ok(response)
}
