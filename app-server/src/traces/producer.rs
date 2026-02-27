//! This module takes trace exports from OpenTelemetry and pushes them
//! to RabbitMQ for further processing.

use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use super::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY, SPANS_DATA_PLANE_EXCHANGE,
    SPANS_DATA_PLANE_ROUTING_KEY,
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
};

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
            let resource_attributes = resource_span.resource.map(|r| {
                r.attributes
                    .into_iter()
                    .map(|kv| {
                        (
                            kv.key,
                            crate::traces::utils::convert_any_value_to_json_value(kv.value),
                        )
                    })
                    .collect::<std::collections::HashMap<String, serde_json::Value>>()
            });
            resource_span
                .scope_spans
                .into_iter()
                .flat_map({
                    let resource_attributes = resource_attributes.clone();
                    move |scope_span| {
                        let resource_attributes = resource_attributes.clone();
                        scope_span.spans.into_iter().filter_map(move |otel_span| {
                            let span = Span::from_otel_span(
                                otel_span,
                                project_id,
                                resource_attributes.as_ref(),
                            );

                            if span.should_save() {
                                Some(RabbitMqSpanMessage { span })
                            } else {
                                None
                            }
                        })
                    }
                })
        })
        .collect::<Vec<_>>();

    let mq_message = serde_json::to_vec(&messages).unwrap();
    let span_count = messages.len();

    if mq_message.len() >= mq_max_payload() {
        log::warn!(
            "[SPANS] MQ payload limit exceeded. Project ID: [{}], payload size: [{}]. Span count: [{}]",
            project_id,
            mq_message.len(),
            messages.len()
        );

        // Return partial success to inform client that logs were rejected
        return Ok(ExportTraceServiceResponse {
            partial_success: Some(ExportTracePartialSuccess {
                rejected_spans: span_count as i64,
                error_message: format!(
                    "Payload size {} exceeds limit. All {} spans rejected.",
                    mq_message.len(),
                    span_count
                ),
            }),
        });
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

    let response = ExportTraceServiceResponse {
        partial_success: None,
    };

    Ok(response)
}
