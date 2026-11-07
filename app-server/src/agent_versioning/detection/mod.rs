//! Agent detection (`AGENT_DETECTION_ENABLED`). Each run, for every project
//! with uncovered traces (no prompt of theirs matched a defined agent), an
//! LLM sees a random sample of them plus the known agents, and defines the
//! missing agents or extends the checks of agents whose prompt changed
//! ([`agent`]). Ingest identifies agents by those definitions from then on
//! ([`super::identity`]); traces ingested before stay unlabelled.

mod agent;
mod prompt;

use anyhow::Result;
use futures_util::future::try_join_all;
use uuid::Uuid;

use self::agent::{Change, DetectionAgent, KnownAgent};
use super::{Job, NS, identity::definitions_cache_key, naming};
use crate::{
    cache::{CacheTrait, keys::AGENT_DETECTION_LOCK_CACHE_KEY},
    ch::agent_prompts::{
        PromptSpan, latest_agent_spans, projects_with_unlabelled, uncovered_traces,
    },
    db::agent_versioning::{get_defined_agents, insert_defined_agent, set_agent_definition},
    env::agent_versioning::{
        ACTIVE_WINDOW_SECONDS, DETECTION_MIN_MATCHES, DETECTION_SAMPLES, INTERVAL_SECONDS,
    },
    llm::LlmClient,
};

/// Traces read per prompt shown to the model: uncovered traces include those
/// stored before their agent was defined, which are filtered out after reading.
const CANDIDATES_PER_PROMPT: u64 = 3;

impl Job {
    pub(super) async fn detect_agents(&self, now: i64) {
        let Some(llm_client) = &self.llm_client else {
            return;
        };
        let interval = INTERVAL_SECONDS.get();
        // Only projects with new unlabelled prompts are worth an LLM call.
        let since = now - interval as i64 * NS;
        let projects = match projects_with_unlabelled(&self.clickhouse, since).await {
            Ok(projects) => projects,
            Err(e) => {
                log::error!("[AGENT DETECTION] Failed to list projects: {e:?}");
                return;
            }
        };
        for project_id in projects {
            let key = format!("{AGENT_DETECTION_LOCK_CACHE_KEY}:{project_id}");
            // Expires rather than being released: at most one run per
            // project per interval across replicas.
            match self.cache.try_acquire_lock(&key, interval * 9 / 10).await {
                Ok(true) => {}
                Ok(false) => continue,
                Err(e) => {
                    log::warn!("[AGENT DETECTION] Failed to lock {key}: {e:?}");
                    continue;
                }
            }
            if let Err(e) = self
                .detect_agents_for_project(llm_client, project_id, now)
                .await
            {
                log::error!("[AGENT DETECTION] {project_id} failed: {e:?}");
            }
        }
    }

    async fn detect_agents_for_project(
        &self,
        llm_client: &LlmClient,
        project_id: Uuid,
        now: i64,
    ) -> Result<()> {
        let min_matches = DETECTION_MIN_MATCHES.get();
        // Sampled from the whole active window, not just this interval, so an
        // agent with a trace an hour still gathers enough to be defined.
        let since = now - ACTIVE_WINDOW_SECONDS.get() * NS;
        let prompts_limit = DETECTION_SAMPLES.get();
        let spans = uncovered_traces(
            &self.clickhouse,
            project_id,
            since,
            prompts_limit * CANDIDATES_PER_PROMPT,
        )
        .await?;
        // Fewer could never make an agent.
        if spans.len() < min_matches {
            return Ok(());
        }
        let agents = self.known_agents(project_id, since).await?;
        // A trace stored before its agent was defined stays unlabelled; it
        // needs no new agent and would only crowd out the ones that do.
        let prompts: Vec<String> = self
            .read_prompts(project_id, &spans)
            .await?
            .into_iter()
            .filter(|prompt| !is_defined(&agents, prompt))
            .take(prompts_limit as usize)
            .collect();
        if prompts.len() < min_matches {
            return Ok(());
        }
        let changes = DetectionAgent::new(
            llm_client,
            project_id,
            naming::internal_project_id(),
            min_matches,
            prompts,
            agents,
        )
        .run()
        .await;
        self.save_changes(project_id, &changes).await
    }

    /// The spans' system prompts; spans no longer stored are skipped.
    async fn read_prompts(&self, project_id: Uuid, spans: &[PromptSpan]) -> Result<Vec<String>> {
        let prompts = try_join_all(spans.iter().map(|span| {
            naming::span_system_prompt(&self.clickhouse, project_id, span.trace_id, span.span_id)
        }))
        .await?;
        Ok(prompts.into_iter().flatten().collect())
    }

    /// The project's defined agents, each with its latest prompt ingested
    /// after `since`.
    async fn known_agents(&self, project_id: Uuid, since: i64) -> Result<Vec<KnownAgent>> {
        let agents = get_defined_agents(&self.db.pool, project_id).await?;
        let agent_hashes: Vec<&str> = agents.iter().map(|a| a.agent_hash.as_str()).collect();
        let latest = latest_agent_spans(&self.clickhouse, project_id, &agent_hashes, since).await?;
        let latest_prompts = try_join_all(agents.iter().map(|agent| async {
            let Some(span) = latest
                .iter()
                .find(|span| span.agent_hash == agent.agent_hash)
            else {
                return Ok(None);
            };
            naming::span_system_prompt(&self.clickhouse, project_id, span.trace_id, span.span_id)
                .await
        }))
        .await?;
        Ok(agents
            .into_iter()
            .zip(latest_prompts)
            .map(|(agent, latest_prompt)| KnownAgent {
                agent,
                latest_prompt,
            })
            .collect())
    }

    async fn save_changes(&self, project_id: Uuid, changes: &[Change]) -> Result<()> {
        if changes.is_empty() {
            return Ok(());
        }
        for change in changes {
            match change {
                Change::Create { name, definition } => {
                    // Derived from the id, so editing the definition never
                    // changes the agent.
                    let agent_id = Uuid::new_v4();
                    let agent_hash = agent_id.simple().to_string();
                    insert_defined_agent(
                        &self.db.pool,
                        project_id,
                        agent_id,
                        &agent_hash,
                        name,
                        definition,
                    )
                    .await?;
                }
                Change::Extend {
                    agent_id,
                    definition,
                } => {
                    set_agent_definition(&self.db.pool, project_id, *agent_id, definition).await?;
                }
            }
        }
        log::info!(
            "[AGENT DETECTION] {project_id}: saved {} agent changes",
            changes.len()
        );
        // Ingest picks the new definitions up now rather than at the TTL.
        let key = definitions_cache_key(project_id);
        if let Err(e) = self.cache.remove(&key).await {
            log::warn!("[AGENT DETECTION] Failed to invalidate {key}: {e:?}");
        }
        Ok(())
    }
}

fn is_defined(agents: &[KnownAgent], prompt: &str) -> bool {
    agents
        .iter()
        .any(|known| known.agent.definition.matches(prompt))
}
