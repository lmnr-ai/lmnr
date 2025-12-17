use actix_web::web;
use actix_web::{HttpResponse, Responder, get};
use std::sync::Arc;

use crate::mq::{MessageQueue, MessageQueueTrait};

#[get("/health")]
pub async fn check_health(queue: web::Data<Arc<MessageQueue>>) -> impl Responder {
    let queue_ref: &MessageQueue = queue.get_ref().as_ref();
    if !queue_ref.is_healthy() {
        return HttpResponse::InternalServerError().body("Message queue unhealthy");
    }

    HttpResponse::Ok().body("OK")
}

#[get("/ready")]
pub async fn check_ready(queue: web::Data<Arc<MessageQueue>>) -> impl Responder {
    let queue_ref: &MessageQueue = queue.get_ref().as_ref();
    if !queue_ref.is_healthy() {
        return HttpResponse::InternalServerError().body("Message queue unhealthy");
    }

    HttpResponse::Ok().body("OK")
}
