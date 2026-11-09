//! Which agent an LLM span belongs to, decided at ingest. With detection on,
//! it is the first defined agent whose definition matches the system prompt;
//! a span matching none stays unlabelled (empty `agent_hash` in
//! `agent_prompts`) until detection defines its agent. With detection off, it
//! is the prompt's first-sentence hash.

use tokio::sync::OnceCell;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_DEFINITIONS_CACHE_KEY},
    db::{
        DB,
        agent_versioning::{DefinedAgent, get_defined_agents},
    },
    features::{Feature, is_feature_enabled},
};

/// Detection invalidates the entry when it saves, so this only bounds how long
/// a stale list can survive a race with that or a failed invalidation.
const DEFINITIONS_CACHE_TTL_SECONDS: u64 = 5 * 60;

/// Resolves the agents of one ingest batch's spans, loading the project's
/// definitions on first use.
pub struct AgentResolver<'a> {
    db: &'a DB,
    cache: &'a Cache,
    project_id: Uuid,
    agents: OnceCell<Vec<DefinedAgent>>,
}

impl<'a> AgentResolver<'a> {
    pub fn new(db: &'a DB, cache: &'a Cache, project_id: Uuid) -> Self {
        Self {
            db,
            cache,
            project_id,
            agents: OnceCell::new(),
        }
    }

    /// `None` when no defined agent matches.
    pub async fn agent_hash(&self, system_prompt: &str, first_sentence: String) -> Option<String> {
        if !is_feature_enabled(Feature::AgentDetection) {
            return Some(first_sentence);
        }
        let agents = self
            .agents
            .get_or_init(|| defined_agents(self.db, self.cache, self.project_id))
            .await;
        first_match(agents, system_prompt).map(|agent| agent.agent_hash.clone())
    }
}

fn first_match<'a>(agents: &'a [DefinedAgent], system_prompt: &str) -> Option<&'a DefinedAgent> {
    agents
        .iter()
        .find(|agent| agent.definition.matches(system_prompt))
}

pub fn definitions_cache_key(project_id: Uuid) -> String {
    format!("{AGENT_DEFINITIONS_CACHE_KEY}:{project_id}")
}

/// The project's defined agents, cached briefly. A failed read leaves the
/// batch's spans unlabelled rather than failing ingest.
async fn defined_agents(db: &DB, cache: &Cache, project_id: Uuid) -> Vec<DefinedAgent> {
    let key = definitions_cache_key(project_id);
    match cache.get::<Vec<DefinedAgent>>(&key).await {
        Ok(Some(agents)) => return agents,
        Ok(None) => {}
        Err(e) => log::warn!("[AGENT DETECTION] Failed to read {key}: {e:?}"),
    }
    let agents = match get_defined_agents(&db.pool, project_id).await {
        Ok(agents) => agents,
        Err(e) => {
            log::error!("[AGENT DETECTION] Failed to load definitions of {project_id}: {e:?}");
            return Vec::new();
        }
    };
    if let Err(e) = cache
        .insert_with_ttl(&key, agents.clone(), DEFINITIONS_CACHE_TTL_SECONDS)
        .await
    {
        log::warn!("[AGENT DETECTION] Failed to cache {key}: {e:?}");
    }
    agents
}
