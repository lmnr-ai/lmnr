use std::collections::HashSet;

use clickhouse::Row;
use serde::Deserialize;
use uuid::Uuid;

use crate::{db::traces::SearchTracesParams, ch::utils::chrono_to_nanoseconds};

#[derive(Row, Deserialize)]
pub struct SpanSearchResult {
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
}

pub async fn search_spans_for_trace_ids(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    search_query: &str,
    params: &SearchTracesParams,
) -> Result<Option<HashSet<Uuid>>, Box<dyn std::error::Error + Send + Sync>> {
    let search_fields = params.search_in();

    let mut search_conditions = Vec::new();
    for field in &search_fields {
        match field.as_str() {
            "input" => search_conditions.push("input_lower LIKE ?"),
            "output" => search_conditions.push("output_lower LIKE ?"),
            _ => {}
        }
    }

    let search_condition = search_conditions.join(" OR ");

    let start_time_ns = chrono_to_nanoseconds(params.start_time());
    let end_time_ns = chrono_to_nanoseconds(params.end_time());

    let query = format!(
        "SELECT DISTINCT trace_id 
         FROM spans 
         WHERE project_id = ?
           AND start_time IS NOT NULL 
           AND end_time IS NOT NULL
           AND start_time <= fromUnixTimestamp64Nano(?)
           AND end_time >= fromUnixTimestamp64Nano(?)
           AND ({})
         ORDER BY start_time DESC   
         LIMIT 10000",
        search_condition
    );

    let search_pattern = format!("%{}%", search_query.to_lowercase());
    
    let mut query_builder = clickhouse
        .query(&query)
        .bind(project_id)
        .bind(end_time_ns)
        .bind(start_time_ns);

    for _ in &search_conditions {
        query_builder = query_builder.bind(&search_pattern);
    }

    let rows = query_builder.fetch_all::<SpanSearchResult>().await?;

    let trace_ids: HashSet<Uuid> = rows.into_iter().map(|row| row.trace_id).collect();
    
    if trace_ids.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trace_ids))
    }
}