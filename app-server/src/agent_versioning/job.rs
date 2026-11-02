//! The scheduled run: for each agent with recent prompts, version it by the
//! SDK's releases ([`super::releases`]) once its prompts carry them, else from
//! the prompts alone ([`super::inferred`]). Both tag traces in `traces_agg`
//! before saving progress, so a failed run is redone; tags are a set, so a
//! redo is harmless.

use std::time::Duration;

use anyhow::Result;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use super::{Job, NS, VISIBILITY_LAG_NS};
use crate::{
    cache::{CacheTrait, keys::AGENT_VERSIONING_LOCK_CACHE_KEY},
    ch::agent_prompts::{Scope, active_agents},
    db::agent_versioning::{Agent, set_release_mode, upsert_agent},
    env::agent_versioning::{ACTIVE_WINDOW_SECONDS, INTERVAL_SECONDS, RELEASE_MIN_RUN},
};

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
            ingested_until: now - VISIBILITY_LAG_NS,
        };
        let share = scope.release_share(&self.clickhouse).await?;
        if share.with_release < RELEASE_MIN_RUN.get() || share.with_release * 10 < share.total * 9 {
            return Ok(false);
        }
        set_release_mode(&self.db.pool, agent.id).await?;
        log::info!("[AGENT VERSIONING] {project_id}:{agent_hash} switched to release mode");
        Ok(true)
    }
}
