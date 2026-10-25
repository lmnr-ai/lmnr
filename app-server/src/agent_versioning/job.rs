//! The scheduled run: for each agent with recent prompts, version it by the
//! SDK's releases ([`super::releases`]) once its prompts carry them, else from
//! the prompts alone ([`super::inferred`]). Both tag traces in `traces_agg`
//! before saving progress, so a failed run is redone; tags are a set, so a
//! redo is harmless.

use std::{collections::HashSet, sync::Arc, time::Duration};

use anyhow::Result;
use serde_json::Value;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use super::naming::{generate_agent_name, span_system_prompt, system_message};
use super::normalize::core_text;
use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_VERSIONING_LOCK_CACHE_KEY},
    ch::{
        ClickhouseTrait,
        agent_prompts::{Scope, TracePrompt, active_agents, fetch_agent_doc},
        cloud::CloudClickhouse,
        traces_agg::{CHTraceAgentVersion, CHTraceAgg, trace_start_times},
    },
    db::{
        DB,
        agent_versioning::{
            Agent, VersionText, insert_models, set_agent_name, set_release_mode, upsert_agent,
        },
    },
    env::agent_versioning::{ACTIVE_WINDOW_SECONDS, INTERVAL_SECONDS, RELEASE_MIN_RUN},
    llm::LlmClient,
    traces::sp_versioning::tool_text,
};

pub(super) const NS: i64 = 1_000_000_000;
/// Async inserts become readable shortly after `ingested_at`; reading only up
/// to this far behind now keeps a row from being skipped before it is visible.
pub(super) const VISIBILITY_LAG_NS: i64 = 2 * 60 * NS;

pub struct Job {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Option<Arc<LlmClient>>,
}

impl Job {
    pub async fn run(self) {
        let interval = INTERVAL_SECONDS.get();
        let mut ticker = time::interval(Duration::from_secs(interval));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(i64::MAX);
            let since = now - ACTIVE_WINDOW_SECONDS.get() * NS;
            let agents = match active_agents(&self.clickhouse, since).await {
                Ok(agents) => agents,
                Err(e) => {
                    log::error!("[AGENT VERSIONING] Failed to list agents: {e:?}");
                    continue;
                }
            };
            log::info!("[AGENT VERSIONING] Woke up: {} active agents", agents.len());
            for agent in agents {
                let key = format!(
                    "{AGENT_VERSIONING_LOCK_CACHE_KEY}:{}:{}",
                    agent.project_id, agent.agent_hash
                );
                // Expires rather than being released: at most one run per
                // agent per interval across replicas.
                match self.cache.try_acquire_lock(&key, interval * 9 / 10).await {
                    Ok(true) => {}
                    Ok(false) => continue,
                    Err(e) => {
                        log::warn!("[AGENT VERSIONING] Failed to lock {key}: {e:?}");
                        continue;
                    }
                }
                if let Err(e) = self
                    .version_agent(agent.project_id, &agent.agent_hash, now)
                    .await
                {
                    log::error!("[AGENT VERSIONING] {key} failed: {e:?}");
                }
            }
        }
    }

    async fn version_agent(&self, project_id: Uuid, agent_hash: &str, now: i64) -> Result<()> {
        let agent = upsert_agent(&self.db.pool, project_id, agent_hash).await?;
        if agent.release_mode
            || self
                .switch_to_releases(&agent, project_id, agent_hash, now)
                .await?
        {
            self.version_releases(&agent, project_id, agent_hash, now)
                .await
        } else {
            self.version_inferred(&agent, project_id, agent_hash, now)
                .await
        }
    }

    /// Release mode once at least 90% of the agent's latest prompts carry a
    /// release; it then sticks, and prompts without one stay unversioned.
    async fn switch_to_releases(
        &self,
        agent: &Agent,
        project_id: Uuid,
        agent_hash: &str,
        now: i64,
    ) -> Result<bool> {
        let scope = Scope {
            project_id,
            agent_hash,
            watermark: now - VISIBILITY_LAG_NS,
        };
        let share = scope.release_share(&self.clickhouse).await?;
        if share.with_release < RELEASE_MIN_RUN.get() || share.with_release * 10 < share.total * 9 {
            return Ok(false);
        }
        set_release_mode(&self.db.pool, agent.id).await?;
        log::info!("[AGENT VERSIONING] {project_id}:{agent_hash} switched to release mode");
        Ok(true)
    }

    /// Name the agent from `system_prompt`, else from `sample`'s span.
    /// Retried every run until it sticks.
    pub(super) async fn name_agent(
        &self,
        agent: &Agent,
        project_id: Uuid,
        system_prompt: Option<String>,
        sample: Option<&TracePrompt>,
    ) -> Result<()> {
        let Some(llm_client) = &self.llm_client else {
            return Ok(());
        };
        if agent.name.is_some() {
            return Ok(());
        }
        let system_prompt = match (system_prompt, sample) {
            (Some(prompt), _) => Some(prompt),
            (None, Some(sample)) => {
                span_system_prompt(
                    &self.clickhouse,
                    project_id,
                    sample.trace_id,
                    sample.span_id,
                )
                .await?
            }
            (None, None) => None,
        };
        if let Some(system_prompt) = system_prompt {
            let name =
                generate_agent_name(llm_client, project_id, agent.id, &system_prompt).await?;
            set_agent_name(&self.db.pool, agent.id, &name).await?;
        }
        Ok(())
    }

    /// The example's system prompt, and the version's text: the example's
    /// system prompt and tool lines that are in the core, in document order.
    pub(super) async fn version_text(
        &self,
        project_id: Uuid,
        example: &TracePrompt,
        core: &[u64],
    ) -> Result<(Option<String>, VersionText)> {
        let doc = fetch_agent_doc(
            &self.clickhouse,
            project_id,
            example.trace_id,
            example.span_id,
        )
        .await?;
        let Some((input, tools)) = doc else {
            return Ok(Default::default());
        };
        let system_prompt = system_message(&input);
        let tool_text = serde_json::from_str::<Vec<Value>>(&tools)
            .map(|tools| tool_text::render(&tools))
            .unwrap_or_default();
        let text = VersionText {
            system_prompt: core_text(&system_prompt, core),
            tool_definitions: core_text(&tool_text, core),
        };
        Ok((Some(system_prompt), text))
    }

    pub(super) async fn write_labels(
        &self,
        project_id: Uuid,
        agent_hash: &str,
        labels: &[(Option<usize>, TracePrompt)],
        ids: &[Uuid],
        hashes: &[String],
    ) -> Result<()> {
        let trace_ids: Vec<Uuid> = labels
            .iter()
            .filter(|(version, _)| version.is_some())
            .map(|(_, trace)| trace.trace_id)
            .collect();
        // `trace.time` is the trace's first agent span, not its start, and
        // `start_time` is the partition key; it is only the fallback.
        let starts = trace_start_times(&self.clickhouse, project_id, &trace_ids).await?;
        let mut rows = Vec::new();
        let mut models = HashSet::new();
        for (version, trace) in labels {
            let Some(version) = *version else { continue };
            let start = starts.get(&trace.trace_id).copied().unwrap_or(trace.time);
            let mut row = CHTraceAgg::zero_sum_partial(project_id, trace.trace_id, start);
            let tag = |model: &str| CHTraceAgentVersion {
                agent_hash: agent_hash.to_string(),
                version_hash: hashes[version].clone(),
                model: model.to_string(),
            };
            row.agent_versions = match trace.models.as_slice() {
                [] => vec![tag("")],
                trace_models => trace_models.iter().map(|m| tag(m)).collect(),
            };
            models.extend(trace.models.iter().map(|m| (ids[version], m.clone())));
            rows.push(row);
        }
        CloudClickhouse::new(self.clickhouse.clone())
            .insert_batch(&rows, None)
            .await?;
        let (version_ids, models): (Vec<Uuid>, Vec<String>) = models.into_iter().unzip();
        insert_models(&self.db.pool, project_id, &version_ids, &models).await
    }
}
