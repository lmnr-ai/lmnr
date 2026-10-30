//! Where hosted-evals sandboxes run. Everything above this module (project
//! ownership, the capacity cap, routes, the orchestrator) only talks to
//! [`SandboxProviderTrait`]; a provider owns its API client and credentials.

pub mod daytona;

use std::{collections::HashMap, pin::Pin};

use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use enum_dispatch::enum_dispatch;
use futures_util::{Stream, StreamExt};
use serde::Serialize;
use uuid::Uuid;

use crate::env;
use daytona::DaytonaProvider;

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes>> + Send>>;

/// Per stream of a command's output: the result is buffered and sent as JSON,
/// so a trial printing gigabytes must not land in app-server memory.
pub const MAX_COMMAND_OUTPUT_BYTES: usize = 10 * 1024 * 1024;

#[enum_dispatch]
pub enum SandboxProvider {
    Daytona(DaytonaProvider),
}

#[async_trait]
#[enum_dispatch(SandboxProvider)]
pub trait SandboxProviderTrait {
    /// Makes `image` startable with `resources` (e.g. builds a snapshot) unless it
    /// already is. Callers poll until `Ready` before [`Self::create`].
    async fn prepare_image(
        &self,
        project_id: &Uuid,
        image: &PushedImage,
        resources: Resources,
    ) -> Result<ImageState>;
    async fn create(&self, spec: SandboxSpec) -> Result<SandboxHandle, CreateFailure>;
    /// `None` if the provider doesn't know the sandbox (already deleted).
    async fn get(&self, sandbox_id: &str) -> Result<Option<SandboxInfo>>;
    /// Ids of the project's sandboxes that aren't being destroyed, up to `limit`.
    async fn list_live(&self, project_id: &Uuid, limit: usize) -> Result<Vec<String>>;
    /// A sandbox that is gone or already being destroyed counts as deleted.
    async fn delete(&self, sandbox_id: &str) -> Result<()>;
    /// Starts `command` under `sh` without waiting; returns an id for
    /// [`Self::command_result`].
    async fn start_command(&self, sandbox: &SandboxHandle, command: &str) -> Result<String>;
    /// `None` if `command_id` isn't one [`Self::start_command`] returned.
    async fn command_result(
        &self,
        sandbox: &SandboxHandle,
        command_id: &str,
    ) -> Result<Option<CommandResult>>;
    async fn upload_file(&self, sandbox: &SandboxHandle, path: &str, content: Bytes) -> Result<()>;
    /// `None` if the file doesn't exist.
    async fn download_file(
        &self,
        sandbox: &SandboxHandle,
        path: &str,
    ) -> Result<Option<ByteStream>>;
}

/// Resources a sandbox gets, already clamped to the deployment caps.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Resources {
    pub cpus: u32,
    pub memory_gb: u32,
    pub disk_gb: u32,
}

impl Resources {
    pub fn clamped(cpus: Option<u32>, memory_gb: Option<u32>, disk_gb: Option<u32>) -> Self {
        let max_disk = env::hosted_evals::MAX_SANDBOX_DISK_GB.get();
        Self {
            cpus: cpus
                .unwrap_or(1)
                .clamp(1, env::hosted_evals::MAX_SANDBOX_CPUS.get().max(1)),
            memory_gb: memory_gb
                .unwrap_or(1)
                .clamp(1, env::hosted_evals::MAX_SANDBOX_MEMORY_GB.get().max(1)),
            // The image has to fit, so an unset disk gets the cap rather than a minimum.
            disk_gb: disk_gb.unwrap_or(max_disk).clamp(1, max_disk.max(1)),
        }
    }
}

/// An image pushed to our registry, with the credentials to pull it.
pub struct PushedImage {
    pub digest: String,
    /// `<host>/<repository>:<tag>`.
    pub reference: String,
    pub registry: RegistryCredentials,
}

#[derive(Clone)]
pub struct RegistryCredentials {
    pub host: String,
    pub username: String,
    pub password: String,
}

/// `host[:port]` of a registry URL, which may carry a scheme or trailing slash.
pub fn registry_host(url: &str) -> String {
    url.trim()
        .trim_start_matches("https://")
        .trim_end_matches('/')
        .to_string()
}

pub enum SandboxImage {
    /// The provider's stock image (node, npx and uv), e.g. for the orchestrator.
    Default,
    /// An image [`SandboxProviderTrait::prepare_image`] reported `Ready` for.
    Pushed {
        digest: String,
        resources: Resources,
    },
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SandboxRole {
    Trial,
    Orchestrator,
}

impl SandboxRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Trial => "trial",
            Self::Orchestrator => "orchestrator",
        }
    }
}

pub struct SandboxSpec {
    pub project_id: Uuid,
    pub role: SandboxRole,
    pub image: SandboxImage,
    pub env: HashMap<String, String>,
    /// Wall-clock lifetime after which the provider destroys the sandbox.
    pub ttl_minutes: u32,
}

pub enum CreateFailure {
    /// The pushed image isn't ready for these resources.
    ImageNotReady,
    Upstream(anyhow::Error),
}

impl From<anyhow::Error> for CreateFailure {
    fn from(e: anyhow::Error) -> Self {
        Self::Upstream(e)
    }
}

/// A sandbox plus the provider-specific address its calls go to (Daytona's
/// toolbox proxy URL), cached so most calls skip a lookup.
#[derive(Clone)]
pub struct SandboxHandle {
    pub id: String,
    pub route: String,
}

pub struct SandboxInfo {
    pub handle: SandboxHandle,
    pub project_id: Option<Uuid>,
    pub status: SandboxStatus,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(
    tag = "state",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ImageState {
    Ready,
    Pending,
    Failed { error_reason: String },
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SandboxState {
    Pending,
    Started,
    Error,
    Destroyed,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStatus {
    pub state: SandboxState,
    #[serde(skip_serializing_if = "Option::is_none")]
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
    /// The output went past `MAX_COMMAND_OUTPUT_BYTES`; only its start is kept.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub stdout_truncated: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub stderr_truncated: bool,
}

impl CommandResult {
    pub fn running() -> Self {
        Self {
            exit_code: None,
            stdout: None,
            stderr: None,
            stdout_truncated: false,
            stderr_truncated: false,
        }
    }
}

/// The first `max` bytes of `stream` as (lossy) UTF-8, and whether more
/// followed. Stops reading at the cap.
pub async fn read_capped(mut stream: ByteStream, max: usize) -> Result<(String, bool)> {
    let mut buf = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let room = max - buf.len();
        if chunk.len() > room {
            buf.extend_from_slice(&chunk[..room]);
            return Ok((String::from_utf8_lossy(&buf).into_owned(), true));
        }
        buf.extend_from_slice(&chunk);
    }
    Ok((String::from_utf8_lossy(&buf).into_owned(), false))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn registry_hosts_ignore_scheme_and_trailing_slash() {
        assert_eq!(
            registry_host(" https://123.dkr.ecr.us-east-1.amazonaws.com/ "),
            "123.dkr.ecr.us-east-1.amazonaws.com"
        );
        assert_eq!(registry_host("localhost:5000"), "localhost:5000");
    }

    #[test]
    fn resources_are_clamped_to_the_caps() {
        // Default caps: 4 CPUs, 8 GB memory, 10 GB disk.
        assert_eq!(
            Resources::clamped(None, None, None),
            Resources {
                cpus: 1,
                memory_gb: 1,
                disk_gb: 10
            }
        );
        assert_eq!(
            Resources::clamped(Some(0), Some(64), Some(5)),
            Resources {
                cpus: 1,
                memory_gb: 8,
                disk_gb: 5
            }
        );
    }

    #[tokio::test]
    async fn command_output_is_capped_and_flagged() {
        let chunks = |parts: &[&'static str]| -> ByteStream {
            futures_util::stream::iter(
                parts
                    .iter()
                    .map(|p| Ok(Bytes::from_static(p.as_bytes())))
                    .collect::<Vec<_>>(),
            )
            .boxed()
        };
        assert_eq!(
            read_capped(chunks(&["abc", "def"]), 6).await.unwrap(),
            ("abcdef".to_string(), false)
        );
        assert_eq!(
            read_capped(chunks(&["abc", "def", "g"]), 5).await.unwrap(),
            ("abcde".to_string(), true)
        );
        let result = CommandResult {
            exit_code: Some(0),
            stdout: Some("abcde".to_string()),
            stderr: Some(String::new()),
            stdout_truncated: true,
            stderr_truncated: false,
        };
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            json!({ "exitCode": 0, "stdout": "abcde", "stderr": "", "stdoutTruncated": true })
        );
    }

    #[test]
    fn statuses_serialize_to_the_wire_shapes() {
        assert_eq!(
            serde_json::to_value(ImageState::Ready).unwrap(),
            json!({ "state": "ready" })
        );
        assert_eq!(
            serde_json::to_value(ImageState::Pending).unwrap(),
            json!({ "state": "pending" })
        );
        assert_eq!(
            serde_json::to_value(ImageState::Failed {
                error_reason: "pull denied".to_string()
            })
            .unwrap(),
            json!({ "state": "failed", "errorReason": "pull denied" })
        );
        assert_eq!(
            serde_json::to_value(SandboxStatus {
                state: SandboxState::Started,
                error_reason: None,
            })
            .unwrap(),
            json!({ "state": "started" })
        );
        assert_eq!(
            serde_json::to_value(SandboxStatus {
                state: SandboxState::Error,
                error_reason: Some("oom".to_string()),
            })
            .unwrap(),
            json!({ "state": "error", "errorReason": "oom" })
        );
        assert_eq!(
            serde_json::to_value(CommandResult::running()).unwrap(),
            json!({ "exitCode": null })
        );
    }
}
