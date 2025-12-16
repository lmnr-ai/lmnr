use actix_web::web;
use actix_web::{HttpResponse, Responder, get};
use lapin::Connection;
use std::sync::Arc;

#[get("/health")]
pub async fn check_health(connection: web::Data<Option<Arc<Connection>>>) -> impl Responder {
    let rabbitmq_status = if let Some(conn) = connection.as_ref() {
        let status = conn.status();
        if !status.connected() {
            log::error!(
                "Health check failed - RabbitMQ connection not connected. State: {:?}",
                status.state()
            );
            false
        } else {
            true
        }
    } else {
        // If connection is None, we're in mock mode so return true
        true
    };

    if !rabbitmq_status {
        return HttpResponse::InternalServerError().body("RabbitMQ connection failed");
    }

    HttpResponse::Ok().body("OK")
}

#[get("/ready")]
pub async fn check_ready(connection: web::Data<Option<Arc<Connection>>>) -> impl Responder {
    let rabbitmq_status = if let Some(conn) = connection.as_ref() {
        let status = conn.status();
        if !status.connected() {
            log::warn!(
                "Readiness check failed - RabbitMQ connection not connected. State: {:?}",
                status.state()
            );
            false
        } else {
            true
        }
    } else {
        // If connection is None, we're in mock mode so return true
        true
    };

    if !rabbitmq_status {
        return HttpResponse::InternalServerError().body("RabbitMQ connection failed");
    }

    HttpResponse::Ok().body("OK")
}
