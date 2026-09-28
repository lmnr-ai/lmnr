//! Versioning tables. Each [`VersionKind`] has its own pair
//! (`system_prompt_*`, `user_template_*`), both written by the versioning
//! consumer:
//!   - `*_versions` — one row per SPAN, its resolved version. Write-once: rows
//!     are never corrected after insert (transition-window spans keep the
//!     version resolved at classification time).
//!   - `*_version_defs` — one row per MINT, carrying the version's static text
//!     and provenance. An analysis journal; nothing reads it.
//!
//! The kinds' columns differ (the version column's name, and `has_history`,
//! which only user templates are partitioned by), so callers work with the
//! kind-neutral [`SpanVersion`] / [`VersionDef`] and this module maps them
//! onto each table's row type.

use std::collections::HashMap;

use anyhow::Result;
use clickhouse::{Row, RowOwned, RowWrite};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::utils::chrono_to_nanoseconds;
use crate::traces::prompt_hash::extract_system_message;
use crate::traces::sp_versioning::VersionKind;
use crate::utils::{sanitize_string, truncate_chars};

/// One span's resolved version, for either kind.
#[derive(Debug, Clone)]
pub struct SpanVersion {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub agent_hash: String,
    /// Turn position of the versioned text. Stored for user templates only.
    pub has_history: bool,
    pub version_hash: String,
    pub created_at: i64,
}

impl SpanVersion {
    pub fn new(
        project_id: Uuid,
        trace_id: Uuid,
        span_id: Uuid,
        agent_hash: &str,
        has_history: bool,
        version_hash: &str,
    ) -> Self {
        Self {
            project_id,
            trace_id,
            span_id,
            agent_hash: agent_hash.to_string(),
            has_history,
            version_hash: version_hash.to_string(),
            created_at: chrono_to_nanoseconds(chrono::Utc::now()),
        }
    }
}

/// The column holding a span's version. System prompts keep the name their
/// table shipped with; must match the row types below.
fn version_column(kind: VersionKind) -> &'static str {
    match kind {
        VersionKind::SystemPrompt => "static_prompt_version_hash",
        VersionKind::UserTemplate => "version_hash",
    }
}

#[derive(Row, Serialize, Debug, Clone)]
struct CHSystemPromptVersion {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    agent_hash: String,
    static_prompt_version_hash: String,
    created_at: i64,
}

impl From<&SpanVersion> for CHSystemPromptVersion {
    fn from(row: &SpanVersion) -> Self {
        Self {
            project_id: row.project_id,
            trace_id: row.trace_id,
            span_id: row.span_id,
            agent_hash: row.agent_hash.clone(),
            static_prompt_version_hash: row.version_hash.clone(),
            created_at: row.created_at,
        }
    }
}

#[derive(Row, Serialize, Debug, Clone)]
struct CHUserTemplateVersion {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    agent_hash: String,
    has_history: bool,
    version_hash: String,
    created_at: i64,
}

impl From<&SpanVersion> for CHUserTemplateVersion {
    fn from(row: &SpanVersion) -> Self {
        Self {
            project_id: row.project_id,
            trace_id: row.trace_id,
            span_id: row.span_id,
            agent_hash: row.agent_hash.clone(),
            has_history: row.has_history,
            version_hash: row.version_hash.clone(),
            created_at: row.created_at,
        }
    }
}

pub async fn insert_version_rows(
    clickhouse: &clickhouse::Client,
    kind: VersionKind,
    rows: &[SpanVersion],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let table = kind.tables().versions;
    match kind {
        VersionKind::SystemPrompt => {
            let rows: Vec<CHSystemPromptVersion> = rows.iter().map(Into::into).collect();
            insert_rows(clickhouse, table, &rows).await
        }
        VersionKind::UserTemplate => {
            let rows: Vec<CHUserTemplateVersion> = rows.iter().map(Into::into).collect();
            insert_rows(clickhouse, table, &rows).await
        }
    }
}

async fn insert_rows<T: RowOwned + RowWrite>(
    clickhouse: &clickhouse::Client,
    table: &str,
    rows: &[T],
) -> Result<()> {
    let mut insert = clickhouse
        .insert::<T>(table)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to start {table} insert: {e:?}"))?
        .with_setting("wait_for_async_insert", "0");
    for row in rows {
        insert.write(row).await?;
    }
    insert
        .end()
        .await
        .map_err(|e| anyhow::anyhow!("{table} insert failed: {e:?}"))
}

/// Journal row written once per version MINT (`*_version_defs`), for either
/// kind: the static skeleton as text — the registry keeps only one-way line
/// hashes — plus the provenance needed to audit a mint (which rule allowed it,
/// how populated the window was, which span triggered it). Nothing in the
/// pipeline reads these tables.
#[derive(Debug, Clone)]
pub struct VersionDef {
    pub project_id: Uuid,
    pub agent_hash: String,
    /// Turn position of the minting partition. Stored for user templates only.
    pub has_history: bool,
    pub version_hash: String,
    pub static_text: String,
    pub static_lines: u32,
    pub cluster_size: u16,
    pub window_len: u16,
    pub mint_gate: String,
    pub example_trace_id: Uuid,
    pub example_span_id: Uuid,
    pub created_at: i64,
}

/// Runaway guard only — a version's text is useless truncated, and real system
/// prompts sit far below this.
const STATIC_TEXT_MAX_CHARS: usize = 131_072;

impl VersionDef {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        project_id: Uuid,
        agent_hash: &str,
        has_history: bool,
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
            has_history,
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

#[derive(Row, Serialize, Debug, Clone)]
struct CHSystemPromptVersionDef {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    agent_hash: String,
    version_hash: String,
    static_text: String,
    static_lines: u32,
    cluster_size: u16,
    window_len: u16,
    mint_gate: String,
    #[serde(with = "clickhouse::serde::uuid")]
    example_trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    example_span_id: Uuid,
    created_at: i64,
}

impl From<&VersionDef> for CHSystemPromptVersionDef {
    fn from(def: &VersionDef) -> Self {
        Self {
            project_id: def.project_id,
            agent_hash: def.agent_hash.clone(),
            version_hash: def.version_hash.clone(),
            static_text: def.static_text.clone(),
            static_lines: def.static_lines,
            cluster_size: def.cluster_size,
            window_len: def.window_len,
            mint_gate: def.mint_gate.clone(),
            example_trace_id: def.example_trace_id,
            example_span_id: def.example_span_id,
            created_at: def.created_at,
        }
    }
}

#[derive(Row, Serialize, Debug, Clone)]
struct CHUserTemplateVersionDef {
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    agent_hash: String,
    has_history: bool,
    version_hash: String,
    static_text: String,
    static_lines: u32,
    cluster_size: u16,
    window_len: u16,
    mint_gate: String,
    #[serde(with = "clickhouse::serde::uuid")]
    example_trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    example_span_id: Uuid,
    created_at: i64,
}

impl From<&VersionDef> for CHUserTemplateVersionDef {
    fn from(def: &VersionDef) -> Self {
        Self {
            project_id: def.project_id,
            agent_hash: def.agent_hash.clone(),
            has_history: def.has_history,
            version_hash: def.version_hash.clone(),
            static_text: def.static_text.clone(),
            static_lines: def.static_lines,
            cluster_size: def.cluster_size,
            window_len: def.window_len,
            mint_gate: def.mint_gate.clone(),
            example_trace_id: def.example_trace_id,
            example_span_id: def.example_span_id,
            created_at: def.created_at,
        }
    }
}

pub async fn insert_version_def(
    clickhouse: &clickhouse::Client,
    kind: VersionKind,
    def: &VersionDef,
) -> Result<()> {
    let table = kind.tables().defs;
    match kind {
        VersionKind::SystemPrompt => {
            insert_rows(clickhouse, table, &[CHSystemPromptVersionDef::from(def)]).await
        }
        VersionKind::UserTemplate => {
            insert_rows(clickhouse, table, &[CHUserTemplateVersionDef::from(def)]).await
        }
    }
}

#[derive(Row, Deserialize, Debug)]
struct SpanInputRow {
    #[serde(with = "clickhouse::serde::uuid")]
    span_id: Uuid,
    input: String,
}

/// One trace that classified to a version: its newest span and when that
/// span was classified (nanoseconds).
#[derive(Row, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct VersionSpanRef {
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    /// Aliased in SQL as `last_created_at`: naming the aggregate `created_at`
    /// would shadow the column in the query's `WHERE` (ClickHouse alias scope).
    #[serde(rename = "last_created_at")]
    pub created_at: i64,
}

/// Version the classifier recorded for one span, if any — the fallback when
/// the memo has expired (the summarizer's backfill and old traces, the
/// user-task worker's re-resolution). Newest row wins on at-least-once
/// redelivery duplicates.
pub async fn fetch_span_version(
    clickhouse: &clickhouse::Client,
    kind: VersionKind,
    project_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
) -> Result<Option<String>> {
    #[derive(Row, Deserialize)]
    struct VersionRow {
        version_hash: String,
    }
    let query = format!(
        "SELECT {} AS version_hash
         FROM {}
         WHERE project_id = {{project_id:UUID}}
           AND trace_id = {{trace_id:UUID}}
           AND span_id = {{span_id:UUID}}
         ORDER BY created_at DESC
         LIMIT 1",
        version_column(kind),
        kind.tables().versions
    );
    let row = clickhouse
        .query(&query)
        .param("project_id", project_id)
        .param("trace_id", trace_id)
        .param("span_id", span_id)
        .fetch_optional::<VersionRow>()
        .await?;
    Ok(row.map(|r| r.version_hash))
}

/// A uniform random sample of up to `limit` traces that classified to the
/// given version, one ref per trace (steps within a trace usually carry the
/// byte-identical prompt, while distinct traces carry distinct dynamic
/// content). This is the sample POOL for the demand-driven regex extraction
/// worker, which spreads its picks across the pool's time range — so the pool
/// must cover the version's whole lifetime, not its newest slice: taking the
/// newest `limit` traces would confine a high-volume version's pool to minutes
/// and starve it at the span gate. Each call is a fresh draw, so a demand
/// retry does not replay the pool that just failed a gate. The `created_at`
/// bound matches the version registry TTL — older rows belong to versions the
/// registry has forgotten anyway.
pub async fn fetch_version_span_refs(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    version_hash: &str,
    limit: usize,
) -> Result<Vec<VersionSpanRef>> {
    let ttl_days = crate::env::static_sp::VERSION_TTL_SECONDS
        .get()
        .div_ceil(24 * 3600);
    let rows = clickhouse
        .query(
            "SELECT trace_id,
                    argMax(span_id, created_at) AS span_id,
                    max(created_at) AS last_created_at
             FROM system_prompt_versions
             WHERE project_id = {project_id:UUID}
               AND static_prompt_version_hash = {version_hash:String}
               AND created_at >= now64(9) - INTERVAL {ttl_days:UInt64} DAY
             GROUP BY trace_id
             ORDER BY rand()
             LIMIT {limit:UInt64}",
        )
        .param("project_id", project_id)
        .param("version_hash", version_hash)
        .param("ttl_days", ttl_days)
        .param("limit", limit as u64)
        .fetch_all::<VersionSpanRef>()
        .await?;
    Ok(rows)
}

/// Fetch the SYSTEM PROMPT text of the given spans, keyed by span id.
///
/// Reads the reconstructed message-array `input` through `spans_v1` (dedup'd
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
             FROM spans_v1(project_id={project_id:UUID}, policy='{}')
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
