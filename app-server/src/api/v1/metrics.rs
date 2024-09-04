use actix_web::{post, HttpResponse};

#[post("metrics")]
pub async fn process_metrics() -> HttpResponse {
    // This is a placeholder that just returns ok, so that client otel exporters
    // don't fail when trying to send metrics to the server.
    // TODO: Implement metrics processing
    HttpResponse::Ok().finish()
}
