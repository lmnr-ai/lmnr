//! Project-scoped trial sandboxes. Harbor's `LaminarEnvironment` (shipped in
//! lmnr-cli) drives these through `/v1/hosted-evals/sandboxes/*`; every call
//! checks the sandbox carries the caller's project label.

use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

use anyhow::Result;
use bytes::Bytes;
use chrono::{DateTime, Utc};
use reqwest::Response;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    PROJECT_LABEL, contexts,
    daytona::{self, BuildInfo, CreateSandbox, Daytona, Sandbox, Toolbox},
    daytona_client, shell_quote,
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

const STDERR_DIR: &str = "/tmp/.lmnr-exec";
/// Outlives the work under the lock (one list, one create), so a lock that is
/// still held never expires and gets released by someone else.
const CAPACITY_LOCK_TTL_SECONDS: u64 =
    daytona::LIST_TIMEOUT.as_secs() + daytona::CREATE_TIMEOUT.as_secs() + 30;
/// Daytona answers a create in ~100 ms, so a burst of trials queues for seconds.
/// Past this the client gets a 429 and retries.
const CAPACITY_LOCK_WAIT: Duration = Duration::from_secs(60);
const CAPACITY_LOCK_POLL: Duration = Duration::from_millis(100);
/// Daytona's sandbox list shows a new sandbox ~1 s after the create returns;
/// creates younger than this are counted from the cache instead.
const RECENT_CREATE_WINDOW_SECONDS: i64 = 15;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTrialSandbox {
    pub dockerfile: String,
    /// `md5` of each context tar uploaded to `/hosted-evals/contexts/{hash}`.
    #[serde(default)]
    pub context_hashes: Vec<String>,
    pub cpus: Option<u32>,
    pub memory_gb: Option<u32>,
    pub disk_gb: Option<u32>,
}

/// A sandbox the project created moments ago, possibly not listed yet.
#[derive(Serialize, Deserialize)]
struct RecentCreate {
    id: String,
    created_at: DateTime<Utc>,
}

pub enum CreateError {
    InvalidContextHash(String),
    TooManySandboxes(usize),
    CapacityBusy,
    Daytona(anyhow::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStatus {
    pub state: String,
    pub error_reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
}

/// A sandbox resolved for one project, ready for toolbox calls.
pub struct ProjectSandbox {
    pub id: String,
    toolbox: Toolbox,
}

pub fn is_context_hash(hash: &str) -> bool {
    hash.len() == 32 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

pub async fn create(
    http: &reqwest::Client,
    cache: &Cache,
    project_id: &Uuid,
    request: CreateTrialSandbox,
) -> Result<String, CreateError> {
    if let Some(hash) = request.context_hashes.iter().find(|h| !is_context_hash(h)) {
        return Err(CreateError::InvalidContextHash(hash.clone()));
    }
    let daytona = daytona_client(http).map_err(CreateError::Daytona)?;
    let sandbox = create_within_capacity(
        &daytona,
        cache,
        project_id,
        &CreateSandbox {
            labels: project_labels(project_id, "trial"),
            build_info: Some(BuildInfo {
                dockerfile_content: request.dockerfile,
                context_hashes: request
                    .context_hashes
                    .iter()
                    .map(|hash| contexts::stored_hash(project_id, hash))
                    .collect(),
            }),
            cpu: request
                .cpus
                .map(|c| c.clamp(1, env::hosted_evals::MAX_SANDBOX_CPUS.get())),
            memory: request
                .memory_gb
                .map(|m| m.clamp(1, env::hosted_evals::MAX_SANDBOX_MEMORY_GB.get())),
            disk: request
                .disk_gb
                .map(|d| d.clamp(1, env::hosted_evals::MAX_SANDBOX_DISK_GB.get())),
            ttl_minutes: env::hosted_evals::MAX_RUN_MINUTES.get(),
            ..Default::default()
        },
    )
    .await?;
    remember(cache, project_id, &sandbox.id, &sandbox.toolbox_proxy_url).await;
    Ok(sandbox.id)
}

/// Labels for every sandbox a project owns; `role` is `trial` or `orchestrator`.
pub fn project_labels(project_id: &Uuid, role: &str) -> HashMap<String, String> {
    HashMap::from([
        (PROJECT_LABEL.to_string(), project_id.to_string()),
        ("lmnr-role".to_string(), role.to_string()),
    ])
}

/// Creates a sandbox for the project unless it already holds
/// `HOSTED_EVALS_MAX_SANDBOXES_PER_PROJECT`. The count and the create run under
/// a per-project lock: Harbor starts trials concurrently, and unlocked they
/// would all pass the same count. The lock also guards the recent-creates list.
pub async fn create_within_capacity(
    daytona: &Daytona<'_>,
    cache: &Cache,
    project_id: &Uuid,
    request: &CreateSandbox,
) -> Result<Sandbox, CreateError> {
    let lock_key = format!("{HOSTED_EVALS_CAPACITY_LOCK_CACHE_KEY}:{project_id}");
    let recent_key = format!("{HOSTED_EVALS_RECENT_SANDBOXES_CACHE_KEY}:{project_id}");
    let locked = acquire_capacity_lock(cache, &lock_key).await?;
    let result = async {
        let mut recent = recent_creates(cache, &recent_key).await;
        ensure_capacity(daytona, project_id, &recent).await?;
        let sandbox = daytona
            .create_sandbox(request)
            .await
            .map_err(CreateError::Daytona)?;
        recent.push(RecentCreate {
            id: sandbox.id.clone(),
            created_at: Utc::now(),
        });
        let ttl = RECENT_CREATE_WINDOW_SECONDS as u64 * 4;
        if let Err(e) = cache.insert_with_ttl(&recent_key, &recent, ttl).await {
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
    result
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

async fn ensure_capacity(
    daytona: &Daytona<'_>,
    project_id: &Uuid,
    recent: &[RecentCreate],
) -> Result<(), CreateError> {
    let max = env::hosted_evals::MAX_SANDBOXES_PER_PROJECT.get();
    let existing = daytona
        .list_sandboxes(
            &HashMap::from([(PROJECT_LABEL.to_string(), project_id.to_string())]),
            max + 1,
        )
        .await
        .map_err(CreateError::Daytona)?;
    let listed: HashSet<&str> = existing.iter().map(|s| s.id.as_str()).collect();
    // Deleted sandboxes drop out of the list, so a recent create missing from it
    // is either not listed yet or already deleted; counting it errs on the safe side.
    let unlisted = recent
        .iter()
        .filter(|r| !listed.contains(r.id.as_str()))
        .count();
    let live = unlisted
        + existing
            .iter()
            .filter(|s| !matches!(s.state.as_str(), "destroyed" | "destroying"))
            .count();
    if live >= max {
        return Err(CreateError::TooManySandboxes(max));
    }
    Ok(())
}

pub async fn remember(cache: &Cache, project_id: &Uuid, sandbox_id: &str, toolbox_url: &str) {
    let ttl = u64::from(env::hosted_evals::MAX_RUN_MINUTES.get()) * 60;
    if let Err(e) = cache
        .insert_with_ttl(
            &cache_key(project_id, sandbox_id),
            toolbox_url.to_string(),
            ttl,
        )
        .await
    {
        log::warn!("Failed to cache hosted eval sandbox {sandbox_id}: {e:?}");
    }
}

/// The project's sandbox, or `None` if it doesn't exist or belongs to another project.
pub async fn resolve(
    daytona: &Daytona<'_>,
    cache: &Cache,
    project_id: &Uuid,
    sandbox_id: &str,
) -> Result<Option<ProjectSandbox>> {
    let key = cache_key(project_id, sandbox_id);
    if let Ok(Some(toolbox_url)) = cache.get::<String>(&key).await {
        return Ok(Some(ProjectSandbox {
            id: sandbox_id.to_string(),
            toolbox: Toolbox::new(&toolbox_url, sandbox_id),
        }));
    }
    let Some(sandbox) = daytona.get_sandbox(sandbox_id).await? else {
        return Ok(None);
    };
    if sandbox.labels.get(PROJECT_LABEL) != Some(&project_id.to_string()) {
        return Ok(None);
    }
    remember(cache, project_id, &sandbox.id, &sandbox.toolbox_proxy_url).await;
    Ok(Some(ProjectSandbox {
        toolbox: Toolbox::new(&sandbox.toolbox_proxy_url, &sandbox.id),
        id: sandbox.id,
    }))
}

pub async fn status(daytona: &Daytona<'_>, sandbox: &ProjectSandbox) -> Result<SandboxStatus> {
    Ok(match daytona.get_sandbox(&sandbox.id).await? {
        Some(s) => SandboxStatus {
            state: s.state,
            error_reason: s.error_reason,
        },
        None => SandboxStatus {
            state: "destroyed".to_string(),
            error_reason: None,
        },
    })
}

pub async fn delete(
    daytona: &Daytona<'_>,
    cache: &Cache,
    project_id: &Uuid,
    sandbox: &ProjectSandbox,
) -> Result<()> {
    daytona.delete_sandbox(&sandbox.id).await?;
    let _ = cache.remove(&cache_key(project_id, &sandbox.id)).await;
    Ok(())
}

/// Starts `command` in a fresh session (one per command, as Harbor's own Daytona
/// environment does) and returns an id for [`command_result`].
pub async fn start_command(
    daytona: &Daytona<'_>,
    sandbox: &ProjectSandbox,
    command: &str,
) -> Result<String> {
    let session_id = Uuid::new_v4().simple().to_string();
    daytona
        .create_session(&sandbox.toolbox, &session_id)
        .await?;
    // Session logs merge stdout and stderr, so stderr goes to a file read back on completion.
    let wrapped = format!(
        "mkdir -p {STDERR_DIR}; sh -c {} 2>{STDERR_DIR}/{session_id}",
        shell_quote(command)
    );
    let cmd_id = daytona
        .exec_async(&sandbox.toolbox, &session_id, &wrapped)
        .await?;
    Ok(format!("{session_id}.{cmd_id}"))
}

/// `None` if `command_id` isn't one [`start_command`] returned.
pub async fn command_result(
    daytona: &Daytona<'_>,
    sandbox: &ProjectSandbox,
    command_id: &str,
) -> Result<Option<CommandResult>> {
    let Some((session_id, cmd_id)) = command_id.split_once('.') else {
        return Ok(None);
    };
    if session_id.is_empty() || !session_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Ok(None);
    }
    let Some(exit_code) = daytona
        .command_exit_code(&sandbox.toolbox, session_id, cmd_id)
        .await?
    else {
        return Ok(Some(CommandResult {
            exit_code: None,
            stdout: None,
            stderr: None,
        }));
    };
    let stdout = daytona
        .command_logs(&sandbox.toolbox, session_id, cmd_id)
        .await?;
    let stderr = match daytona
        .download_file(&sandbox.toolbox, &format!("{STDERR_DIR}/{session_id}"))
        .await?
    {
        Some(response) => String::from_utf8_lossy(&response.bytes().await?).into_owned(),
        None => String::new(),
    };
    Ok(Some(CommandResult {
        exit_code: Some(exit_code),
        stdout: Some(stdout),
        stderr: Some(stderr),
    }))
}

pub async fn upload_file(
    daytona: &Daytona<'_>,
    sandbox: &ProjectSandbox,
    path: &str,
    content: Bytes,
) -> Result<()> {
    daytona.upload_file(&sandbox.toolbox, path, content).await
}

pub async fn download_file(
    daytona: &Daytona<'_>,
    sandbox: &ProjectSandbox,
    path: &str,
) -> Result<Option<Response>> {
    daytona.download_file(&sandbox.toolbox, path).await
}

fn cache_key(project_id: &Uuid, sandbox_id: &str) -> String {
    format!("{HOSTED_EVALS_SANDBOX_CACHE_KEY}:{project_id}:{sandbox_id}")
}
