//! Records one system-prompt versioning batch as agent versions.
//!
//! Best-effort throughout: a failure is logged and the next span presenting
//! the same version retries it. A version whose tool text isn't readable yet
//! is deferred the same way, without a Postgres row.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
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
        system_prompt_versions::{SpanVersion, fetch_version_static_text},
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
        dedup::{span_group_id, tools::ToolDedup},
        sp_versioning::consumer::SpVersioningMessage,
    },
    utils::{sanitize_string, truncate_chars},
};

const ENTRY_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
/// Past this a trace's tuple may be tagged again; the set dedupes it.
const TRACE_TAG_TTL_SECONDS: u64 = 24 * 60 * 60;
/// Also the retry interval after a failed naming attempt.
const NAMING_LOCK_TTL_SECONDS: u64 = 10 * 60;
/// Each lost race on `version_number` costs one attempt.
const VERSION_INSERT_ATTEMPTS: usize = 3;
/// Blobs tried per new version in a batch; each is one ClickHouse read.
const TOOL_TEXT_CANDIDATES: usize = 4;
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
    /// Hex order-insensitive tool-set hash; empty without tools.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tool_set_hash: String,
    /// Hex dedup hash of the tool blob: its `unique_content` key.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tool_content_hash: String,
    /// The span's `unique_content` group.
    pub group_id: String,
}

impl AgentSpan {
    pub fn from_span(span: &Span, tools: Option<&ToolDedup>) -> Self {
        let model = span
            .attributes
            .response_model()
            .filter(|m| !m.trim().is_empty())
            .or_else(|| span.attributes.request_model())
            .map(|m| truncate_chars(&sanitize_string(m.trim()), MODEL_MAX_CHARS))
            .unwrap_or_default();
        let (tool_set_hash, tool_content_hash) = tools
            .and_then(|t| Some((hex::encode(t.set_hash?), hex::encode(t.hash))))
            .unwrap_or_default();
        Self {
            span_id: span.span_id,
            start_time: chrono_to_nanoseconds(span.start_time),
            model,
            tool_set_hash,
            tool_content_hash,
            group_id: span_group_id(span),
        }
    }
}

/// A span whose system-prompt version is final, joined with its inputs.
struct VersionedSpan<'a> {
    project_id: Uuid,
    trace_id: Uuid,
    agent_hash: &'a str,
    system_prompt_version_hash: &'a str,
    version_hash: String,
    inputs: &'a AgentSpan,
    /// The raw prompt when it rode the wire; seeds agent naming.
    system_prompt: &'a str,
}

fn join_spans<'a>(
    messages: &'a [SpVersioningMessage],
    span_versions: &'a [SpanVersion],
) -> Vec<VersionedSpan<'a>> {
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
    span_versions
        .iter()
        .filter_map(|span_version| {
            let (inputs, system_prompt) =
                inputs.get(&(span_version.project_id, span_version.span_id))?;
            Some(VersionedSpan {
                project_id: span_version.project_id,
                trace_id: span_version.trace_id,
                agent_hash: &span_version.agent_hash,
                system_prompt_version_hash: &span_version.version_hash,
                version_hash: version_hash(
                    &span_version.agent_hash,
                    &span_version.version_hash,
                    &inputs.tool_set_hash,
                ),
                inputs,
                system_prompt,
            })
        })
        .collect()
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
            clickhouse,
            llm_client,
        }
    }

    pub async fn record(&self, messages: &[SpVersioningMessage], span_versions: &[SpanVersion]) {
        let spans = join_spans(messages, span_versions);
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
        let mut agent_ids: HashMap<(Uuid, &str), Uuid> = HashMap::new();
        let mut version_ids: HashMap<(Uuid, &str), Uuid> = HashMap::new();
        for version_spans in spans_by_version.into_values() {
            let span = version_spans[0];
            let agent_key = (span.project_id, span.agent_hash);
            let agent_id = match agent_ids.get(&agent_key) {
                Some(id) => *id,
                None => match self.ensure_agent(span).await {
                    Ok(id) => *agent_ids.entry(agent_key).or_insert(id),
                    Err(e) => {
                        log::warn!(
                            "[CHECKPOINTS] Failed to upsert agent {}: {e:?}",
                            span.agent_hash
                        );
                        continue;
                    }
                },
            };
            match self.ensure_version(&version_spans, agent_id).await {
                Ok(Some(id)) => {
                    version_ids.insert((span.project_id, span.version_hash.as_str()), id);
                }
                Ok(None) => log::debug!(
                    "[CHECKPOINTS] Deferring version {}: tool definitions not readable yet",
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

    async fn ensure_agent(&self, span: &VersionedSpan<'_>) -> anyhow::Result<Uuid> {
        let key = agent_cache_key(span.project_id, span.agent_hash);
        let agent = match self.cached::<CachedAgent>(&key).await {
            Some(agent) => agent,
            None => {
                let row =
                    agents::upsert_agent(&self.db.pool, span.project_id, span.agent_hash).await?;
                let agent = CachedAgent {
                    id: row.id,
                    named: row.name.is_some(),
                };
                remember(&self.cache, &key, agent, ENTRY_TTL_SECONDS).await;
                agent
            }
        };
        if !agent.named {
            self.spawn_naming(span, agent.id).await;
        }
        Ok(agent.id)
    }

    /// `spans` all present the same version. `None` defers the version: its
    /// tool text isn't readable yet.
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
            system_prompt_version_hash: span.system_prompt_version_hash,
            tool_definitions_hash: &span.inputs.tool_set_hash,
            tool_definitions: &tool_definitions,
        };
        for _ in 0..VERSION_INSERT_ATTEMPTS {
            if let Some(id) = agents::insert_agent_version(&self.db.pool, &version).await? {
                return Ok(Some(id));
            }
            // A conflict means either a concurrent insert of this same version
            // or a lost race for the next `version_number`.
            if let Some(id) =
                agents::get_agent_version_id(&self.db.pool, span.project_id, &span.version_hash)
                    .await?
            {
                return Ok(Some(id));
            }
        }
        anyhow::bail!("version_number contention on agent {agent_id}")
    }

    /// Text of the version's tool set: from another version of the agent with
    /// the same set, else from the `unique_content` blob of one of `spans`,
    /// oldest first. The spans consumer may not have written any yet (`None`).
    async fn tool_definitions(
        &self,
        spans: &[&VersionedSpan<'_>],
        agent_id: Uuid,
    ) -> anyhow::Result<Option<String>> {
        let span = spans[0];
        if span.inputs.tool_set_hash.is_empty() {
            return Ok(Some(String::new()));
        }
        if let Some(text) = agents::get_tool_definitions(
            &self.db.pool,
            span.project_id,
            agent_id,
            &span.inputs.tool_set_hash,
        )
        .await?
        {
            return Ok(Some(text));
        }
        for span in tool_text_candidates(spans) {
            let text = get_content_by_hash(
                &self.clickhouse,
                span.project_id,
                &span.inputs.group_id,
                &span.inputs.tool_content_hash,
            )
            .await?;
            if text.is_some() {
                return Ok(text);
            }
        }
        Ok(None)
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
        let clickhouse = CloudClickhouse::new(self.clickhouse.clone());
        if let Err(e) = clickhouse.insert_batch(&rows, None).await {
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
            system_prompt_version_hash: span.system_prompt_version_hash.to_string(),
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
            let name = generate_agent_name(&self.llm_client, self.project_id, &prompt).await?;
            agents::set_generated_agent_name(&self.db.pool, self.project_id, self.agent_id, &name)
                .await?;
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

/// Distinct tool blobs of `spans`, oldest span first: an older span's blob is
/// the likeliest to be written already.
fn tool_text_candidates<'s, 'a>(spans: &[&'s VersionedSpan<'a>]) -> Vec<&'s VersionedSpan<'a>> {
    let mut sorted = spans.to_vec();
    sorted.sort_by_key(|s| s.inputs.start_time);
    let mut seen = HashSet::new();
    sorted
        .into_iter()
        .filter(|s| {
            seen.insert((
                s.inputs.group_id.as_str(),
                s.inputs.tool_content_hash.as_str(),
            ))
        })
        .take(TOOL_TEXT_CANDIDATES)
        .collect()
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
    use crate::traces::sp_versioning::window::SpanRef;

    fn agent_span(span_id: Uuid, tool_set_hash: &str) -> AgentSpan {
        AgentSpan {
            span_id,
            start_time: 1_700_000_000_000_000_000,
            model: "gpt-4o".to_string(),
            tool_set_hash: tool_set_hash.to_string(),
            tool_content_hash: String::new(),
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

    fn span_version(project_id: Uuid, span_id: Uuid, sp_version: &str) -> SpanVersion {
        SpanVersion::new(
            project_id,
            Uuid::new_v4(),
            span_id,
            "agent",
            false,
            sp_version,
        )
    }

    #[test]
    fn join_keeps_only_span_versions_with_inputs_and_hashes_the_tool_set() {
        let project_id = Uuid::new_v4();
        let (with_tools, without_tools, unknown) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let messages = [message(
            project_id,
            vec![
                agent_span(with_tools, "tools"),
                agent_span(without_tools, ""),
            ],
        )];
        let span_versions = [
            span_version(project_id, with_tools, "sp1"),
            span_version(project_id, without_tools, "sp1"),
            span_version(project_id, unknown, "sp1"),
            // Same span id under another project must not borrow the inputs.
            span_version(Uuid::new_v4(), with_tools, "sp1"),
        ];

        let spans = join_spans(&messages, &span_versions);
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].version_hash, version_hash("agent", "sp1", "tools"));
        assert_eq!(spans[1].version_hash, version_hash("agent", "sp1", ""));
        assert_ne!(spans[0].version_hash, spans[1].version_hash);
        assert_eq!(spans[0].system_prompt, "You are a test agent.");
    }

    #[test]
    fn tool_text_candidates_are_distinct_oldest_first_and_capped() {
        let inputs: Vec<AgentSpan> = [
            (5, "g1"),
            (1, "g2"),
            (3, "g2"),
            (2, "g3"),
            (4, "g4"),
            (0, "g5"),
        ]
        .into_iter()
        .map(|(start_time, group)| AgentSpan {
            start_time,
            tool_content_hash: "blob".to_string(),
            group_id: group.to_string(),
            ..agent_span(Uuid::new_v4(), "tools")
        })
        .collect();
        let spans: Vec<VersionedSpan> = inputs
            .iter()
            .map(|inputs| VersionedSpan {
                project_id: Uuid::nil(),
                trace_id: Uuid::nil(),
                agent_hash: "agent",
                system_prompt_version_hash: "sp1",
                version_hash: "v".to_string(),
                inputs,
                system_prompt: "",
            })
            .collect();
        let refs: Vec<&VersionedSpan> = spans.iter().collect();

        let groups: Vec<&str> = tool_text_candidates(&refs)
            .iter()
            .map(|s| s.inputs.group_id.as_str())
            .collect();
        assert_eq!(groups, vec!["g5", "g2", "g3", "g4"]);
    }

    #[test]
    fn agent_span_wire_format_round_trips() {
        let span = agent_span(Uuid::new_v4(), "");
        let json = serde_json::to_value(&span).unwrap();
        assert!(
            json.get("tool_set_hash").is_none(),
            "empty fields are omitted"
        );
        let back: AgentSpan = serde_json::from_value(json).unwrap();
        assert_eq!(back, span);
    }
}
