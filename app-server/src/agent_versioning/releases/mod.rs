//! The release path, for agents whose prompts carry the SDK's release. Each
//! release is decided once, oldest first: it keeps the version of the nearest
//! decided release unless a core line changed ([`compare`]). Every trace carrying a
//! decided release is tagged with its version, by the job and, once the
//! decision is cached, at ingest ([`super::ingest::tag_releases`]).

mod compare;

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use uuid::Uuid;

use self::compare::{Decision, Params, Side};
use super::{
    Job, NS, VISIBILITY_LAG_NS,
    ingest::{RELEASE_CACHE_TTL_SECONDS, release_cache_key},
    normalize::version_hash,
};
use crate::{
    cache::CacheTrait,
    ch::agent_prompts::{Scope, TracePrompt},
    db::agent_versioning::{
        Agent, decide_release, get_releases, get_versions, insert_version, save_progress,
        set_release_version, upsert_releases,
    },
    env::agent_versioning::{RELEASE_DECIDE_AFTER_SECONDS, RELEASE_MIN_RUN},
};

/// Traces tagged per `traces_agg` insert.
const LABEL_CHUNK: usize = 10_000;

impl Job {
    pub(super) async fn version_releases(
        &self,
        agent: &Agent,
        project_id: Uuid,
        agent_hash: &str,
        now: i64,
    ) -> Result<()> {
        let pool = &self.db.pool;
        let ch = &self.clickhouse;
        let params = Params {
            min_run: RELEASE_MIN_RUN.get().max(1),
            decide_after: RELEASE_DECIDE_AFTER_SECONDS.get() * NS,
        };
        let watermark = now - VISIBILITY_LAG_NS;
        let scope = Scope {
            project_id,
            agent_hash,
            watermark,
        };

        let stats = scope.releases(ch).await?;
        let (names, first_seen): (Vec<String>, Vec<i64>) = stats
            .iter()
            .map(|s| (s.release.clone(), s.first_seen))
            .unzip();
        upsert_releases(pool, project_id, agent.id, &names, &first_seen).await?;
        let counts: HashMap<&str, u64> = stats
            .iter()
            .map(|s| (s.release.as_str(), s.traces))
            .collect();
        let count = |release: &str| counts.get(release).copied().unwrap_or(0);
        let releases = get_releases(pool, agent.id).await?;

        // New versions are appended to `cores`, so ids and hashes line up.
        let versions = get_versions(pool, agent.id).await?;
        let mut cores: Vec<Vec<u64>> = versions
            .iter()
            .map(|v| v.core_lines.iter().map(|&l| l as u64).collect())
            .collect();
        let mut ids: Vec<Uuid> = versions.iter().map(|v| v.id).collect();
        let mut hashes: Vec<String> = versions.into_iter().map(|v| v.version_hash).collect();
        let index = |ids: &[Uuid], id: Uuid| ids.iter().position(|&v| v == id);
        let mut version_of: Vec<Option<usize>> = releases
            .iter()
            .map(|r| r.version_id.and_then(|id| index(&ids, id)))
            .collect();
        // The version before the first release, while it still is the current one.
        let before_releases = match releases.iter().any(|r| r.decided_at.is_some()) {
            true => None,
            false => agent.current_version_id.and_then(|id| index(&ids, id)),
        };

        let mut decided_now = HashSet::new();
        let mut system_prompt = None;
        for (i, release) in releases.iter().enumerate() {
            if release.decided_at.is_some() {
                continue;
            }
            // Chosen by a run that failed before deciding it: tag it again with
            // the same version rather than re-sampling into another one.
            if version_of[i].is_some() {
                decided_now.insert(i);
                continue;
            }
            let newer_has_min_run = releases[i + 1..]
                .iter()
                .any(|r| count(&r.release) >= params.min_run);
            let age = now - release.first_seen;
            let Some(limit) =
                compare::sample_size(count(&release.release), newer_has_min_run, age, &params)
            else {
                continue;
            };
            let samples = scope
                .release_samples(ch, &release.release, i64::MAX, limit)
                .await?;
            let Some(example) = samples.first() else {
                continue;
            };
            let side = Side::from_samples(samples.iter().map(|s| s.lines.as_slice()));

            // The nearest decided release, earlier ones first: a release decided
            // after a newer one (too few traces, or seen earlier later on) is
            // still compared against samples rather than bare cores.
            let neighbour = (0..i)
                .rev()
                .chain(i + 1..releases.len())
                .find_map(|j| Some((j, version_of[j]?)));
            let baseline = match (neighbour, before_releases) {
                (Some((j, version)), _) => {
                    let release = &releases[j].release;
                    let limit = count(release).min(params.min_run);
                    let side = self
                        .side(&scope, release, i64::MAX, limit, &cores[version])
                        .await?;
                    Some((side, version))
                }
                (None, Some(version)) => {
                    let side = self
                        .side(
                            &scope,
                            "",
                            release.first_seen,
                            params.min_run,
                            &cores[version],
                        )
                        .await?;
                    Some((side, version))
                }
                (None, None) => None,
            };

            let version = match compare::decide(&side, baseline.as_ref().map(|b| &b.0), &cores) {
                Decision::Same => baseline.map(|b| b.1).unwrap_or_default(),
                Decision::Existing(version) => version,
                Decision::New(core) => {
                    let (prompt, text) = self.version_text(project_id, example, &core).await?;
                    let hash = version_hash(agent_hash, &core);
                    let lines: Vec<i64> = core.iter().map(|&l| l as i64).collect();
                    ids.push(
                        insert_version(pool, project_id, agent.id, &hash, &lines, &text).await?,
                    );
                    hashes.push(hash);
                    cores.push(core);
                    system_prompt = system_prompt.or(prompt.filter(|p| !p.is_empty()));
                    cores.len() - 1
                }
            };
            set_release_version(pool, release.id, ids[version]).await?;
            version_of[i] = Some(version);
            decided_now.insert(i);
        }

        // Releases decided now get every trace past the inferred path's horizon;
        // those before it keep their inferred tag, as a second one would count
        // them twice. Ingest tags the rest once it sees the decision, but may
        // have missed traces of releases decided in the previous run, before
        // its cache entry ([`super::ingest`]).
        let since = agent.watermark.unwrap_or(0);
        let mut fresh = Vec::new();
        let mut recent = Vec::new();
        let mut version_by_release = HashMap::new();
        for (i, (release, version)) in releases.iter().zip(&version_of).enumerate() {
            let Some(version) = *version else { continue };
            version_by_release.insert(release.release.as_str(), version);
            if decided_now.contains(&i) {
                fresh.push(release.release.as_str());
            } else if release.decided_at.is_some_and(|at| at > since) {
                recent.push(release.release.as_str());
            }
        }
        let mut traces = Vec::new();
        if !fresh.is_empty() {
            let after = agent.labeled_until.unwrap_or(0);
            traces.extend(scope.release_traces(ch, &fresh, 0, after).await?);
        }
        if !recent.is_empty() {
            traces.extend(scope.release_traces(ch, &recent, since, 0).await?);
        }
        let labels: Vec<(Option<usize>, TracePrompt)> = traces
            .into_iter()
            .map(|trace| {
                let version = version_by_release
                    .get(trace.trace_release.as_str())
                    .copied();
                (version, trace)
            })
            .collect();
        for chunk in labels.chunks(LABEL_CHUNK) {
            self.write_labels(project_id, agent_hash, chunk, &ids, &hashes)
                .await?;
        }

        // Decided only once tagged, so a run that fails before this leaves its
        // releases undecided and the next one tags all their traces again.
        for &i in &decided_now {
            let (release, Some(version)) = (&releases[i], version_of[i]) else {
                continue;
            };
            decide_release(pool, release.id).await?;
            let key = release_cache_key(project_id, agent_hash, &release.release);
            if let Err(e) = self
                .cache
                .insert_with_ttl(&key, hashes[version].clone(), RELEASE_CACHE_TTL_SECONDS)
                .await
            {
                log::warn!("[AGENT VERSIONING] Failed to cache {key}: {e:?}");
            }
        }

        let current_version_id = version_of
            .iter()
            .rev()
            .find_map(|v| v.map(|v| ids[v]))
            .or(agent.current_version_id);
        save_progress(
            pool,
            agent.id,
            agent.labeled_until,
            watermark,
            current_version_id,
        )
        .await?;

        let sample = labels.last().map(|(_, trace)| trace);
        self.name_agent(agent, project_id, system_prompt, sample)
            .await
    }

    /// Up to `limit` sampled prompts of `release` starting before `before`,
    /// or `core` once they have expired.
    async fn side(
        &self,
        scope: &Scope<'_>,
        release: &str,
        before: i64,
        limit: u64,
        core: &[u64],
    ) -> Result<Side> {
        let samples = match limit {
            0 => Vec::new(),
            limit => {
                scope
                    .release_samples(&self.clickhouse, release, before, limit)
                    .await?
            }
        };
        Ok(match samples.is_empty() {
            true => Side::from_core(core),
            false => Side::from_samples(samples.iter().map(|s| s.lines.as_slice())),
        })
    }
}
