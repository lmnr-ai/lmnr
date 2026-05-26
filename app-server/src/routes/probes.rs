use actix_web::web;
use actix_web::{HttpResponse, Responder, get};
use std::sync::Arc;

use crate::cache::{Cache, CacheTrait};
use crate::mq::{MessageQueue, MessageQueueTrait};

/// Liveness — process is up and able to respond. We deliberately do NOT gate
/// this on RabbitMQ or Redis health: transient external-dependency failures
/// are recoverable in-process via the resilient-connection supervisors, and
/// restarting the pod would only widen the blast radius. Use /ready for
/// dependency-aware checks.
#[get("/health")]
pub async fn check_health() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

/// Readiness — should the load balancer route traffic here right now?
/// Reflects RabbitMQ and Redis connection state so a pod whose connection is
/// being re-established is briefly removed from rotation.
#[get("/ready")]
pub async fn check_ready(
    queue: web::Data<Arc<MessageQueue>>,
    cache: web::Data<Cache>,
) -> impl Responder {
    let queue_ref: &MessageQueue = queue.get_ref().as_ref();
    if !queue_ref.is_healthy() {
        return HttpResponse::ServiceUnavailable().body("Message queue unhealthy");
    }

    if !cache.is_healthy() {
        return HttpResponse::ServiceUnavailable().body("Cache unhealthy");
    }

    HttpResponse::Ok().body("OK")
}
