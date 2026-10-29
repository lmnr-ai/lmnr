//! Project-scoped sandboxes on top of the provider. Harbor's `LaminarEnvironment`
//! (shipped in lmnr-cli) drives trial sandboxes through
//! `/v1/hosted-evals/sandboxes/*`; every call checks the sandbox belongs to the
//! caller's project. Creates go through a per-project cap.

use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

use anyhow::{Result, bail};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    HostedEvals,
    provider::{
        CreateFailure, ImageState, Resources, SandboxHandle, SandboxImage, SandboxProvider,
        SandboxProviderTrait, SandboxRole, SandboxSpec, SandboxState, SandboxStatus,
    },
};
use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            HOSTED_EVALS_CAPACITY_LOCK_CACHE_KEY, HOSTED_EVALS_RECENT_SANDBOXES_CACHE_KEY,
            HOSTED_EVALS_SANDBOX_CACHE_KEY,
        },
    },
    env,
};

/// Outlives the work under the lock (one list, one create, each capped at 30 s by
/// the provider client), so a lock that is still held never expires and gets
/// released by someone else.
const CAPACITY_LOCK_TTL_SECONDS: u64 = 90;
/// A create takes ~100 ms, so a burst of trials queues for seconds. Past this
/// the client gets a 429 and retries.
const CAPACITY_LOCK_WAIT: Duration = Duration::from_secs(60);
const CAPACITY_LOCK_POLL: Duration = Duration::from_millis(100);
/// Daytona lists a new sandbox ~1 s after the create returns; creates younger
/// than this are counted from the cache instead.
const RECENT_CREATE_WINDOW_SECONDS: i64 = 15;
const RECENT_CREATES_TTL_SECONDS: u64 = RECENT_CREATE_WINDOW_SECONDS as u64 * 4;
const START_TIMEOUT: Duration = Duration::from_secs(120);
const START_POLL: Duration = Duration::from_secs(1);

/// An image pushed through `/hosted-evals/images` and the resources to run it
/// with: the body of both `/images/snapshots` and `/sandboxes`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRequest {
    /// Manifest digest.
    pub image: String,
    pub cpus: Option<u32>,
    pub memory_gb: Option<u32>,
    pub disk_gb: Option<u32>,
}

impl ImageRequest {
    fn resources(&self) -> Resources {
        Resources::clamped(self.cpus, self.memory_gb, self.disk_gb)
    }
}

/// A sandbox the project created moments ago, possibly not listed yet.
#[derive(Serialize, Deserialize)]
struct RecentCreate {
    id: String,
    created_at: DateTime<Utc>,
}

pub enum CreateError {
    ImageNotReady,
    TooManySandboxes(usize),
    CapacityBusy,
    Upstream(anyhow::Error),
}

impl From<CreateFailure> for CreateError {
    fn from(e: CreateFailure) -> Self {
        match e {
            CreateFailure::ImageNotReady => Self::ImageNotReady,
            CreateFailure::Upstream(e) => Self::Upstream(e),
        }
    }
}

/// Makes the image startable with the request's resources; callers poll until
/// `Ready`. A digest another project pushed isn't in this project's repository,
/// so the provider fails to pull it instead of reading someone else's image.
pub async fn prepare_image(
    hosted: &HostedEvals,
    project_id: &Uuid,
    request: &ImageRequest,
) -> Result<ImageState> {
    let repository = hosted.registry.repository(project_id).await?;
    hosted
        .provider
        .prepare_image(
            project_id,
            &repository.pushed_image(&request.image),
            request.resources(),
        )
        .await
}

pub async fn create_trial(
    provider: &SandboxProvider,
    cache: &Cache,
    project_id: &Uuid,
    request: &ImageRequest,
) -> Result<String, CreateError> {
    let spec = SandboxSpec {
        project_id: *project_id,
        role: SandboxRole::Trial,
        image: SandboxImage::Pushed {
            digest: request.image.clone(),
            resources: request.resources(),
        },
        env: HashMap::new(),
        ttl_minutes: env::hosted_evals::MAX_RUN_MINUTES.get(),
    };
    Ok(create(provider, cache, spec).await?.id)
}

/// Creates a sandbox for the project unless it already holds
/// `HOSTED_EVALS_MAX_SANDBOXES_PER_PROJECT`. The count and the create run under
/// a per-project lock: Harbor starts trials concurrently, and unlocked they
/// would all pass the same count. The lock also guards the recent-creates list.
pub async fn create(
    provider: &SandboxProvider,
    cache: &Cache,
    spec: SandboxSpec,
) -> Result<SandboxHandle, CreateError> {
    let project_id = spec.project_id;
    let lock_key = format!("{HOSTED_EVALS_CAPACITY_LOCK_CACHE_KEY}:{project_id}");
    let recent_key = format!("{HOSTED_EVALS_RECENT_SANDBOXES_CACHE_KEY}:{project_id}");
    let locked = acquire_capacity_lock(cache, &lock_key).await?;
    let result = async {
        let mut recent = recent_creates(cache, &recent_key).await;
        let max = env::hosted_evals::MAX_SANDBOXES_PER_PROJECT.get();
        let listed = provider
            .list_live(&project_id, max + 1)
            .await
            .map_err(CreateError::Upstream)?;
        if count_live(&listed, &recent) >= max {
            return Err(CreateError::TooManySandboxes(max));
        }
        let sandbox = provider.create(spec).await?;
        recent.push(RecentCreate {
            id: sandbox.id.clone(),
            created_at: Utc::now(),
        });
        if let Err(e) = cache
            .insert_with_ttl(&recent_key, &recent, RECENT_CREATES_TTL_SECONDS)
            .await
        {
            log::warn!(
                "Failed to record hosted evals sandbox {}: {e:?}",
                sandbox.id
            );
        }
        Ok(sandbox)
    }
    .await;
    if locked && let Err(e) = cache.release_lock(&lock_key).await {
        log::warn!("Failed to release hosted evals capacity lock for project {project_id}: {e:?}");
    }
    let sandbox = result?;
    remember(cache, &project_id, &sandbox).await;
    Ok(sandbox)
}

/// `Ok(false)` when the cache itself fails: creates then go ahead unlocked, so
/// the cap is best-effort during a cache outage rather than hosted evals failing.
async fn acquire_capacity_lock(cache: &Cache, key: &str) -> Result<bool, CreateError> {
    let deadline = Instant::now() + CAPACITY_LOCK_WAIT;
    loop {
        match cache.try_acquire_lock(key, CAPACITY_LOCK_TTL_SECONDS).await {
            Ok(true) => return Ok(true),
            Ok(false) if Instant::now() < deadline => tokio::time::sleep(CAPACITY_LOCK_POLL).await,
            Ok(false) => return Err(CreateError::CapacityBusy),
            Err(e) => {
                log::warn!("Hosted evals capacity lock unavailable, creating without it: {e:?}");
                return Ok(false);
            }
        }
    }
}

/// The project's creates within `RECENT_CREATE_WINDOW_SECONDS`.
async fn recent_creates(cache: &Cache, key: &str) -> Vec<RecentCreate> {
    let cutoff = Utc::now() - chrono::Duration::seconds(RECENT_CREATE_WINDOW_SECONDS);
    let recent: Vec<RecentCreate> = cache.get(key).await.ok().flatten().unwrap_or_default();
    recent
        .into_iter()
        .filter(|r| r.created_at > cutoff)
        .collect()
}

/// Live sandboxes: the listed ones plus recent creates missing from the list.
/// Deleted sandboxes drop out of the list too, so a recent create missing from
/// it is either not listed yet or already deleted; counting it errs on the safe
/// side.
fn count_live(listed: &[String], recent: &[RecentCreate]) -> usize {
    let listed_ids: HashSet<&str> = listed.iter().map(String::as_str).collect();
    let unlisted = recent
        .iter()
        .filter(|r| !listed_ids.contains(r.id.as_str()))
        .count();
    listed_ids.len() + unlisted
}

async fn remember(cache: &Cache, project_id: &Uuid, sandbox: &SandboxHandle) {
    let ttl = u64::from(env::hosted_evals::MAX_RUN_MINUTES.get()) * 60;
    if let Err(e) = cache
        .insert_with_ttl(&cache_key(project_id, &sandbox.id), &sandbox.route, ttl)
        .await
    {
        log::warn!("Failed to cache hosted eval sandbox {}: {e:?}", sandbox.id);
    }
}

/// The project's sandbox, or `None` if it doesn't exist or belongs to another project.
pub async fn resolve(
    provider: &SandboxProvider,
    cache: &Cache,
    project_id: &Uuid,
    sandbox_id: &str,
) -> Result<Option<SandboxHandle>> {
    if let Ok(Some(route)) = cache
        .get::<String>(&cache_key(project_id, sandbox_id))
        .await
    {
        return Ok(Some(SandboxHandle {
            id: sandbox_id.to_string(),
            route,
        }));
    }
    let Some(info) = provider.get(sandbox_id).await? else {
        return Ok(None);
    };
    if info.project_id != Some(*project_id) {
        return Ok(None);
    }
    remember(cache, project_id, &info.handle).await;
    Ok(Some(info.handle))
}

pub async fn status(provider: &SandboxProvider, sandbox: &SandboxHandle) -> Result<SandboxStatus> {
    Ok(match provider.get(&sandbox.id).await? {
        Some(info) => info.status,
        None => SandboxStatus {
            state: SandboxState::Destroyed,
            error_reason: None,
        },
    })
}

pub async fn delete(
    provider: &SandboxProvider,
    cache: &Cache,
    project_id: &Uuid,
    sandbox_id: &str,
) -> Result<()> {
    provider.delete(sandbox_id).await?;
    let _ = cache.remove(&cache_key(project_id, sandbox_id)).await;
    Ok(())
}

/// Polls a just-created sandbox until it starts: toolbox calls fail before.
pub async fn wait_until_started(provider: &SandboxProvider, sandbox_id: &str) -> Result<()> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        let Some(info) = provider.get(sandbox_id).await? else {
            bail!("Sandbox {sandbox_id} disappeared before starting");
        };
        match info.status.state {
            SandboxState::Started => return Ok(()),
            SandboxState::Error | SandboxState::Destroyed => bail!(
                "Sandbox {sandbox_id} failed to start: {}",
                info.status.error_reason.unwrap_or_default()
            ),
            SandboxState::Pending if Instant::now() >= deadline => {
                bail!("Sandbox {sandbox_id} did not start within {START_TIMEOUT:?}")
            }
            SandboxState::Pending => tokio::time::sleep(START_POLL).await,
        }
    }
}

fn cache_key(project_id: &Uuid, sandbox_id: &str) -> String {
    format!("{HOSTED_EVALS_SANDBOX_CACHE_KEY}:{project_id}:{sandbox_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_count_adds_recent_creates_not_listed_yet() {
        let recent = |id: &str| RecentCreate {
            id: id.to_string(),
            created_at: Utc::now(),
        };
        let listed = vec!["a".to_string(), "b".to_string()];
        assert_eq!(count_live(&listed, &[]), 2);
        assert_eq!(count_live(&listed, &[recent("a"), recent("c")]), 3);
        assert_eq!(count_live(&[], &[recent("c"), recent("d")]), 2);
    }
}
