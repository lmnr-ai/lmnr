//! Creates an agent's row on its first ingested prompt and names it in the
//! background, so it is listed seconds after its first trace rather than after
//! the job's next run. The job still upserts and retries naming every run, so
//! anything missed here is caught there.

use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use uuid::Uuid;

use super::naming::{generate_agent_name, span_system_prompt};
use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_VERSIONING_KNOWN_CACHE_KEY},
    ch::agent_prompts::CHAgentPrompt,
    db::{
        DB,
        agent_versioning::{set_agent_name, upsert_agent},
    },
    llm::LlmClient,
};

/// Matches the `agent_prompts` TTL; past it the next prompt costs one more upsert.
const KNOWN_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

/// Call after `prompts` and their spans are written: naming reads the span back.
pub async fn register_new_agents(
    db: &Arc<DB>,
    cache: &Arc<Cache>,
    clickhouse: &clickhouse::Client,
    llm_client: Option<&Arc<LlmClient>>,
    prompts: &[CHAgentPrompt],
) {
    let mut firsts: HashMap<(Uuid, &str), &CHAgentPrompt> = HashMap::new();
    for prompt in prompts {
        firsts
            .entry((prompt.project_id, prompt.agent_hash.as_str()))
            .or_insert(prompt);
    }
    for ((project_id, agent_hash), prompt) in firsts {
        let key = format!("{AGENT_VERSIONING_KNOWN_CACHE_KEY}:{project_id}:{agent_hash}");
        // Held for the TTL, not released: one claimant per agent across
        // replicas, and later batches skip Postgres.
        match cache.try_acquire_lock(&key, KNOWN_TTL_SECONDS).await {
            Ok(true) => {}
            Ok(false) => continue,
            Err(e) => {
                log::warn!("[AGENT VERSIONING] Failed to claim {key}: {e:?}");
                continue;
            }
        }
        let agent = match upsert_agent(&db.pool, project_id, agent_hash).await {
            Ok(agent) => agent,
            Err(e) => {
                log::error!("[AGENT VERSIONING] Failed to register {key}: {e:?}");
                let _ = cache.release_lock(&key).await;
                continue;
            }
        };
        if agent.name.is_some() {
            continue;
        }
        let Some(llm_client) = llm_client.cloned() else {
            continue;
        };
        let (db, clickhouse) = (db.clone(), clickhouse.clone());
        let (trace_id, span_id) = (prompt.trace_id, prompt.span_id);
        tokio::spawn(async move {
            let named = name_agent(
                &db,
                &clickhouse,
                &llm_client,
                project_id,
                agent.id,
                trace_id,
                span_id,
            )
            .await;
            if let Err(e) = named {
                log::warn!(
                    "[AGENT VERSIONING] Failed to name agent {}: {e:?}",
                    agent.id
                );
            }
        });
    }
}

async fn name_agent(
    db: &DB,
    clickhouse: &clickhouse::Client,
    llm_client: &LlmClient,
    project_id: Uuid,
    agent_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
) -> Result<()> {
    let Some(system_prompt) = span_system_prompt(clickhouse, project_id, trace_id, span_id).await?
    else {
        return Ok(());
    };
    let name = generate_agent_name(llm_client, project_id, agent_id, &system_prompt).await?;
    set_agent_name(&db.pool, agent_id, &name).await
}
