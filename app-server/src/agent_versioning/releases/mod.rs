//! The release path, for agents whose prompts carry the SDK's release. Each
//! release is decided once, oldest first: it keeps the version of the nearest
//! decided release unless a core line changed ([`compare`]). Every trace carrying a
//! decided release is tagged with its version, by the job and, once the
//! decision is cached, at ingest ([`super::ingest::tag_releases`]).

mod compare;

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use self::compare::{Decision, Params, PromptLines};
use super::{
    Job, NS, VISIBILITY_LAG_NS,
    ingest::{RELEASE_CACHE_TTL_SECONDS, release_cache_key},
    normalize::version_hash,
};
use crate::{
    cache::CacheTrait,
    ch::agent_prompts::{Scope, TracePrompt},
    db::agent_versioning::{
        Agent, Release, get_releases, get_versions, insert_version, save_progress, set_backfilled,
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
        let ingested_until = now - VISIBILITY_LAG_NS;
        let scope = Scope {
            project_id,
            agent_hash,
            ingested_until,
        };
        let mut run = Run::load(self, agent, scope, now).await?;
        let to_backfill = run.decide_pending().await?;
        let labels = run.tag(&to_backfill).await?;
        run.mark_backfilled(&to_backfill).await?;
        save_progress(
            &self.db.pool,
            agent.id,
            agent.tagged_until,
            ingested_until,
            run.current_version_id(),
        )
        .await?;

        let sample = labels.last().map(|(_, trace)| trace);
        self.name_agent(agent, project_id, run.system_prompt, sample)
            .await
    }
}

/// The agent's versions, addressed by index; new ones are appended, so
/// indexes stay valid.
struct Versions {
    ids: Vec<Uuid>,
    hashes: Vec<String>,
    cores: Vec<Vec<u64>>,
}

impl Versions {
    async fn load(pool: &PgPool, agent_id: Uuid) -> Result<Self> {
        let versions = get_versions(pool, agent_id).await?;
        let mut loaded = Self {
            ids: Vec::with_capacity(versions.len()),
            hashes: Vec::with_capacity(versions.len()),
            cores: Vec::with_capacity(versions.len()),
        };
        for v in versions {
            let core = v.core_lines.iter().map(|&l| l as u64).collect();
            loaded.push(v.id, v.version_hash, core);
        }
        Ok(loaded)
    }

    fn index(&self, id: Uuid) -> Option<usize> {
        self.ids.iter().position(|&v| v == id)
    }

    fn push(&mut self, id: Uuid, hash: String, core: Vec<u64>) -> usize {
        self.ids.push(id);
        self.hashes.push(hash);
        self.cores.push(core);
        self.cores.len() - 1
    }
}

/// One run of the release path over an agent.
struct Run<'a> {
    job: &'a Job,
    agent: &'a Agent,
    scope: Scope<'a>,
    params: Params,
    now: i64,
    /// Oldest first.
    releases: Vec<Release>,
    /// Traces per release still in `agent_prompts`.
    counts: HashMap<String, u64>,
    versions: Versions,
    /// Index into `versions` per release, once chosen.
    version_of: Vec<Option<usize>>,
    /// The version before the first release, while it still is the current one.
    before_releases: Option<usize>,
    /// Of the first version minted, for naming the agent.
    system_prompt: Option<String>,
}

impl<'a> Run<'a> {
    /// Records the releases seen in `agent_prompts` and loads them with the
    /// agent's versions.
    async fn load(job: &'a Job, agent: &'a Agent, scope: Scope<'a>, now: i64) -> Result<Self> {
        let pool = &job.db.pool;
        let stats = scope.releases(&job.clickhouse).await?;
        let (names, first_seen): (Vec<String>, Vec<i64>) = stats
            .iter()
            .map(|s| (s.release.clone(), s.first_seen))
            .unzip();
        upsert_releases(pool, scope.project_id, agent.id, &names, &first_seen).await?;
        let counts = stats.into_iter().map(|s| (s.release, s.traces)).collect();

        let releases = get_releases(pool, agent.id).await?;
        let versions = Versions::load(pool, agent.id).await?;
        let version_of = releases
            .iter()
            .map(|r| r.version_id.and_then(|id| versions.index(id)))
            .collect();
        let before_releases = match releases.iter().any(|r| r.backfilled_at.is_some()) {
            true => None,
            false => agent.current_version_id.and_then(|id| versions.index(id)),
        };

        Ok(Self {
            job,
            agent,
            scope,
            params: Params {
                min_run: RELEASE_MIN_RUN.get().max(1),
                decide_after: RELEASE_DECIDE_AFTER_SECONDS.get() * NS,
            },
            now,
            releases,
            counts,
            versions,
            version_of,
            before_releases,
            system_prompt: None,
        })
    }

    fn count(&self, release: &str) -> u64 {
        self.counts.get(release).copied().unwrap_or(0)
    }

    /// Chooses a version for every release not yet backfilled that can have
    /// one, oldest first, and returns the releases to backfill in this run.
    async fn decide_pending(&mut self) -> Result<HashSet<usize>> {
        let mut to_backfill = HashSet::new();
        for i in 0..self.releases.len() {
            if self.releases[i].backfilled_at.is_some() {
                continue;
            }
            // Chosen by a run that failed before backfilling it: tag it again with
            // the same version rather than re-sampling into another one.
            if self.version_of[i].is_none() {
                let Some(version) = self.choose(i).await? else {
                    continue;
                };
                let version_id = self.versions.ids[version];
                set_release_version(&self.job.db.pool, self.releases[i].id, version_id).await?;
                self.version_of[i] = Some(version);
            }
            to_backfill.insert(i);
        }
        Ok(to_backfill)
    }

    /// The version of release `i`, or `None` while it has too few traces.
    async fn choose(&mut self, i: usize) -> Result<Option<usize>> {
        let Some(limit) = self.sample_size(i) else {
            return Ok(None);
        };
        let samples = self
            .scope
            .release_samples(
                &self.job.clickhouse,
                &self.releases[i].release,
                i64::MAX,
                limit,
            )
            .await?;
        let Some(example) = samples.first() else {
            return Ok(None);
        };
        let lines = PromptLines::from_samples(samples.iter().map(|s| s.lines.as_slice()));
        let baseline = self.baseline(i).await?;

        let decision = compare::decide(
            &lines,
            baseline.as_ref().map(|(lines, _)| lines),
            &self.versions.cores,
        );
        Ok(Some(match decision {
            Decision::Same => baseline.map(|(_, version)| version).unwrap_or_default(),
            Decision::Existing(version) => version,
            Decision::New(core) => self.mint(example, core).await?,
        }))
    }

    fn sample_size(&self, i: usize) -> Option<u64> {
        let release = &self.releases[i];
        let newer_has_min_run = self.releases[i + 1..]
            .iter()
            .any(|r| self.count(&r.release) >= self.params.min_run);
        let age = self.now - release.first_seen;
        compare::sample_size(
            self.count(&release.release),
            newer_has_min_run,
            age,
            &self.params,
        )
    }

    /// What release `i` is compared against, with its version: the nearest
    /// decided release, earlier ones first, else the version before the first
    /// release. A release decided after a newer one (too few traces, or seen
    /// earlier later on) is still compared against samples rather than bare
    /// cores.
    async fn baseline(&self, i: usize) -> Result<Option<(PromptLines, usize)>> {
        let neighbour = (0..i)
            .rev()
            .chain(i + 1..self.releases.len())
            .find_map(|j| Some((j, self.version_of[j]?)));
        let (release, before, limit, version) = match (neighbour, self.before_releases) {
            (Some((j, version)), _) => {
                let release = self.releases[j].release.as_str();
                let limit = self.count(release).min(self.params.min_run);
                (release, i64::MAX, limit, version)
            }
            (None, Some(version)) => {
                let first_seen = self.releases[i].first_seen;
                ("", first_seen, self.params.min_run, version)
            }
            (None, None) => return Ok(None),
        };
        let lines = self.prompt_lines(release, before, limit, version).await?;
        Ok(Some((lines, version)))
    }

    /// Up to `limit` sampled prompts of `release` starting before `before`,
    /// or the core of `version` once they have expired.
    async fn prompt_lines(
        &self,
        release: &str,
        before: i64,
        limit: u64,
        version: usize,
    ) -> Result<PromptLines> {
        let samples = match limit {
            0 => Vec::new(),
            limit => {
                self.scope
                    .release_samples(&self.job.clickhouse, release, before, limit)
                    .await?
            }
        };
        Ok(match samples.is_empty() {
            true => PromptLines::from_core(&self.versions.cores[version]),
            false => PromptLines::from_samples(samples.iter().map(|s| s.lines.as_slice())),
        })
    }

    /// Saves a new version with `core`, its text taken from `example`.
    async fn mint(&mut self, example: &TracePrompt, core: Vec<u64>) -> Result<usize> {
        let project_id = self.scope.project_id;
        let (prompt, text) = self.job.version_text(project_id, example, &core).await?;
        let hash = version_hash(self.scope.agent_hash, &core);
        let lines: Vec<i64> = core.iter().map(|&l| l as i64).collect();
        let pool = &self.job.db.pool;
        let id = insert_version(pool, project_id, self.agent.id, &hash, &lines, &text).await?;
        self.system_prompt = self
            .system_prompt
            .take()
            .or(prompt.filter(|p| !p.is_empty()));
        Ok(self.versions.push(id, hash, core))
    }

    /// Whether `release` has prompts starting by the inferred path's
    /// `tagged_until`, so some of its traces may carry an inferred tag. Every
    /// such trace was ingested before release mode recorded `first_seen`,
    /// which only moves earlier, so a release past it has none.
    fn before_horizon(&self, release: &Release) -> bool {
        self.agent
            .tagged_until
            .is_some_and(|until| release.first_seen <= until)
    }

    /// Only traces starting after the inferred path's `tagged_until`: those
    /// before it keep their inferred tag, as a second one would count them
    /// twice. Releases backfilled now get all of them. Ingest tags later
    /// traces once it sees the decision, but may have missed traces of releases
    /// backfilled in the previous run, before its cache entry, and leaves
    /// releases before the horizon to this ([`super::ingest`]).
    async fn tag(&self, to_backfill: &HashSet<usize>) -> Result<Vec<(Option<usize>, TracePrompt)>> {
        let ch = &self.job.clickhouse;
        let since = self.agent.ingested_until.unwrap_or(0);
        let after = self.agent.tagged_until.unwrap_or(0);
        let mut fresh = Vec::new();
        let mut recent = Vec::new();
        let mut version_by_release = HashMap::new();
        for (i, (release, version)) in self.releases.iter().zip(&self.version_of).enumerate() {
            let Some(version) = *version else { continue };
            version_by_release.insert(release.release.as_str(), version);
            if to_backfill.contains(&i) {
                fresh.push(release.release.as_str());
            } else if release.backfilled_at.is_some_and(|at| at > since)
                || self.before_horizon(release)
            {
                recent.push(release.release.as_str());
            }
        }

        let mut traces = Vec::new();
        if !fresh.is_empty() {
            traces.extend(self.scope.release_traces(ch, &fresh, 0, after).await?);
        }
        if !recent.is_empty() {
            traces.extend(self.scope.release_traces(ch, &recent, since, after).await?);
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

        let Versions { ids, hashes, .. } = &self.versions;
        for chunk in labels.chunks(LABEL_CHUNK) {
            self.job
                .write_labels(
                    self.scope.project_id,
                    self.scope.agent_hash,
                    chunk,
                    ids,
                    hashes,
                )
                .await?;
        }
        Ok(labels)
    }

    /// Marked only once tagged, so a run that fails before this leaves its
    /// releases pending and the next one tags all their traces again.
    async fn mark_backfilled(&self, to_backfill: &HashSet<usize>) -> Result<()> {
        for &i in to_backfill {
            let (release, Some(version)) = (&self.releases[i], self.version_of[i]) else {
                continue;
            };
            set_backfilled(&self.job.db.pool, release.id).await?;
            let key = release_cache_key(
                self.scope.project_id,
                self.scope.agent_hash,
                &release.release,
            );
            // Empty: ingest has no trace starts to check against the horizon.
            let hash = match self.before_horizon(release) {
                true => String::new(),
                false => self.versions.hashes[version].clone(),
            };
            if let Err(e) = self
                .job
                .cache
                .insert_with_ttl(&key, hash, RELEASE_CACHE_TTL_SECONDS)
                .await
            {
                log::warn!("[AGENT VERSIONING] Failed to cache {key}: {e:?}");
            }
        }
        Ok(())
    }

    /// The newest decided release's version.
    fn current_version_id(&self) -> Option<Uuid> {
        self.version_of
            .iter()
            .rev()
            .find_map(|v| v.map(|v| self.versions.ids[v]))
            .or(self.agent.current_version_id)
    }
}
