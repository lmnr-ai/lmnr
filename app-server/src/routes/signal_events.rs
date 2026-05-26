use actix_web::{HttpResponse, post, web};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    quickwit::client::QuickwitClient, routes::ResponseResult,
    search::signal_events::SignalEventSearchHit,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSignalEventsRequest {
    pub signal_id: Uuid,
    pub search_query: String,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub limit: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSignalEventsResponse {
    pub ids: Vec<String>,
}

#[post("signal-events/search")]
pub async fn search_signal_events(
    project_id: web::Path<Uuid>,
    request: web::Json<SearchSignalEventsRequest>,
    quickwit_client: web::Data<Option<QuickwitClient>>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let request = request.into_inner();

    let trimmed = request.search_query.trim();
    if trimmed.is_empty() {
        return Ok(HttpResponse::Ok().json(SearchSignalEventsResponse { ids: Vec::new() }));
    }

    let quickwit_client = match quickwit_client.as_ref() {
        Some(client) => client,
        None => {
            log::warn!("Signal events search requested but Quickwit client is not available");
            return Ok(HttpResponse::Ok().json(SearchSignalEventsResponse { ids: Vec::new() }));
        }
    };

    let hits: Vec<SignalEventSearchHit> = crate::search::signal_events::search_signal_events(
        quickwit_client,
        project_id,
        request.signal_id,
        trimmed,
        request.limit,
        request.start_time,
        request.end_time,
    )
    .await?;

    let ids = hits.into_iter().map(|h| h.id).collect();
    Ok(HttpResponse::Ok().json(SearchSignalEventsResponse { ids }))
}
