use std::sync::Arc;

use actix_web::{get, post, web, HttpResponse};
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use serde::{Deserialize, Serialize};

use crate::{
    db::{
        api_keys::ProjectApiKey,
        events,
        trace::{SpanWithChecksAndEvents, Trace},
        DB,
    },
    routes::types::ResponseResult,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY},
};

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(untagged)]
pub enum Observation {
    Trace(Trace),
    Span(SpanWithChecksAndEvents),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadObservationsRequest {
    pub observations: Vec<Observation>,
}

#[post("observations")]
pub async fn upload_observations(
    project_api_key: ProjectApiKey,
    request: web::Json<UploadObservationsRequest>,
    rabbitmq_connection: web::Data<Arc<Connection>>,
) -> ResponseResult {
    let request = request.into_inner();
    let req_observations = request.observations;

    let channel = rabbitmq_connection
        .create_channel()
        .await
        .expect("Failed to create channel");

    for observation in req_observations {
        let observation: Observation = if let Observation::Trace(mut trace) = observation.clone() {
            trace.project_id = project_api_key.project_id;
            Observation::Trace(trace)
        } else if let Observation::Span(mut span) = observation.clone() {
            span.project_id = project_api_key.project_id;
            Observation::Span(span)
        } else {
            observation
        };

        let payload = serde_json::to_string(&observation).unwrap();
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
