use std::collections::HashSet;

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Row, Serialize)]
struct CHTraceTags {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
    tags: Vec<String>,
}

#[derive(Row, Deserialize)]
struct ExistingTagsRow {
    tags: Vec<String>,
}

/// Merges `names` into the trace's tags. `trace_tags` is a ReplacingMergeTree
/// keyed on (project_id, trace_id), so the write is a plain insert of the full tag set.
pub async fn add_trace_tags(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    names: Vec<String>,
) -> Result<()> {
    let existing = clickhouse
        .query("SELECT tags FROM trace_tags FINAL WHERE project_id = ? AND trace_id = ?")
        .bind(project_id)
        .bind(trace_id)
        .fetch_optional::<ExistingTagsRow>()
        .await?
        .map(|row| row.tags)
        .unwrap_or_default();

    let mut seen: HashSet<String> = existing.iter().cloned().collect();
    let mut tags = existing;
    for name in names {
        if seen.insert(name.clone()) {
            tags.push(name);
        }
    }

    let mut insert = clickhouse.insert::<CHTraceTags>("trace_tags").await?;
    insert
        .write(&CHTraceTags {
            project_id,
            trace_id,
            tags,
        })
        .await?;
    insert.end().await?;
    Ok(())
}
