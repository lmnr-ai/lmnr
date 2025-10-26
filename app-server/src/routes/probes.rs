use crate::worker_tracking::{ExpectedWorkerCounts, WorkerTracker, WorkerType};
use actix_web::web;
use actix_web::{HttpResponse, Responder, get};
use lapin::Connection;
use std::sync::Arc;

#[get("/health")]
pub async fn check_health(connection: web::Data<Option<Arc<Connection>>>) -> impl Responder {
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
pub async fn check_ready(connection: web::Data<Option<Arc<Connection>>>) -> impl Responder {
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

#[get("/health")]
pub async fn check_health_consumer(
    connection: web::Data<Option<Arc<Connection>>>,
    worker_tracker: web::Data<Arc<WorkerTracker>>,
    expected_counts: web::Data<ExpectedWorkerCounts>,
) -> impl Responder {
    let rabbitmq_status = if let Some(conn) = connection.as_ref() {
        conn.status().connected()
    } else {
        // If connection is None, we're in mock mode so return true
        true
    };

    if !rabbitmq_status {
        return HttpResponse::InternalServerError().body("RabbitMQ connection failed");
    }

    let expected = expected_counts.as_ref();

    let is_healthy = worker_tracker.is_healthy(expected);

    if !is_healthy {
        // Build expected and actual counts exhaustively for all worker types
        let mut expected_counts = serde_json::Map::new();
        let mut actual_counts = serde_json::Map::new();

        for worker_type in WorkerType::all_variants() {
            let key = worker_type.to_string();
            expected_counts.insert(key.clone(), serde_json::json!(expected.get(&worker_type)));
            actual_counts.insert(
                key,
                serde_json::json!(worker_tracker.get_worker_count(&worker_type)),
            );
        }

        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Worker health check failed",
            "expected": expected_counts,
            "actual": actual_counts,
            "total_workers": worker_tracker.get_total_workers()
        }));
    }

    let worker_counts = worker_tracker.get_worker_counts();
    log::debug!(
        "Worker counts: {:?}",
        worker_counts
            .into_iter()
            .map(|(worker_type, count)| { (worker_type.to_string(), count) })
            .collect::<std::collections::HashMap<String, usize>>()
    );

    HttpResponse::Ok().body("OK")
}
