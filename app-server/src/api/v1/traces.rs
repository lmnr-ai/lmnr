use std::sync::Arc;

use actix_web::{get, post, web, HttpResponse};
use bytes::Bytes;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{
        api_keys::ProjectApiKey,
        events::{self, EvaluateEventRequest, EventObservation},
        trace::Span,
        utils::convert_any_value_to_json_value,
        DB,
    },
    opentelemetry::opentelemetry_collector_trace_v1::ExportTraceServiceRequest,
    routes::types::ResponseResult,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY},
};
use prost::Message;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RabbitMqSpanMessage {
    pub project_id: Uuid,
    pub span: Span,
    pub events: Vec<EventObservation>,
    pub evaluate_events: Vec<EvaluateEventRequest>,
}

#[post("traces")]
pub async fn process_traces(
    body: Bytes,
    project_api_key: ProjectApiKey,
    rabbitmq_connection: web::Data<Arc<Connection>>,
) -> ResponseResult {
    let channel = rabbitmq_connection
        .create_channel()
        .await
        .expect("Failed to create channel");

    let request = ExportTraceServiceRequest::decode(body).unwrap();

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

                    let serde_json::Value::String(event_type) =
                        event_attributes.get("lmnr.event.type").unwrap()
                    else {
                        return Err(anyhow::anyhow!("Failed to get event type").into());
                    };

                    if event_type == "default" {
                        events.push(EventObservation::from_otel(event, span.span_id));
                    } else if event_type == "evaluate" {
                        evaluate_events.push(EvaluateEventRequest::try_from_otel(event)?);
                    } else {
                        log::warn!("Unknown event type: {}", event_type);
                    }
                }

                let rabbitmq_span_message = RabbitMqSpanMessage {
                    project_id: project_api_key.project_id,
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
                    .await
                    .expect("Failed to publish message")
                    .await
                    .expect("Failed to ack on publish message");
            }
        }
    }

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetEventsForSessionRequest {
    session_id: String,
}

#[get("session-events")]
pub async fn get_events_for_session(
    request: web::Query<GetEventsForSessionRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let session_id = request.session_id.clone();
    let events = events::get_events_for_session(&db.pool, &session_id, &project_id)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get events for session: {}", e))?;
    Ok(HttpResponse::Ok().json(events))
}
