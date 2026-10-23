//! The scheduled run: for each agent with recent prompts, read samples, build
//! its version timeline, mint versions, tag traces in `traces_agg`, then save
//! progress. Tags are written before progress, so a failed run is redone; tags
//! are a set, so a redo is harmless.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use serde_json::Value;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use super::{
    naming::{generate_agent_name, span_system_prompt, system_message},
    normalize::{core_text, version_hash},
    timeline::{self, Input, Params, Sample, Timeline},
};
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
            VersionText, get_versions, insert_models, insert_version, save_progress,
            set_agent_name, upsert_agent,
        },
    },
    env::agent_versioning::{
        ACTIVE_WINDOW_SECONDS, INTERVAL_SECONDS, LOOKBACK_SECONDS, MAX_SAMPLES, MIN_RUN,
        ROLLOUT_WINDOW_SECONDS, SAMPLES_PER_MINUTE,
    },
    llm::LlmClient,
    traces::sp_versioning::tool_text,
};

const NS: i64 = 1_000_000_000;
/// Async inserts become readable shortly after `ingested_at`; reading only up
/// to this far behind now keeps a row from being skipped before it is visible.
const VISIBILITY_LAG_NS: i64 = 2 * 60 * NS;
/// `agent_prompts` TTL: nothing older can be read back.
const RETENTION_NS: i64 = 7 * 24 * 60 * 60 * NS;

/// Labelled-context windows to try in turn: the lookback, widened 8x at a
/// time up to the retention. A busy agent fills the first; only a quiet
/// agent, with few rows to scan, reaches the wide ones.
fn lookbacks(first: i64) -> Vec<i64> {
    let mut windows = vec![first.clamp(NS, RETENTION_NS)];
    while let Some(&last) = windows.last()
        && last < RETENTION_NS
    {
        windows.push(last.saturating_mul(8).min(RETENTION_NS));
    }
    windows
}

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
        let pool = &self.db.pool;
        let ch = &self.clickhouse;
        let params = Params {
            min_run: MIN_RUN.get(),
            rollout_window: ROLLOUT_WINDOW_SECONDS.get() * NS,
        };

        let agent = upsert_agent(pool, project_id, agent_hash).await?;
        let versions = get_versions(pool, agent.id).await?;
        let cores: Vec<Vec<u64>> = versions
            .iter()
            .map(|v| v.core_lines.iter().map(|&l| l as u64).collect())
            .collect();
        let current = agent
            .current_version_id
            .and_then(|id| versions.iter().position(|v| v.id == id));

        let watermark = now - VISIBILITY_LAG_NS;
        let scope = Scope {
            project_id,
            agent_hash,
            watermark,
        };
        let horizon = agent.labeled_until.unwrap_or(0);
        let per_minute = SAMPLES_PER_MINUTE.get();
        let mut labeled = Vec::new();
        if let Some(until) = agent.labeled_until {
            // A flip needs N samples before it, which a quiet agent may have
            // produced hours ago: widen until the window holds them.
            let limit = 2 * params.min_run as u64;
            for lookback in lookbacks(LOOKBACK_SECONDS.get() * NS) {
                labeled = scope
                    .samples(ch, (until - lookback, until), per_minute, limit, true)
                    .await?;
                if labeled.len() as u64 >= limit {
                    break;
                }
            }
        }
        labeled.reverse();
        let unlabeled = scope
            .samples(
                ch,
                (horizon, watermark),
                per_minute,
                MAX_SAMPLES.get(),
                false,
            )
            .await?;
        let to_samples = |prompts: &[TracePrompt]| -> Vec<Sample> {
            prompts
                .iter()
                .map(|p| Sample {
                    time: p.time,
                    lines: p.lines.clone(),
                })
                .collect()
        };
        let timeline = timeline::build(
            &Input {
                labeled: &to_samples(&labeled),
                unlabeled: &to_samples(&unlabeled),
                cores: &cores,
                current,
            },
            &params,
        );

        // New versions are appended to `cores`, so ids and hashes line up.
        let mut ids: Vec<Uuid> = versions.iter().map(|v| v.id).collect();
        let mut hashes: Vec<String> = versions.into_iter().map(|v| v.version_hash).collect();
        let mut system_prompt = None;
        for new_version in &timeline.new_versions {
            let core = &timeline.cores[new_version.version];
            let example = labeled.iter().chain(&unlabeled).nth(new_version.example);
            let (prompt, text) = match example {
                Some(example) => self.version_text(project_id, example, core).await?,
                None => Default::default(),
            };
            let hash = version_hash(agent_hash, core);
            let lines: Vec<i64> = core.iter().map(|&l| l as i64).collect();
            ids.push(insert_version(pool, project_id, agent.id, &hash, &lines, &text).await?);
            hashes.push(hash);
            system_prompt = system_prompt.or(prompt.filter(|p| !p.is_empty()));
        }

        let mut labels = Vec::new();
        if let (Some(since), Some(until)) = (agent.watermark, agent.labeled_until) {
            for trace in scope.late(ch, since, until).await? {
                labels.push((timeline.version_by_content(&trace.lines), trace));
            }
        }
        if let Some(until) = timeline.labeled_until {
            labels.extend(
                self.label_range(&scope, &timeline, (horizon, until))
                    .await?,
            );
        }
        self.write_labels(project_id, agent_hash, &labels, &ids, &hashes)
            .await?;

        let current_version_id = timeline.current.map(|v| ids[v]);
        let labeled_until = timeline.labeled_until.or(agent.labeled_until);
        save_progress(pool, agent.id, labeled_until, watermark, current_version_id).await?;

        // Retried every run until it sticks, from any recent sample when
        // nothing was minted this run.
        if agent.name.is_none()
            && let Some(llm_client) = &self.llm_client
        {
            let system_prompt = match (system_prompt, unlabeled.last().or(labeled.last())) {
                (Some(prompt), _) => Some(prompt),
                (None, Some(sample)) => {
                    span_system_prompt(ch, project_id, sample.trace_id, sample.span_id).await?
                }
                (None, None) => None,
            };
            if let Some(system_prompt) = system_prompt {
                let name =
                    generate_agent_name(llm_client, project_id, agent.id, &system_prompt).await?;
                set_agent_name(pool, agent.id, &name).await?;
            }
        }
        Ok(())
    }

    /// Every trace starting in `(from, to]`, by time except where the timeline
    /// needs its prompt.
    async fn label_range(
        &self,
        scope: &Scope<'_>,
        timeline: &Timeline,
        range: (i64, i64),
    ) -> Result<Vec<(Option<usize>, TracePrompt)>> {
        let mut by_content = HashMap::new();
        for (from, to) in timeline.prompt_ranges() {
            // `[from, to)` as `(from - 1, to - 1]`, clipped to `range`.
            let clipped = ((from - 1).max(range.0), (to - 1).min(range.1));
            if clipped.0 < clipped.1 {
                for trace in scope.traces(&self.clickhouse, clipped, true).await? {
                    by_content.insert(trace.trace_id, trace);
                }
            }
        }
        let traces = scope.traces(&self.clickhouse, range, false).await?;
        Ok(traces
            .into_iter()
            .map(|trace| match by_content.remove(&trace.trace_id) {
                Some(trace) => (timeline.version_at(trace.time, Some(&trace.lines)), trace),
                None => (timeline.version_at(trace.time, None), trace),
            })
            .collect())
    }

    /// The example's system prompt, and the version's text: the example's
    /// system prompt and tool lines that are in the core, in document order.
    async fn version_text(
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

    async fn write_labels(
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

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: i64 = 60 * 60 * NS;

    #[test]
    fn lookbacks_widen_to_the_retention() {
        assert_eq!(
            lookbacks(HOUR),
            vec![HOUR, 8 * HOUR, 64 * HOUR, RETENTION_NS]
        );
        assert_eq!(lookbacks(30 * 24 * HOUR), vec![RETENTION_NS]);
        // A zero lookback still terminates.
        assert_eq!(lookbacks(0).last(), Some(&RETENTION_NS));
    }
}
