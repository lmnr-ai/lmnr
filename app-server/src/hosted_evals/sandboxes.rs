//! Project-scoped trial sandboxes. Harbor's `LaminarEnvironment` (shipped in
//! lmnr-cli) drives these through `/v1/hosted-evals/sandboxes/*`; every call
//! checks the sandbox carries the caller's project label.

use std::collections::HashMap;

use anyhow::Result;
use bytes::Bytes;
use reqwest::Response;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    PROJECT_LABEL, contexts,
    daytona::{BuildInfo, CreateSandbox, Daytona, Toolbox},
    daytona_client, shell_quote,
};
use crate::{
    cache::{Cache, CacheTrait, keys::HOSTED_EVALS_SANDBOX_CACHE_KEY},
    env,
};

const STDERR_DIR: &str = "/tmp/.lmnr-exec";

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

pub enum CreateError {
    InvalidContextHash(String),
    TooManySandboxes(usize),
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
    ensure_capacity(&daytona, project_id).await?;

    let sandbox = daytona
        .create_sandbox(&CreateSandbox {
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
        })
        .await
        .map_err(CreateError::Daytona)?;
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

pub async fn ensure_capacity(daytona: &Daytona<'_>, project_id: &Uuid) -> Result<(), CreateError> {
    let max = env::hosted_evals::MAX_SANDBOXES_PER_PROJECT.get();
    let existing = daytona
        .list_sandboxes(
            &HashMap::from([(PROJECT_LABEL.to_string(), project_id.to_string())]),
            max + 1,
        )
        .await
        .map_err(CreateError::Daytona)?;
    let live = existing
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
