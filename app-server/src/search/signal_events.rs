use std::{collections::HashMap, sync::LazyLock};

use chrono::{DateTime, Utc};
use regex::Regex;
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

/// Mirrors the form rule in `schema-field-row.tsx`. Field names land
/// un-quoted in the Quickwit query (`payload.<name>:…`), so anything
/// non-identifier could break the parenthesised tenancy scope.
static PAYLOAD_FIELD_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap());

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

/// Free-text search over the `signal_events` Quickwit index, scoped to a
/// project + signal. Also fetches per-field CH snippets for highlighting.
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
    // Quickwit's json field has no searchable root — each subfield must be
    // addressed explicitly (`payload.foo:"…"`). Filter names through the
    // identifier regex first (see `PAYLOAD_FIELD_NAME_RE`);
    let payload_fields: Vec<String> = payload_fields
        .iter()
        .filter(|f| PAYLOAD_FIELD_NAME_RE.is_match(f))
        .cloned()
        .collect();
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

    // Only constrain when bounds were passed — the events table CH query is
    // also unbounded, so a default window here would silently drop matches.
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
            &payload_fields,
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

/// Per-event snippet map keyed by event id string.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifier_regex_accepts_valid_names() {
        for name in ["foo", "Foo", "_foo", "foo_bar", "fooBar123", "_", "F", "a1"] {
            assert!(
                PAYLOAD_FIELD_NAME_RE.is_match(name),
                "expected {name:?} to be accepted"
            );
        }
    }

    #[test]
    fn identifier_regex_rejects_injection_attempts() {
        // Each is shaped to break the parenthesised tenancy scope when
        // interpolated into `payload.{f}:"…"`.
        for name in [
            "f1:\"x\") OR (payload.f1",
            "f1) OR (payload.f1",
            "f1\" OR payload.f1:\"x",
            "f1 OR payload.f1",
            "f1.f2",
            "f1-f2",
            "1foo",
            "",
            "foo bar",
            "foo\nbar",
        ] {
            assert!(
                !PAYLOAD_FIELD_NAME_RE.is_match(name),
                "expected {name:?} to be rejected"
            );
        }
    }
}
