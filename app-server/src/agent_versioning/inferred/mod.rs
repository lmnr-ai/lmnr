//! The inferred path, for agents whose prompts carry no release: build the
//! version timeline from sampled prompts, mint versions, and tag traces by
//! time up to the labelling horizon.

mod timeline;

use std::collections::HashMap;

use anyhow::Result;
use uuid::Uuid;

use self::timeline::{Input, Params, Sample, Timeline};
use super::{Job, NS, VISIBILITY_LAG_NS, normalize::version_hash};
use crate::{
    ch::agent_prompts::{Scope, TracePrompt},
    db::agent_versioning::{Agent, get_versions, insert_version, save_progress},
    env::agent_versioning::{
        LOOKBACK_SECONDS, MAX_SAMPLES, MIN_RUN, ROLLOUT_WINDOW_SECONDS, SAMPLES_PER_MINUTE,
    },
};

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

impl Job {
    pub(super) async fn version_inferred(
        &self,
        agent: &Agent,
        project_id: Uuid,
        agent_hash: &str,
        now: i64,
    ) -> Result<()> {
        let pool = &self.db.pool;
        let ch = &self.clickhouse;
        let params = Params {
            min_run: MIN_RUN.get(),
            rollout_window: ROLLOUT_WINDOW_SECONDS.get() * NS,
        };

        let versions = get_versions(pool, agent.id).await?;
        let cores: Vec<Vec<u64>> = versions
            .iter()
            .map(|v| v.core_lines.iter().map(|&l| l as u64).collect())
            .collect();
        let current = agent
            .current_version_id
            .and_then(|id| versions.iter().position(|v| v.id == id));

        let ingested_until = now - VISIBILITY_LAG_NS;
        let scope = Scope {
            project_id,
            agent_hash,
            ingested_until,
        };
        let horizon = agent.tagged_until.unwrap_or(0);
        let per_minute = SAMPLES_PER_MINUTE.get();
        let mut labeled = Vec::new();
        if let Some(until) = agent.tagged_until {
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
                (horizon, ingested_until),
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
        if let (Some(since), Some(until)) = (agent.ingested_until, agent.tagged_until) {
            for trace in scope.late(ch, since, until).await? {
                labels.push((timeline.version_by_content(&trace.lines), trace));
            }
        }
        if let Some(until) = timeline.tagged_until {
            labels.extend(
                self.label_range(&scope, &timeline, (horizon, until))
                    .await?,
            );
        }
        self.write_labels(project_id, agent_hash, &labels, &ids, &hashes)
            .await?;

        let current_version_id = timeline.current.map(|v| ids[v]);
        let tagged_until = timeline.tagged_until.or(agent.tagged_until);
        save_progress(
            pool,
            agent.id,
            tagged_until,
            ingested_until,
            current_version_id,
        )
        .await?;

        let sample = unlabeled.last().or(labeled.last());
        self.name_agent(agent, project_id, system_prompt, sample)
            .await
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
