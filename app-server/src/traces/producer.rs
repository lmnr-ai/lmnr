//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    db::{events::Event, spans::Span, DB},
    features::{is_feature_enabled, Feature},
    opentelemetry::opentelemetry::proto::collector::trace::v1::{
        ExportTraceServiceRequest, ExportTraceServiceResponse,
    },
    pipeline::runner::PipelineRunner,
};

use super::{
    process_label_classes, process_spans_and_events, OBSERVATIONS_EXCHANGE,
    OBSERVATIONS_ROUTING_KEY,
};

// TODO: Implement partial_success
pub async fn push_spans_to_queue(
    request: ExportTraceServiceRequest,
    project_id: Uuid,
    rabbitmq_connection: Option<Arc<Connection>>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    pipeline_runner: Arc<PipelineRunner>,
) -> Result<ExportTraceServiceResponse> {
    if !is_feature_enabled(Feature::FullBuild) {
        for resource_span in request.resource_spans {
            for scope_span in resource_span.scope_spans {
                for otel_span in scope_span.spans {
                    let mut span = Span::from_otel_span(otel_span.clone());

                    if !span.should_save() {
                        continue;
                    }

                    let events = otel_span
                        .events
                        .into_iter()
                        .map(|event| Event::from_otel(event, span.span_id, project_id))
                        .collect::<Vec<Event>>();

                    process_spans_and_events(
                        &mut span,
                        events,
                        &project_id,
                        db.clone(),
                        clickhouse.clone(),
                        cache.clone(),
                        None,
                    )
                    .await;

                    process_label_classes(
                        &span,
                        &project_id,
                        db.clone(),
                        clickhouse.clone(),
                        pipeline_runner.clone(),
                    )
                    .await;
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
