use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    quickwit::{SIGNAL_EVENTS_INDEX_ID, client::QuickwitClient},
    routes::error::Error,
    search::escape_quickwit_query,
};

const DEFAULT_SEARCH_MAX_SIGNAL_EVENTS: usize = 1000;

const SIGNAL_EVENTS_DEFAULT_SEARCH_FIELDS: [&str; 3] = ["summary", "payload", "name"];

#[derive(Serialize, Deserialize)]
pub struct SignalEventSearchHit {
    pub id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitSignalEventHit {
    id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitResponse {
    hits: Vec<QuickwitSignalEventHit>,
}

/// Search the `signal_events` Quickwit index by free-text query, scoped to a
/// project + signal. Returns matching event ids; the caller hydrates rows from
/// ClickHouse so the existing column projection / pagination stays unchanged.
#[tracing::instrument(skip_all, name = "search_signal_events", fields(project_id, signal_id))]
pub async fn search_signal_events(
    quickwit_client: &QuickwitClient,
    project_id: Uuid,
    signal_id: Uuid,
    query: &str,
    limit: usize,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
) -> Result<Vec<SignalEventSearchHit>, Error> {
    let escaped_query = escape_quickwit_query(query);

    let query_string = format!(
        "project_id:{} AND signal_id:{} AND ({})",
        project_id, signal_id, escaped_query
    );

    let mut search_body = json!({
        "query": query_string,
        "sort_by": "timestamp",
    });

    let search_fields = SIGNAL_EVENTS_DEFAULT_SEARCH_FIELDS.join(",");
    search_body["search_field"] = serde_json::Value::String(search_fields);

    let max_hits = if limit == 0 {
        DEFAULT_SEARCH_MAX_SIGNAL_EVENTS
    } else {
        limit
    };
    search_body["max_hits"] = serde_json::Value::Number(max_hits.into());

    // Only constrain Quickwit when the caller passed a bound. The events table
    // CH query is also unbounded when no time params are present, so a default
    // 7-day window here would silently drop older matches from search results.
    if let Some(start) = start_time {
        search_body["start_timestamp"] = serde_json::Value::Number(start.timestamp().into());
    }
    if let Some(end) = end_time {
        search_body["end_timestamp"] = serde_json::Value::Number(end.timestamp().into());
    }

    let t0 = std::time::Instant::now();
    let response_value = quickwit_client
        .search_index(SIGNAL_EVENTS_INDEX_ID, search_body)
        .await
        .map_err(|e| {
            log::error!(
                "Quickwit search error (index {}): {:?}",
                SIGNAL_EVENTS_INDEX_ID,
                e
            );
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to search signal events"))
        })?;

    let parsed: QuickwitResponse = serde_json::from_value(response_value).map_err(|e| {
        Error::InternalAnyhowError(anyhow::anyhow!(
            "Failed to parse Quickwit signal events response: {}",
            e
        ))
    })?;

    log::debug!(
        "[search_signal_events] quickwit: {}ms, {} hits",
        t0.elapsed().as_millis(),
        parsed.hits.len()
    );

    Ok(parsed
        .hits
        .into_iter()
        .map(|h| SignalEventSearchHit { id: h.id })
        .collect())
}
