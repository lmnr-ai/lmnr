//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{events::EventObservation, spans::Span, utils::convert_any_value_to_json_value, DB},
    features::{is_feature_enabled, Feature},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
};

use super::{
    span_attributes::EVENT_TYPE, utils::record_span_to_db, OBSERVATIONS_EXCHANGE,
    OBSERVATIONS_ROUTING_KEY,
};

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    rabbitmq_connection: Option<Arc<Connection>>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<ExportTraceServiceResponse> {
    if !is_feature_enabled(Feature::FullBuild) {
        for resource_span in request.resource_spans {
            for scope_span in resource_span.scope_spans {
                for otel_span in scope_span.spans {
                    let mut span = Span::from_otel_span(otel_span.clone());

                    if !span.should_save() {
                        continue;
                    }

                    let span_usage = super::utils::get_llm_usage_for_span(
                        &mut span.get_attributes(),
                        db.clone(),
                        cache.clone(),
                    )
                    .await;

                    if let Err(e) =
                        record_span_to_db(db.clone(), &span_usage, &project_id, &mut span).await
                    {
                        log::error!(
                            "Failed to record span. span_id [{}], project_id [{}]: {:?}",
                            span.span_id,
                            project_id,
                            e
                        );
                    }
                }
            }
        }
        return Ok(ExportTraceServiceResponse {
            partial_success: None,
        });
    }
    // Safe to unwrap because we checked is_feature_enabled above
    let channel = rabbitmq_connection.unwrap().create_channel().await?;

    for resource_span in request.resource_spans {
        for scope_span in resource_span.scope_spans {
            for otel_span in scope_span.spans {
                let span = Span::from_otel_span(otel_span.clone());

                let mut events = vec![];

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
                    } else {
                        log::warn!("Unknown event type: {}", event_type);
                    }
                }

                if !span.should_save() {
                    continue;
                }

                let rabbitmq_span_message = RabbitMqSpanMessage {
                    project_id,
                    span,
                    events,
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
