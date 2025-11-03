use actix_web::{HttpRequest, HttpResponse, post};

use crate::routes::types::ResponseResult;

#[post("metrics")]
pub async fn process_metrics(req: HttpRequest) -> ResponseResult {
    // This is a placeholder that just returns ok, so that client otel exporters
    // don't fail when trying to send metrics to the server.
    // TODO: Implement metrics processing
    let keep_alive = req.headers().get("connection").map_or(false, |v| {
        v.to_str().unwrap_or_default().trim().to_lowercase() == "keep-alive"
    });
    if keep_alive {
        Ok(HttpResponse::Ok().keep_alive().finish())
    } else {
        Ok(HttpResponse::Ok().finish())
    }
}
