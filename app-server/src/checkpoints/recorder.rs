//! Records one system-prompt or tool-definition versioning batch as agent
//! versions.
//!
//! A span's agent version needs both of its versions. Each consumer writes its
//! own memo before recording and reads the other kind's memo here, so whichever
//! finishes second sees both and records; when both see both, the second
//! record is a no-op. A missing memo falls back to the other kind's
//! ClickHouse version row, which outlives the memo.
//!
//! Best-effort throughout: a failure is logged and the next span presenting
//! the same version retries it. A version whose tool text isn't readable yet
//! is deferred the same way, without a Postgres row.

use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use uuid::Uuid;

use super::{naming::generate_agent_name, version::version_hash};
use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            AGENT_CACHE_KEY, AGENT_NAMING_LOCK_CACHE_KEY, AGENT_TRACE_TAG_CACHE_KEY,
            AGENT_VERSION_ID_CACHE_KEY, AGENT_VERSION_MODEL_CACHE_KEY,
        },
    },
    ch::{
        ClickhouseTrait,
        cloud::CloudClickhouse,
        system_prompt_versions::{SpanVersion, fetch_span_versions, fetch_version_static_text},
        traces_agg::{CHTraceAgentVersion, CHTraceAgg},
        unique_content::get_content_by_hash,
        utils::chrono_to_nanoseconds,
    },
    db::{
        DB,
        agents::{self, NewAgentVersion},
        spans::Span,
    },
    llm::LlmClient,
    traces::{
        dedup::{span_group_id, tool_normalize::normalize_tools, tools::ToolDedup},
        sp_versioning::{VersionKind, consumer::SpVersioningMessage, similarity, versions},
    },
    utils::{sanitize_string, truncate_chars},
};

const ENTRY_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
/// Past this a trace's tuple may be tagged again; the set dedupes it.
const TRACE_TAG_TTL_SECONDS: u64 = 24 * 60 * 60;
/// Also the retry interval after a failed naming attempt.
const NAMING_LOCK_TTL_SECONDS: u64 = 10 * 60;
const MODEL_MAX_CHARS: usize = 256;

/// One LLM span's agent-versioning inputs, captured on the ingest producer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSpan {
    pub span_id: Uuid,
    /// Nanoseconds; never before the trace's start, so it is a safe
    /// `traces_agg.start_time` for the trace's tag partial.
    pub start_time: i64,
    /// Response model, else request model; empty when neither is reported.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub model: String,
    /// Content hash of the tool set's versioning text: the tool-definition
    /// memo key. Empty without tools.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tool_full_hash: String,
    /// The tool-definition version when the ingest producer resolved it
    /// finally (memo hit or unprobed subset match).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_version: Option<String>,
    /// The span's `full_prompt_hash`: the system-prompt memo key.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub system_prompt_full_hash: String,
    /// Hex dedup hash of the tool blob: its `unique_content` key.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tool_content_hash: String,
    /// The span's `unique_content` group.
    pub group_id: String,
}

impl AgentSpan {
    pub fn from_span(
        span: &Span,
        tools: Option<&ToolDedup>,
        system_prompt_full_hash: &str,
    ) -> Self {
        let model = span
            .attributes
            .response_model()
            .filter(|m| !m.trim().is_empty())
            .or_else(|| span.attributes.request_model())
            .map(|m| truncate_chars(&sanitize_string(m.trim()), MODEL_MAX_CHARS))
            .unwrap_or_default();
        // A set that normalizes to nothing counts as no tools.
        let (tool_full_hash, tool_content_hash) = tools
            .and_then(|t| {
                let text = t
                    .versioning_text
                    .as_deref()
                    .filter(|text| !text.is_empty())?;
                Some((similarity::full_prompt_hash(text), hex::encode(t.hash)))
            })
            .unwrap_or_default();
        Self {
            span_id: span.span_id,
            start_time: chrono_to_nanoseconds(span.start_time),
            model,
            tool_full_hash,
            tool_version: None,
            system_prompt_full_hash: system_prompt_full_hash.to_string(),
            tool_content_hash,
            group_id: span_group_id(span),
        }
    }
}

/// A span whose system-prompt and tool-definition versions are both final,
/// joined with its inputs.
struct VersionedSpan<'a> {
    project_id: Uuid,
    trace_id: Uuid,
    agent_hash: &'a str,
    system_prompt_version_hash: String,
    /// Empty without tools.
    tool_version: String,
    version_hash: String,
    inputs: &'a AgentSpan,
    /// The raw prompt when it rode the wire; seeds agent naming.
    system_prompt: &'a str,
}

/// A span whose other version had no memo, joined with its inputs.
struct PendingSpan<'a> {
    span_version: &'a SpanVersion,
    inputs: &'a AgentSpan,
    system_prompt: &'a str,
}

#[derive(Default)]
struct JoinedSpans<'a> {
    spans: Vec<VersionedSpan<'a>>,
    /// For the ClickHouse fallback.
    pending: Vec<PendingSpan<'a>>,
}

/// The kind a span's `kind` version is joined with.
fn other_kind(kind: VersionKind) -> VersionKind {
    match kind {
        VersionKind::ToolDefinitions => VersionKind::SystemPrompt,
        _ => VersionKind::ToolDefinitions,
    }
}

fn versioned_span<'a>(
    kind: VersionKind,
    span_version: &'a SpanVersion,
    inputs: &'a AgentSpan,
    system_prompt: &'a str,
    other_version: String,
) -> VersionedSpan<'a> {
    let (system_prompt_version_hash, tool_version, system_prompt) = match kind {
        // This message's body is tool text; naming falls back to the
        // version's static prompt.
        VersionKind::ToolDefinitions => (other_version, span_version.version_hash.clone(), ""),
        _ => (
            span_version.version_hash.clone(),
            other_version,
            system_prompt,
        ),
    };
    VersionedSpan {
        project_id: span_version.project_id,
        trace_id: span_version.trace_id,
        agent_hash: &span_version.agent_hash,
        version_hash: version_hash(
            &span_version.agent_hash,
            &system_prompt_version_hash,
            &tool_version,
        ),
        system_prompt_version_hash,
        tool_version,
        inputs,
        system_prompt,
    }
}

/// Joins `span_versions` (versions of `kind`) with their messages' inputs and
/// the other kind's version from its memo. Spans without that memo are
/// `pending`.
async fn join_spans<'a>(
    cache: &Cache,
    kind: VersionKind,
    messages: &'a [SpVersioningMessage],
    span_versions: &'a [SpanVersion],
) -> JoinedSpans<'a> {
    let mut joined = JoinedSpans::default();
    if kind == VersionKind::UserTemplate {
        return joined;
    }
    let inputs: HashMap<(Uuid, Uuid), (&AgentSpan, &str)> = messages
        .iter()
        .flat_map(|message| {
            message.agent_spans.iter().map(move |span| {
                (
                    (message.project_id, span.span_id),
                    (span, message.system_prompt.as_str()),
                )
            })
        })
        .collect();
    let mut memos = MemoLookups::default();
    for span_version in span_versions {
        let Some(&(inputs, text)) = inputs.get(&(span_version.project_id, span_version.span_id))
        else {
            continue;
        };
        let other_full_hash = match kind {
            VersionKind::ToolDefinitions => {
                // Resolved inline, so the system-prompt side already has it.
                if inputs.tool_version.is_some() {
                    continue;
                }
                &inputs.system_prompt_full_hash
            }
            _ => {
                let known = if inputs.tool_full_hash.is_empty() {
                    // Tools without a versioning hash: a message from before
                    // tool-definition versioning. Never record it as tool-less.
                    if !inputs.tool_content_hash.is_empty() {
                        continue;
                    }
                    Some(String::new())
                } else {
                    inputs.tool_version.clone()
                };
                if let Some(tool_version) = known {
                    joined.spans.push(versioned_span(
                        kind,
                        span_version,
                        inputs,
                        text,
                        tool_version,
                    ));
                    continue;
                }
                &inputs.tool_full_hash
            }
        };
        match memos
            .get(cache, other_kind(kind), span_version, other_full_hash)
            .await
        {
            Some(other_version) => joined.spans.push(versioned_span(
                kind,
                span_version,
                inputs,
                text,
                other_version,
            )),
            None => joined.pending.push(PendingSpan {
                span_version,
                inputs,
                system_prompt: text,
            }),
        }
    }
    joined
}

/// Joins `pending` with the other kind's version rows, keyed by
/// `(project_id, trace_id, span_id)`. Spans without a row are dropped: the
/// other kind's consumer hasn't resolved them yet, and records them when it does.
fn join_pending<'a>(
    kind: VersionKind,
    pending: Vec<PendingSpan<'a>>,
    rows: &HashMap<(Uuid, Uuid, Uuid), String>,
) -> Vec<VersionedSpan<'a>> {
    pending
        .into_iter()
        .filter_map(|p| {
            let key = (
                p.span_version.project_id,
                p.span_version.trace_id,
                p.span_version.span_id,
            );
            let other_version = rows.get(&key)?.clone();
            Some(versioned_span(
                kind,
                p.span_version,
                p.inputs,
                p.system_prompt,
                other_version,
            ))
        })
        .collect()
}

/// Memo reads for one batch, deduped: a batch's spans mostly share texts.
#[derive(Default)]
struct MemoLookups {
    results: HashMap<(Uuid, String, String), Option<String>>,
}

impl MemoLookups {
    /// `kind`'s version of the text hashing to `full_hash`, in `span_version`'s agent.
    async fn get(
        &mut self,
        cache: &Cache,
        kind: VersionKind,
        span_version: &SpanVersion,
        full_hash: &str,
    ) -> Option<String> {
        if full_hash.is_empty() {
            return None;
        }
        let key = (
            span_version.project_id,
            span_version.agent_hash.clone(),
            full_hash.to_string(),
        );
        if let Some(version) = self.results.get(&key) {
            return version.clone();
        }
        let version = versions::memo_get(
            cache,
            kind,
            span_version.project_id,
            &kind.partition(&span_version.agent_hash, false),
            full_hash,
        )
        .await;
        self.results.insert(key, version.clone());
        version
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct CachedAgent {
    id: Uuid,
    named: bool,
}

pub struct CheckpointRecorder {
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    /// Agent versioning only runs for cloud workspaces.
    cloud_clickhouse: CloudClickhouse,
    llm_client: Option<Arc<LlmClient>>,
}

impl CheckpointRecorder {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        clickhouse: clickhouse::Client,
        llm_client: Option<Arc<LlmClient>>,
    ) -> Self {
        Self {
            db,
            cache,
            cloud_clickhouse: CloudClickhouse::new(clickhouse.clone()),
            clickhouse,
            llm_client,
        }
    }

    pub async fn record(
        &self,
        kind: VersionKind,
        messages: &[SpVersioningMessage],
        span_versions: &[SpanVersion],
    ) {
        let JoinedSpans { mut spans, pending } =
            join_spans(&self.cache, kind, messages, span_versions).await;
        if !pending.is_empty() {
            let rows = self.other_version_rows(kind, &pending).await;
            spans.extend(join_pending(kind, pending, &rows));
        }
        if spans.is_empty() {
            return;
        }

        let mut spans_by_version: IndexMap<(Uuid, &str), Vec<&VersionedSpan>> = IndexMap::new();
        for span in &spans {
            spans_by_version
                .entry((span.project_id, span.version_hash.as_str()))
                .or_default()
                .push(span);
        }
        let mut agents: HashMap<(Uuid, &str), CachedAgent> = HashMap::new();
        let mut version_ids: HashMap<(Uuid, &str), Uuid> = HashMap::new();
        for version_spans in spans_by_version.into_values() {
            let span = version_spans[0];
            let agent_key = (span.project_id, span.agent_hash);
            let agent = match agents.get(&agent_key) {
                Some(agent) => *agent,
                None => match self.ensure_agent(span).await {
                    Ok(agent) => *agents.entry(agent_key).or_insert(agent),
                    Err(e) => {
                        log::warn!(
                            "[CHECKPOINTS] Failed to upsert agent {}: {e:?}",
                            span.agent_hash
                        );
                        continue;
                    }
                },
            };
            match self.ensure_version(&version_spans, agent.id).await {
                Ok(Some(id)) => {
                    version_ids.insert((span.project_id, span.version_hash.as_str()), id);
                    // Naming waits for a version so a deferred-only agent costs no LLM call.
                    if !agent.named {
                        self.spawn_naming(span, agent.id).await;
                    }
                }
                Ok(None) => log::debug!(
                    "[CHECKPOINTS] Deferring version {}: tool definitions not readable yet or version_number race lost",
                    span.version_hash
                ),
                Err(e) => log::warn!(
                    "[CHECKPOINTS] Failed to record version {}: {e:?}",
                    span.version_hash
                ),
            }
        }

        for span in &spans {
            let Some(version_id) = version_ids.get(&(span.project_id, span.version_hash.as_str()))
            else {
                continue;
            };
            if let Err(e) = self.ensure_model(span, *version_id).await {
                log::warn!(
                    "[CHECKPOINTS] Failed to record model {} for version {}: {e:?}",
                    span.inputs.model,
                    span.version_hash
                );
            }
        }

        self.tag_traces(&spans).await;
    }

    /// The other kind's version rows for `pending`, one query per project. A
    /// memo can expire after its consumer recorded, and the span's row outlives
    /// it; without this the span's trace would never be tagged.
    async fn other_version_rows(
        &self,
        kind: VersionKind,
        pending: &[PendingSpan<'_>],
    ) -> HashMap<(Uuid, Uuid, Uuid), String> {
        let mut refs: HashMap<Uuid, Vec<(Uuid, Uuid)>> = HashMap::new();
        for p in pending {
            refs.entry(p.span_version.project_id)
                .or_default()
                .push((p.span_version.trace_id, p.span_version.span_id));
        }
        let mut rows = HashMap::new();
        for (project_id, refs) in refs {
            match fetch_span_versions(&self.clickhouse, other_kind(kind), project_id, &refs).await {
                Ok(versions) => rows.extend(
                    versions
                        .into_iter()
                        .map(|((trace_id, span_id), v)| ((project_id, trace_id, span_id), v)),
                ),
                // Same as a memo miss: the next span presenting these texts records.
                Err(e) => log::warn!(
                    "[CHECKPOINTS] Failed to fetch {} rows for {} spans: {e:?}",
                    other_kind(kind).tables().versions,
                    refs.len()
                ),
            }
        }
        rows
    }

    async fn ensure_agent(&self, span: &VersionedSpan<'_>) -> anyhow::Result<CachedAgent> {
        let key = agent_cache_key(span.project_id, span.agent_hash);
        if let Some(agent) = self.cached::<CachedAgent>(&key).await {
            return Ok(agent);
        }
        let row = agents::upsert_agent(&self.db.pool, span.project_id, span.agent_hash).await?;
        let agent = CachedAgent {
            id: row.id,
            named: row.name.is_some(),
        };
        remember(&self.cache, &key, agent, ENTRY_TTL_SECONDS).await;
        Ok(agent)
    }

    /// `spans` all present the same version. `None` defers the version: its
    /// tool text isn't readable yet, or it lost the `version_number` race.
    async fn ensure_version(
        &self,
        spans: &[&VersionedSpan<'_>],
        agent_id: Uuid,
    ) -> anyhow::Result<Option<Uuid>> {
        let span = spans[0];
        let key = format!(
            "{AGENT_VERSION_ID_CACHE_KEY}:{}:{}",
            span.project_id, span.version_hash
        );
        if let Some(id) = self.cached::<Uuid>(&key).await {
            return Ok(Some(id));
        }
        let id =
            match agents::get_agent_version_id(&self.db.pool, span.project_id, &span.version_hash)
                .await?
            {
                Some(id) => Some(id),
                None => self.create_version(spans, agent_id).await?,
            };
        if let Some(id) = id {
            remember(&self.cache, &key, id, ENTRY_TTL_SECONDS).await;
        }
        Ok(id)
    }

    async fn create_version(
        &self,
        spans: &[&VersionedSpan<'_>],
        agent_id: Uuid,
    ) -> anyhow::Result<Option<Uuid>> {
        let span = spans[0];
        let Some(tool_definitions) = self.tool_definitions(spans, agent_id).await? else {
            return Ok(None);
        };
        let version = NewAgentVersion {
            project_id: span.project_id,
            agent_id,
            version_hash: &span.version_hash,
            system_prompt_version_hash: &span.system_prompt_version_hash,
            tool_definitions_hash: &span.tool_version,
            tool_definitions: &tool_definitions,
        };
        if let Some(id) = agents::insert_agent_version(&self.db.pool, &version).await? {
            return Ok(Some(id));
        }
        // A conflict is a concurrent insert of this same version, or a lost race
        // for the next `version_number`, which defers the version.
        agents::get_agent_version_id(&self.db.pool, span.project_id, &span.version_hash).await
    }

    /// [`normalize_tools`] text of the version's tool set: from another version
    /// of the agent with the same tool version, else from the `unique_content`
    /// blob of the oldest of `spans`. The spans consumer may not have written
    /// it yet (`None`).
    async fn tool_definitions(
        &self,
        spans: &[&VersionedSpan<'_>],
        agent_id: Uuid,
    ) -> anyhow::Result<Option<String>> {
        let span = spans[0];
        if span.tool_version.is_empty() {
            return Ok(Some(String::new()));
        }
        if let Some(text) = agents::get_tool_definitions(
            &self.db.pool,
            span.project_id,
            agent_id,
            &span.tool_version,
        )
        .await?
        {
            return Ok(Some(text));
        }
        // The oldest span's blob is the likeliest to be written already.
        let oldest = spans
            .iter()
            .min_by_key(|s| s.inputs.start_time)
            .unwrap_or(&span);
        let Some(blob) = get_content_by_hash(
            &self.clickhouse,
            oldest.project_id,
            &oldest.inputs.group_id,
            &oldest.inputs.tool_content_hash,
        )
        .await?
        else {
            return Ok(None);
        };
        let tools: Vec<Value> = serde_json::from_str(&blob).with_context(|| {
            format!(
                "tool blob {} is not a JSON array",
                oldest.inputs.tool_content_hash
            )
        })?;
        Ok(Some(Value::Array(normalize_tools(&tools)).to_string()))
    }

    async fn ensure_model(&self, span: &VersionedSpan<'_>, version_id: Uuid) -> anyhow::Result<()> {
        let model = &span.inputs.model;
        if model.is_empty() {
            return Ok(());
        }
        let key = format!(
            "{AGENT_VERSION_MODEL_CACHE_KEY}:{}:{}:{model}",
            span.project_id, span.version_hash
        );
        if self.cache.exists(&key).await.unwrap_or(false) {
            return Ok(());
        }
        agents::insert_agent_version_model(&self.db.pool, span.project_id, version_id, model)
            .await?;
        remember(&self.cache, &key, true, ENTRY_TTL_SECONDS).await;
        Ok(())
    }

    /// One zero-sum `traces_agg` partial per trace, carrying only the tuples
    /// this trace hasn't been tagged with yet.
    async fn tag_traces(&self, spans: &[VersionedSpan<'_>]) {
        let mut partials: IndexMap<(Uuid, Uuid), CHTraceAgg> = IndexMap::new();
        let mut claims: Vec<String> = Vec::new();
        for span in spans {
            let key = format!(
                "{AGENT_TRACE_TAG_CACHE_KEY}:{}:{}:{}:{}",
                span.project_id, span.trace_id, span.version_hash, span.inputs.model
            );
            // On a cache error, tag anyway: the set absorbs a duplicate.
            match self
                .cache
                .try_acquire_lock(&key, TRACE_TAG_TTL_SECONDS)
                .await
            {
                Ok(true) => claims.push(key),
                Ok(false) => continue,
                Err(e) => log::warn!("[CHECKPOINTS] Failed to claim trace tag {key}: {e:?}"),
            }
            let partial = partials
                .entry((span.project_id, span.trace_id))
                .or_insert_with(|| {
                    CHTraceAgg::zero_sum_partial(
                        span.project_id,
                        span.trace_id,
                        span.inputs.start_time,
                    )
                });
            partial.start_time = partial.start_time.min(span.inputs.start_time);
            let tag = CHTraceAgentVersion {
                agent_hash: span.agent_hash.to_string(),
                version_hash: span.version_hash.clone(),
                model: span.inputs.model.clone(),
            };
            if !partial.agent_versions.contains(&tag) {
                partial.agent_versions.push(tag);
            }
        }
        if partials.is_empty() {
            return;
        }

        let rows: Vec<CHTraceAgg> = partials.into_values().collect();
        if let Err(e) = self.cloud_clickhouse.insert_batch(&rows, None).await {
            log::error!(
                "[CHECKPOINTS] Failed to insert {} trace tag partials: {e:?}",
                rows.len()
            );
            // Let the next span of these traces tag them again.
            for key in claims {
                let _ = self.cache.release_lock(&key).await;
            }
        }
    }

    /// Name the agent in the background, at most once per lock TTL.
    async fn spawn_naming(&self, span: &VersionedSpan<'_>, agent_id: Uuid) {
        let Some(llm_client) = self.llm_client.clone() else {
            return;
        };
        let lock_key = format!(
            "{AGENT_NAMING_LOCK_CACHE_KEY}:{}:{agent_id}",
            span.project_id
        );
        match self
            .cache
            .try_acquire_lock(&lock_key, NAMING_LOCK_TTL_SECONDS)
            .await
        {
            Ok(true) => {}
            Ok(false) => return,
            Err(e) => {
                log::warn!("[CHECKPOINTS] Failed to claim naming lock {lock_key}: {e:?}");
                return;
            }
        }
        let task = NamingTask {
            db: self.db.clone(),
            cache: self.cache.clone(),
            clickhouse: self.clickhouse.clone(),
            llm_client,
            project_id: span.project_id,
            agent_id,
            agent_hash: span.agent_hash.to_string(),
            system_prompt_version_hash: span.system_prompt_version_hash.clone(),
            system_prompt: span.system_prompt.to_string(),
        };
        tokio::spawn(async move {
            if let Err(e) = task.run().await {
                log::warn!(
                    "[CHECKPOINTS] Failed to name agent {}: {e:?}",
                    task.agent_id
                );
            }
        });
    }

    async fn cached<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.cache.get::<T>(key).await.unwrap_or_else(|e| {
            log::warn!("[CHECKPOINTS] Failed to read {key}: {e:?}");
            None
        })
    }
}

struct NamingTask {
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    llm_client: Arc<LlmClient>,
    project_id: Uuid,
    agent_id: Uuid,
    agent_hash: String,
    system_prompt_version_hash: String,
    system_prompt: String,
}

impl NamingTask {
    async fn run(&self) -> anyhow::Result<()> {
        if agents::get_agent_name(&self.db.pool, self.project_id, self.agent_id)
            .await?
            .is_none()
        {
            let prompt = self.prompt_text().await?;
            let name =
                generate_agent_name(&self.llm_client, self.project_id, self.agent_id, &prompt)
                    .await?;
            agents::set_agent_name(&self.db.pool, self.project_id, self.agent_id, &name).await?;
        }
        let agent = CachedAgent {
            id: self.agent_id,
            named: true,
        };
        remember(
            &self.cache,
            &agent_cache_key(self.project_id, &self.agent_hash),
            agent,
            ENTRY_TTL_SECONDS,
        )
        .await;
        Ok(())
    }

    /// The message's prompt when it carried one, else the version's static
    /// skeleton (slim messages ship no body).
    async fn prompt_text(&self) -> anyhow::Result<String> {
        if !self.system_prompt.trim().is_empty() {
            return Ok(self.system_prompt.clone());
        }
        fetch_version_static_text(
            &self.clickhouse,
            self.project_id,
            &self.agent_hash,
            &self.system_prompt_version_hash,
        )
        .await?
        .ok_or_else(|| anyhow::anyhow!("no prompt text to name the agent from yet"))
    }
}

fn agent_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{AGENT_CACHE_KEY}:{project_id}:{agent_hash}")
}

async fn remember<T: Serialize + Send>(cache: &Cache, key: &str, value: T, ttl_seconds: u64) {
    if let Err(e) = cache.insert_with_ttl(key, value, ttl_seconds).await {
        log::warn!("[CHECKPOINTS] Failed to cache {key}: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{cache::in_memory::InMemoryCache, traces::sp_versioning::window::SpanRef};

    fn agent_span(span_id: Uuid, tool_full_hash: &str) -> AgentSpan {
        AgentSpan {
            span_id,
            start_time: 1_700_000_000_000_000_000,
            model: "gpt-4o".to_string(),
            tool_full_hash: tool_full_hash.to_string(),
            tool_version: None,
            system_prompt_full_hash: "spfull".to_string(),
            tool_content_hash: if tool_full_hash.is_empty() {
                String::new()
            } else {
                "blob".to_string()
            },
            group_id: "group".to_string(),
        }
    }

    fn message(project_id: Uuid, agent_spans: Vec<AgentSpan>) -> SpVersioningMessage {
        SpVersioningMessage {
            project_id,
            system_prompt: "You are a test agent.".to_string(),
            agent_hash: "agent".to_string(),
            has_history: false,
            full_prompt_hash: "full".to_string(),
            line_hashes: Vec::new(),
            span_refs: agent_spans
                .iter()
                .map(|s| SpanRef {
                    trace_id: Uuid::new_v4(),
                    span_id: s.span_id,
                })
                .collect(),
            known_version_hash: None,
            cheap_matched_version: None,
            run_full: false,
            retry_count: 0,
            agent_spans,
        }
    }

    fn span_version(project_id: Uuid, span_id: Uuid, version: &str) -> SpanVersion {
        SpanVersion::new(project_id, Uuid::new_v4(), span_id, "agent", false, version)
    }

    fn cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(None))
    }

    async fn memo(cache: &Cache, kind: VersionKind, project_id: Uuid, full: &str, version: &str) {
        versions::memo_set(cache, kind, project_id, "agent", full, version).await;
    }

    #[tokio::test]
    async fn system_prompt_side_joins_known_tool_versions_only() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        let [known, inline, tool_less, pending, legacy, unknown] =
            std::array::from_fn(|_| Uuid::new_v4());
        memo(
            &cache,
            VersionKind::ToolDefinitions,
            project_id,
            "tfull",
            "t1",
        )
        .await;
        let mut inline_span = agent_span(inline, "other");
        inline_span.tool_version = Some("t2".to_string());
        let mut legacy_span = agent_span(legacy, "");
        legacy_span.tool_content_hash = "blob".to_string();
        let messages = [message(
            project_id,
            vec![
                agent_span(known, "tfull"),
                inline_span,
                agent_span(tool_less, ""),
                agent_span(pending, "unmemoized"),
                legacy_span,
            ],
        )];
        let span_versions = [known, inline, tool_less, pending, legacy, unknown]
            .map(|id| span_version(project_id, id, "sp1"));
        // Same span id under another project must not borrow the inputs.
        let other_project = [span_version(Uuid::new_v4(), known, "sp1")];

        let JoinedSpans {
            spans,
            pending: pending_spans,
        } = join_spans(&cache, VersionKind::SystemPrompt, &messages, &span_versions).await;
        let joined: Vec<(Uuid, &str)> = spans
            .iter()
            .map(|s| (s.inputs.span_id, s.tool_version.as_str()))
            .collect();
        assert_eq!(joined, vec![(known, "t1"), (inline, "t2"), (tool_less, "")]);
        assert_eq!(spans[0].version_hash, version_hash("agent", "sp1", "t1"));
        assert_eq!(spans[2].version_hash, version_hash("agent", "sp1", ""));
        assert_eq!(spans[0].system_prompt, "You are a test agent.");
        // Legacy and input-less spans never reach the fallback.
        let pending_ids: Vec<Uuid> = pending_spans.iter().map(|p| p.inputs.span_id).collect();
        assert_eq!(pending_ids, vec![pending]);
        let other = join_spans(&cache, VersionKind::SystemPrompt, &messages, &other_project).await;
        assert!(other.spans.is_empty() && other.pending.is_empty());
    }

    #[tokio::test]
    async fn tool_side_joins_known_system_prompt_versions_and_leaves_inline_ones() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        let [known, inline, pending] = std::array::from_fn(|_| Uuid::new_v4());
        memo(
            &cache,
            VersionKind::SystemPrompt,
            project_id,
            "spfull",
            "sp1",
        )
        .await;
        let mut inline_span = agent_span(inline, "tfull");
        inline_span.tool_version = Some("t1".to_string());
        let mut pending_span = agent_span(pending, "tfull");
        pending_span.system_prompt_full_hash = "unmemoized".to_string();
        let messages = [message(
            project_id,
            vec![agent_span(known, "tfull"), inline_span, pending_span],
        )];
        let span_versions = [known, inline, pending].map(|id| span_version(project_id, id, "t1"));

        let JoinedSpans {
            spans,
            pending: pending_spans,
        } = join_spans(
            &cache,
            VersionKind::ToolDefinitions,
            &messages,
            &span_versions,
        )
        .await;
        // The inline span is the system-prompt side's to record, even without
        // a memo.
        let pending_ids: Vec<Uuid> = pending_spans.iter().map(|p| p.inputs.span_id).collect();
        assert_eq!(pending_ids, vec![pending]);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].inputs.span_id, known);
        assert_eq!(spans[0].system_prompt_version_hash, "sp1");
        assert_eq!(spans[0].tool_version, "t1");
        assert_eq!(spans[0].version_hash, version_hash("agent", "sp1", "t1"));
        assert_eq!(spans[0].system_prompt, "", "the body is tool text");
    }

    /// Both sides of one span derive the same agent version, so a double
    /// record converges on one row.
    #[tokio::test]
    async fn both_sides_agree_on_the_agent_version() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        let span_id = Uuid::new_v4();
        memo(
            &cache,
            VersionKind::SystemPrompt,
            project_id,
            "spfull",
            "sp1",
        )
        .await;
        memo(
            &cache,
            VersionKind::ToolDefinitions,
            project_id,
            "tfull",
            "t1",
        )
        .await;
        let messages = [message(project_id, vec![agent_span(span_id, "tfull")])];

        let sp_rows = [span_version(project_id, span_id, "sp1")];
        let tool_rows = [span_version(project_id, span_id, "t1")];
        let from_sp = join_spans(&cache, VersionKind::SystemPrompt, &messages, &sp_rows).await;
        let from_tools =
            join_spans(&cache, VersionKind::ToolDefinitions, &messages, &tool_rows).await;
        assert_eq!(
            from_sp.spans[0].version_hash,
            from_tools.spans[0].version_hash
        );
    }

    /// With both memos expired, each side's fallback row yields the agent
    /// version the memo path would have.
    #[tokio::test]
    async fn fallback_rows_resolve_pending_spans_to_the_same_agent_version() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        let [span_id, unresolved] = std::array::from_fn(|_| Uuid::new_v4());
        let messages = [message(
            project_id,
            vec![
                agent_span(span_id, "tfull"),
                agent_span(unresolved, "tfull"),
            ],
        )];
        let sp_rows = [
            span_version(project_id, span_id, "sp1"),
            span_version(project_id, unresolved, "sp1"),
        ];
        let tool_rows = [
            SpanVersion {
                trace_id: sp_rows[0].trace_id,
                ..span_version(project_id, span_id, "t1")
            },
            SpanVersion {
                trace_id: sp_rows[1].trace_id,
                ..span_version(project_id, unresolved, "t1")
            },
        ];
        let key = |row: &SpanVersion| (row.project_id, row.trace_id, row.span_id);
        // Only `span_id` has the other kind's row; `unresolved` isn't classified yet.
        let tool_side_rows = HashMap::from([(key(&tool_rows[0]), "t1".to_string())]);
        let sp_side_rows = HashMap::from([(key(&sp_rows[0]), "sp1".to_string())]);

        let from_sp = join_spans(&cache, VersionKind::SystemPrompt, &messages, &sp_rows).await;
        assert!(from_sp.spans.is_empty());
        let from_sp = join_pending(VersionKind::SystemPrompt, from_sp.pending, &tool_side_rows);
        let from_tools =
            join_spans(&cache, VersionKind::ToolDefinitions, &messages, &tool_rows).await;
        let from_tools = join_pending(
            VersionKind::ToolDefinitions,
            from_tools.pending,
            &sp_side_rows,
        );

        assert_eq!(from_sp.len(), 1);
        assert_eq!(from_tools.len(), 1);
        assert_eq!(from_sp[0].inputs.span_id, span_id);
        assert_eq!(from_sp[0].version_hash, version_hash("agent", "sp1", "t1"));
        assert_eq!(from_sp[0].version_hash, from_tools[0].version_hash);
        assert_eq!(from_sp[0].system_prompt, "You are a test agent.");
        assert_eq!(from_tools[0].system_prompt, "");
    }

    #[tokio::test]
    async fn user_templates_are_never_recorded() {
        let project_id = Uuid::new_v4();
        let span_id = Uuid::new_v4();
        let messages = [message(project_id, vec![agent_span(span_id, "")])];
        let span_versions = [span_version(project_id, span_id, "u1")];
        let joined = join_spans(
            &cache(),
            VersionKind::UserTemplate,
            &messages,
            &span_versions,
        )
        .await;
        assert!(joined.spans.is_empty() && joined.pending.is_empty());
    }

    #[test]
    fn agent_span_wire_format_round_trips() {
        let span = agent_span(Uuid::new_v4(), "");
        let json = serde_json::to_value(&span).unwrap();
        for omitted in ["tool_full_hash", "tool_version", "tool_content_hash"] {
            assert!(json.get(omitted).is_none(), "empty {omitted} is omitted");
        }
        let back: AgentSpan = serde_json::from_value(json).unwrap();
        assert_eq!(back, span);
    }
}
