use actix_web::web::Data;
use actix_web::{get, HttpResponse, Responder};
use lapin::Connection;
use std::sync::Arc;

#[get("/health")]
pub async fn check_health(connection: Data<Option<Arc<Connection>>>) -> impl Responder {
    let rabbitmq_status = if let Some(conn) = connection.as_ref() {
        conn.status().connected()
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
pub async fn check_ready(connection: Data<Option<Arc<Connection>>>) -> impl Responder {
    let rabbitmq_status = if let Some(conn) = connection.as_ref() {
        conn.status().connected()
    } else {
        // If connection is None, we're in mock mode so return true
        true
    };

    if !rabbitmq_status {
        return HttpResponse::InternalServerError().body("RabbitMQ connection failed");
    }

    HttpResponse::Ok().body("OK")
}
