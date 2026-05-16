use actix_web::web;
use actix_web::{HttpResponse, Responder, get};
use std::sync::Arc;

use crate::mq::{MessageQueue, MessageQueueTrait};

/// Liveness — process is up and able to respond. We deliberately do NOT gate
/// this on RabbitMQ health: a transient broker failure (e.g. one cluster
/// replica dying) is recoverable in-process via ResilientConnection's
/// supervisor, and restarting the pod would only widen the blast radius —
/// dropping the ingestion endpoint while the reconnect happens out of band.
/// Use /ready for dependency-aware checks.
#[get("/health")]
pub async fn check_health() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

/// Readiness — should the load balancer route traffic here right now?
/// Reflects RabbitMQ connection state so a pod whose connection is being
/// re-established is briefly removed from rotation.
#[get("/ready")]
pub async fn check_ready(queue: web::Data<Arc<MessageQueue>>) -> impl Responder {
    let queue_ref: &MessageQueue = queue.get_ref().as_ref();
    if !queue_ref.is_healthy() {
        return HttpResponse::ServiceUnavailable().body("Message queue unhealthy");
    }

    HttpResponse::Ok().body("OK")
}
