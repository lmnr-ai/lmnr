//! Agent detection. Each run, for every project
//! with uncovered traces (no prompt of theirs matched a defined agent), an
//! LLM sees the most recent of them plus the known agents, and defines the
//! missing agents or extends the checks of agents whose prompt changed
//! ([`agent`]). Ingest identifies agents by those definitions from then on
//! ([`super::identity`]); traces ingested before stay unlabelled.

mod agent;
mod prompt;

use std::collections::HashMap;

use anyhow::Result;
use uuid::Uuid;

use self::agent::{Change, DetectionAgent, KnownAgent, LatestPrompt, UnlabelledPrompt};
use super::{Job, NS, definition, identity::definitions_cache_key};
use crate::{
    cache::{CacheTrait, keys::AGENT_DETECTION_LOCK_CACHE_KEY},
    ch::{
        agent_prompts::{
            AgentSpan, PromptSpan, latest_agent_spans, projects_with_unlabelled, uncovered_traces,
        },
        spans::fetch_system_prompts,
    },
    db::agent_versioning::{
        DefinedAgent, extend_agent_definition, get_defined_agents, insert_defined_agent,
    },
    env::{
        agent_versioning::{
            ACTIVE_WINDOW_SECONDS, DETECTION_MIN_MATCHES, DETECTION_SAMPLES, INTERVAL_SECONDS,
        },
        connections::CHECKPOINTS_INTERNAL_PROJECT_ID,
    },
    llm::LlmClient,
};

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
        let spans =
            uncovered_traces(&self.clickhouse, project_id, since, DETECTION_SAMPLES.get()).await?;
        // Fewer could never make an agent.
        if spans.len() < min_matches {
            return Ok(());
        }
        // With no trace new since the last run, the model would see the same
        // samples it already declined.
        let last_run = now - INTERVAL_SECONDS.get() as i64 * NS;
        if spans.iter().all(|span| span.ingested <= last_run) {
            return Ok(());
        }
        let defined = get_defined_agents(&self.db.pool, project_id).await?;
        let agent_hashes: Vec<&str> = defined.iter().map(|a| a.agent_hash.as_str()).collect();
        let latest = latest_agent_spans(&self.clickhouse, project_id, &agent_hashes, since).await?;
        // One read for every prompt this run needs.
        let refs: Vec<(Uuid, Uuid)> = spans
            .iter()
            .map(|span| (span.trace_id, span.span_id))
            .chain(latest.iter().map(|span| (span.trace_id, span.span_id)))
            .collect();
        let system_prompts = fetch_system_prompts(&self.clickhouse, project_id, &refs).await?;
        let agents = known_agents(defined, &latest, &system_prompts);
        // A trace stored before its agent was defined stays unlabelled; it
        // needs no new agent and would only crowd out the ones that do.
        let prompts: Vec<UnlabelledPrompt> = unlabelled_prompts(&spans, &system_prompts)
            .into_iter()
            .filter(|prompt| !is_defined(&agents, &prompt.opening))
            .collect();
        if prompts.len() < min_matches {
            return Ok(());
        }
        let changes = DetectionAgent::new(
            llm_client,
            project_id,
            internal_project_id(),
            min_matches,
            prompts,
            agents,
        )
        .run()
        .await;
        self.save_changes(project_id, &changes).await
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
                Change::Extend { agent_id, added } => {
                    extend_agent_definition(&self.db.pool, project_id, *agent_id, added).await?;
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

/// The project the detection LLM calls are traced into.
fn internal_project_id() -> Option<Uuid> {
    std::env::var(CHECKPOINTS_INTERNAL_PROJECT_ID)
        .ok()
        .and_then(|value| Uuid::parse_str(&value).ok())
}

/// The sampled spans' prompts; spans no longer stored are skipped.
fn unlabelled_prompts(
    spans: &[PromptSpan],
    system_prompts: &HashMap<Uuid, String>,
) -> Vec<UnlabelledPrompt> {
    spans
        .iter()
        .filter_map(|span| {
            let system_prompt = system_prompts.get(&span.span_id)?.clone();
            Some(UnlabelledPrompt {
                trace_id: span.trace_id,
                span_id: span.span_id,
                opening: definition::opening(&system_prompt),
                system_prompt,
                time: span.time,
            })
        })
        .collect()
}

/// The defined agents, each with its latest prompt when one was read.
fn known_agents(
    defined: Vec<DefinedAgent>,
    latest: &[AgentSpan],
    system_prompts: &HashMap<Uuid, String>,
) -> Vec<KnownAgent> {
    defined
        .into_iter()
        .map(|agent| {
            let latest = latest
                .iter()
                .find(|span| span.agent_hash == agent.agent_hash)
                .and_then(|span| {
                    let system_prompt = system_prompts.get(&span.span_id)?.clone();
                    Some(LatestPrompt {
                        opening: definition::opening(&system_prompt),
                        system_prompt,
                        time: span.start_time,
                    })
                });
            KnownAgent { agent, latest }
        })
        .collect()
}

fn is_defined(agents: &[KnownAgent], opening: &str) -> bool {
    agents
        .iter()
        .any(|known| known.agent.definition.matches(opening))
}
