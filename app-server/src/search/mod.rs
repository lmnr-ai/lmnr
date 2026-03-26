pub mod snippets;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    quickwit::{SPANS_INDEX_ID, client::QuickwitClient},
    routes::error::Error,
};
use snippets::SearchSpanHit;

const DEFAULT_SEARCH_MAX_SPANS: usize = 500;
const DEFAULT_SEARCH_TIME_RANGE: chrono::Duration = chrono::Duration::days(7);

// TODO: maybe remove all punctuation similar to the default tokenizer in the index?
const QUICKWIT_RESERVED_CHARACTERS: &[char] = &['"', '?', '`', '~', '!', '\\'];
// Quickwit documentation is very brief on this, it lists all of the reserved characters
// with a note that you can escape them with a backslash. However, some of them break
// the query parsing when escaped, so we need to remove them.
const QUICKWIT_RESERVED_UNESCAPABLE_CHARACTERS: &[char] = &[
    ':', '^', '{', '}', '[', ']', '(', ')',
    // The below characters won't break parsing but change the meaning of the query
    // even when escaped, so safest to remove them.
    '+', '\u{002D}', // - hyphen-minus
    '\u{2013}', // – en dash
    '\u{2014}', // — em dash
];

const QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS: [&str; 2] = ["input", "output"];

/// Escape special characters for Quickwit query syntax and wrap in quotes for phrase search.
fn escape_quickwit_query(query: &str) -> String {
    let escaped: String = query
        .chars()
        .flat_map(|c| {
            if QUICKWIT_RESERVED_CHARACTERS.contains(&c) {
                vec!['\\', c]
            } else if QUICKWIT_RESERVED_UNESCAPABLE_CHARACTERS.contains(&c) {
                vec![' ']
            } else {
                vec![c]
            }
        })
        .collect();
    format!("\"{escaped}\"")
}

#[derive(Serialize, Deserialize)]
struct QuickwitHit {
    trace_id: String,
    span_id: String,
}

#[derive(Serialize, Deserialize)]
struct QuickwitResponse {
    hits: Vec<QuickwitHit>,
}

#[tracing::instrument(skip_all, name = "search_spans", fields(project_id))]
pub async fn search_spans(
    quickwit_client: &QuickwitClient,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    query: &str,
    trace_id: Option<&str>,
    limit: usize,
    offset: usize,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    get_snippets: bool,
) -> Result<Vec<SearchSpanHit>, Error> {
    let escaped_query = escape_quickwit_query(query);

    // Filter by project_id and trace_id (if provided)
    let mut query_parts = vec![
        format!("project_id:{}", project_id),
        format!("({})", escaped_query),
    ];

    if let Some(trace_id) = trace_id {
        query_parts.push(format!("trace_id:{}", trace_id));
    }

    let query_string = query_parts.join(" AND ");

    let mut search_body = json!({
        "query": query_string,
        "sort_by": "start_time", // default is descending
    });

    // Set search fields
    let search_fields = QUICKWIT_SPANS_DEFAULT_SEARCH_FIELDS.join(",");
    search_body["search_field"] = serde_json::Value::String(search_fields);

    // Set pagination
    if limit != 0 {
        search_body["max_hits"] = serde_json::Value::Number(limit.into())
    } else {
        search_body["max_hits"] = serde_json::Value::Number(DEFAULT_SEARCH_MAX_SPANS.into());
    }

    if offset != 0 {
        search_body["start_offset"] = serde_json::Value::Number(offset.into());
    }

    // Set time range, default to 1 week
    let effective_start = start_time.unwrap_or_else(|| Utc::now() - DEFAULT_SEARCH_TIME_RANGE);
    let effective_end = end_time.unwrap_or_else(Utc::now);

    search_body["start_timestamp"] = serde_json::Value::Number(effective_start.timestamp().into());
    search_body["end_timestamp"] = serde_json::Value::Number(effective_end.timestamp().into());

    // Search span ids in Quickwit
    let t0 = std::time::Instant::now();
    let hits = search_span_hits(quickwit_client, &SPANS_INDEX_ID, search_body).await?;
    log::debug!(
        "[search_spans] quickwit: {}ms, {} hits",
        t0.elapsed().as_millis(),
        hits.len()
    );

    if hits.is_empty() {
        return Ok(Vec::new());
    }

    let span_hits: Vec<SearchSpanHit> = hits
        .into_iter()
        .map(|h| SearchSpanHit {
            trace_id: h.trace_id,
            span_id: h.span_id,
            input_snippet: None,
            output_snippet: None,
        })
        .collect();

    let results = if get_snippets {
        snippets::enrich_hits_with_snippets(
            clickhouse,
            project_id,
            span_hits,
            trace_id.is_some(),
            query,
        )
        .await
    } else {
        span_hits
    };

    log::debug!("[search_spans] total: {}ms", t0.elapsed().as_millis());

    Ok(results)
}

#[tracing::instrument(skip_all, fields(index_id))]
async fn search_span_hits(
    client: &QuickwitClient,
    index_id: &str,
    body: serde_json::Value,
) -> Result<Vec<QuickwitHit>, Error> {
    let response_value = client.search_index(index_id, body).await.map_err(|e| {
        log::error!("Quickwit search error (index {}): {:?}", index_id, e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to search spans"))
    })?;

    let quickwit_response: QuickwitResponse =
        serde_json::from_value(response_value).map_err(|e| {
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to parse Quickwit response: {}", e))
        })?;

    Ok(quickwit_response.hits)
}
