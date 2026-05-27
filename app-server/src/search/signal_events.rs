use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    quickwit::{SIGNAL_EVENTS_INDEX_ID, client::QuickwitClient},
    routes::error::Error,
    search::{
        escape_quickwit_query,
        snippets::{
            SNIPPET_CONTEXT_CHARS, SnippetInfo, build_search_regexes, fetch_signal_event_snippets,
            post_process_snippet,
        },
    },
};

const DEFAULT_SEARCH_MAX_SIGNAL_EVENTS: usize = 500;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalEventSearchHit {
    pub id: String,
    /// Per-schema-field snippets keyed by field name.
    pub field_snippets: HashMap<String, SnippetInfo>,
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
/// project + signal. When `payload_fields` is non-empty, also fetches per-field
/// snippets from ClickHouse for highlighting.
#[tracing::instrument(skip_all, name = "search_signal_events", fields(project_id, signal_id))]
pub async fn search_signal_events(
    quickwit_client: &QuickwitClient,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    signal_id: Uuid,
    query: &str,
    payload_fields: &[String],
    limit: usize,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
) -> Result<Vec<SignalEventSearchHit>, Error> {
    // Quickwit's `json` field type doesn't accept bare queries at the field
    // root — each subfield must be addressed explicitly (`payload.foo:"…"`).
    // The frontend sends the schema's string fields in `payload_fields`; we
    // OR them together. Empty list → no fields to search → no hits.
    if payload_fields.is_empty() {
        return Ok(Vec::new());
    }

    let escaped_query = escape_quickwit_query(query);
    let payload_clause = payload_fields
        .iter()
        .map(|f| format!("payload.{}:{}", f, escaped_query))
        .collect::<Vec<_>>()
        .join(" OR ");

    let query_string = format!(
        "project_id:{} AND signal_id:{} AND ({})",
        project_id, signal_id, payload_clause
    );

    let mut search_body = json!({
        "query": query_string,
        "sort_by": "timestamp",
    });

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

    if parsed.hits.is_empty() {
        return Ok(Vec::new());
    }

    let hit_ids: Vec<Uuid> = parsed
        .hits
        .iter()
        .filter_map(|h| Uuid::parse_str(&h.id).ok())
        .collect();

    let snippet_lookup = if !hit_ids.is_empty() {
        enrich_with_field_snippets(
            clickhouse,
            project_id,
            signal_id,
            &hit_ids,
            payload_fields,
            query,
        )
        .await
    } else {
        HashMap::new()
    };

    let results = parsed
        .hits
        .into_iter()
        .map(|h| {
            let field_snippets = snippet_lookup.get(&h.id).cloned().unwrap_or_default();
            SignalEventSearchHit {
                id: h.id,
                field_snippets,
            }
        })
        .collect();

    log::debug!(
        "[search_signal_events] total: {}ms",
        t0.elapsed().as_millis()
    );

    Ok(results)
}

/// Build the per-event snippet map keyed by event id string. Internal helper.
async fn enrich_with_field_snippets(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    signal_id: Uuid,
    ids: &[Uuid],
    payload_fields: &[String],
    query: &str,
) -> HashMap<String, HashMap<String, SnippetInfo>> {
    let (match_re, context_regex) = match build_search_regexes(query) {
        Some(regexes) => regexes,
        None => return HashMap::new(),
    };

    let rows = fetch_signal_event_snippets(
        clickhouse,
        project_id,
        signal_id,
        ids,
        payload_fields,
        &context_regex,
    )
    .await;

    rows.into_iter()
        .map(|row| {
            let snippets: HashMap<String, SnippetInfo> = payload_fields
                .iter()
                .zip(row.field_snippets.into_iter())
                .filter_map(|(field, raw)| {
                    post_process_snippet(&raw, &match_re, SNIPPET_CONTEXT_CHARS)
                        .map(|(text, highlight)| (field.clone(), SnippetInfo { text, highlight }))
                })
                .collect();
            (row.id.to_string(), snippets)
        })
        .collect()
}
