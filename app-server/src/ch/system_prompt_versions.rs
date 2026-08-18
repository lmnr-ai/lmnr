//! System-prompt versioning tables, both written by the sp-versioning
//! consumer:
//!   - `system_prompt_versions` — one row per SPAN, its resolved version.
//!     Write-once: rows are never corrected after insert (transition-window
//!     spans keep the version resolved at classification time).
//!   - `system_prompt_version_defs` — one row per MINT, carrying the version's
//!     static text and provenance. An analysis journal; nothing reads it.

use std::collections::HashMap;

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::utils::chrono_to_nanoseconds;
use crate::traces::prompt_hash::extract_system_message;
use crate::utils::{sanitize_string, truncate_chars};

#[derive(Row, Serialize, Debug, Clone)]
pub struct CHSystemPromptVersion {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub agent_hash: String,
    pub static_prompt_version_hash: String,
    pub created_at: i64,
}

impl CHSystemPromptVersion {
    pub fn new(
        project_id: Uuid,
        trace_id: Uuid,
        span_id: Uuid,
        agent_hash: &str,
        static_prompt_version_hash: &str,
    ) -> Self {
        Self {
            project_id,
            trace_id,
            span_id,
            agent_hash: agent_hash.to_string(),
            static_prompt_version_hash: static_prompt_version_hash.to_string(),
            created_at: chrono_to_nanoseconds(chrono::Utc::now()),
        }
    }
}

pub async fn insert_system_prompt_versions(
    clickhouse: &clickhouse::Client,
    rows: &[CHSystemPromptVersion],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHSystemPromptVersion>("system_prompt_versions")
        .await
        .map_err(|e| anyhow::anyhow!("Failed to start system_prompt_versions insert: {e:?}"))?
        .with_setting("wait_for_async_insert", "0");
    for row in rows {
        insert.write(row).await?;
    }
    insert
        .end()
        .await
        .map_err(|e| anyhow::anyhow!("system_prompt_versions insert failed: {e:?}"))
}

/// Journal row written once per version MINT (`system_prompt_version_defs`):
/// the static skeleton as text — the registry keeps only one-way line hashes —
/// plus the provenance needed to audit a mint (which rule allowed it, how
/// populated the window was, which span triggered it). Nothing in the pipeline
/// reads this table.
#[derive(Row, Serialize, Debug, Clone)]
pub struct CHSystemPromptVersionDef {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
    pub version_hash: String,
    pub static_text: String,
    pub static_lines: u32,
    pub cluster_size: u16,
    pub window_len: u16,
    pub mint_gate: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub example_trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub example_span_id: Uuid,
    pub created_at: i64,
}

/// Runaway guard only — a version's text is useless truncated, and real system
/// prompts sit far below this.
const STATIC_TEXT_MAX_CHARS: usize = 131_072;

impl CHSystemPromptVersionDef {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        project_id: Uuid,
        agent_hash: &str,
        version_hash: &str,
        static_text: &str,
        static_lines: usize,
        cluster_size: usize,
        window_len: usize,
        mint_gate: &str,
        example_trace_id: Uuid,
        example_span_id: Uuid,
    ) -> Self {
        Self {
            project_id,
            agent_hash: agent_hash.to_string(),
            version_hash: version_hash.to_string(),
            static_text: truncate_chars(&sanitize_string(static_text), STATIC_TEXT_MAX_CHARS),
            static_lines: static_lines as u32,
            cluster_size: cluster_size as u16,
            window_len: window_len as u16,
            mint_gate: mint_gate.to_string(),
            example_trace_id,
            example_span_id,
            created_at: chrono_to_nanoseconds(chrono::Utc::now()),
        }
    }
}

pub async fn insert_system_prompt_version_def(
    clickhouse: &clickhouse::Client,
    row: &CHSystemPromptVersionDef,
) -> Result<()> {
    let mut insert = clickhouse
        .insert::<CHSystemPromptVersionDef>("system_prompt_version_defs")
        .await
        .map_err(|e| anyhow::anyhow!("Failed to start system_prompt_version_defs insert: {e:?}"))?
        .with_setting("wait_for_async_insert", "0");
    insert.write(row).await?;
    insert
        .end()
        .await
        .map_err(|e| anyhow::anyhow!("system_prompt_version_defs insert failed: {e:?}"))
}

#[derive(Row, Deserialize, Debug)]
struct SpanInputRow {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    input: String,
}

#[derive(Row, Deserialize, Debug)]
struct VersionSpanRefRow {
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
}

/// Version the classifier recorded for one span, if any — the summarizer's
/// fallback when the byte-identity memo has expired (backfill, old traces).
/// Newest row wins on at-least-once redelivery duplicates.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn fetch_span_version(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
) -> Result<Option<String>> {
    #[derive(Row, Deserialize)]
    struct VersionRow {
        static_prompt_version_hash: String,
    }
    let row = clickhouse
        .query(
            "SELECT static_prompt_version_hash
             FROM system_prompt_versions
             WHERE project_id = {project_id:UUID}
               AND trace_id = {trace_id:UUID}
               AND span_id = {span_id:UUID}
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .param("project_id", project_id)
        .param("trace_id", trace_id)
        .param("span_id", span_id)
        .fetch_optional::<VersionRow>()
        .await?;
    Ok(row.map(|r| r.static_prompt_version_hash))
}

/// Recent spans that classified to the given version, at most one per trace
/// (steps within a trace usually carry the byte-identical prompt, while
/// distinct traces carry distinct dynamic content), newest traces first.
/// Feeds the demand-driven regex extraction worker's sample refetch. The
/// `created_at` bound matches the version registry TTL — older rows belong
/// to versions the registry has forgotten anyway.
pub async fn fetch_recent_version_span_refs(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    version_hash: &str,
    limit: usize,
) -> Result<Vec<(Uuid, Uuid)>> {
    let ttl_days = crate::env::static_sp::VERSION_TTL_SECONDS
        .get()
        .div_ceil(24 * 3600);
    let rows = clickhouse
        .query(
            "SELECT trace_id, argMax(span_id, created_at) AS span_id
             FROM system_prompt_versions
             WHERE project_id = {project_id:UUID}
               AND static_prompt_version_hash = {version_hash:String}
               AND created_at >= now64(9) - INTERVAL {ttl_days:UInt64} DAY
             GROUP BY trace_id
             ORDER BY max(created_at) DESC
             LIMIT {limit:UInt64}",
        )
        .param("project_id", project_id)
        .param("version_hash", version_hash)
        .param("ttl_days", ttl_days)
        .param("limit", limit as u64)
        .fetch_all::<VersionSpanRefRow>()
        .await?;
    Ok(rows.into_iter().map(|r| (r.trace_id, r.span_id)).collect())
}

/// Fetch the SYSTEM PROMPT text of the given spans, keyed by span id.
///
/// Reads the reconstructed message-array `input` through `spans_v0` (dedup'd
/// spans store an empty raw `spans.input`; the view rebuilds it from the
/// content dictionaries — same pattern as the debugger warmup). Spans whose
/// input yields no extractable system message are absent from the result;
/// callers must tolerate partial fetches (a span may also not have flushed
/// to ClickHouse yet).
pub async fn fetch_system_prompts(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    refs: &[(Uuid, Uuid)],
) -> Result<HashMap<Uuid, String>> {
    if refs.is_empty() {
        return Ok(HashMap::new());
    }
    let trace_ids: Vec<Uuid> = refs.iter().map(|(t, _)| *t).collect();
    let span_ids: Vec<Uuid> = refs.iter().map(|(_, s)| *s).collect();

    let rows = clickhouse
        .query(
            "SELECT span_id, input
             FROM spans_v0(project_id={project_id:UUID})
             WHERE trace_id IN {trace_ids:Array(UUID)}
               AND span_id IN {span_ids:Array(UUID)}",
        )
        .param("project_id", project_id)
        .param("trace_ids", trace_ids)
        .param("span_ids", span_ids)
        .fetch_all::<SpanInputRow>()
        .await?;

    let mut prompts = HashMap::with_capacity(rows.len());
    for row in rows {
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&row.input) else {
            continue;
        };
        if let Some((system_text, _)) = extract_system_message(&parsed) {
            prompts.insert(row.span_id, system_text);
        }
    }
    Ok(prompts)
}
