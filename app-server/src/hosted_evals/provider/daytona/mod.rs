//! Daytona as the sandbox provider. A pushed image becomes one Daytona snapshot
//! per resource shape (a snapshot fixes its sandboxes' resources); Daytona
//! copies the image when it builds the snapshot, so it only reads our registry
//! then. Project ownership is a sandbox label.

mod client;

use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use chrono::Utc;
use futures_util::{StreamExt, TryStreamExt};
use uuid::Uuid;

use super::{
    ByteStream, CommandResult, CreateFailure, ImageState, PushedImage, RegistryCredentials,
    Resources, SandboxHandle, SandboxImage, SandboxInfo, SandboxProviderTrait, SandboxSpec,
    SandboxState, SandboxStatus, registry_host,
};
use crate::hosted_evals::shell_quote;
use client::{CreateSandbox, CreateSnapshot, Daytona, DockerRegistryRequest, Snapshot};

const PROJECT_LABEL: &str = "lmnr-project-id";
const ROLE_LABEL: &str = "lmnr-role";
/// Name of the private registry entry Daytona pulls snapshot images with.
const REGISTRY_ENTRY_NAME: &str = "lmnr-hosted-evals";
/// A project's snapshots unused for this long are deleted when it creates a new one.
const SNAPSHOT_IDLE_DAYS: i64 = 7;
/// Session logs merge stdout and stderr, so stderr goes to a file read back on completion.
const STDERR_DIR: &str = "/tmp/.lmnr-exec";

pub struct DaytonaProvider {
    client: Daytona,
}

impl DaytonaProvider {
    pub fn new(api_url: String, api_key: String) -> Self {
        Self {
            client: Daytona::new(api_url, api_key),
        }
    }

    /// Lets Daytona pull from the registry with the current credentials: ECR
    /// tokens expire after 12 hours, and Daytona only pulls while it builds a
    /// snapshot.
    async fn grant_pull(&self, registry: &RegistryCredentials) -> Result<()> {
        let request = DockerRegistryRequest {
            name: REGISTRY_ENTRY_NAME.to_string(),
            url: format!("https://{}", registry.host),
            username: registry.username.clone(),
            password: registry.password.clone(),
        };
        let mut entries = self
            .client
            .list_registries()
            .await?
            .into_iter()
            .filter(|r| registry_host(&r.url) == registry.host);
        let Some(entry) = entries.next() else {
            return self.client.create_registry(&request).await;
        };
        self.client.update_registry(&entry.id, &request).await?;
        // The first snapshots of a burst each find no entry and create one.
        for extra in entries {
            if let Err(e) = self.client.delete_registry(&extra.id).await {
                log::warn!(
                    "Failed to delete duplicate Daytona registry {}: {e:?}",
                    extra.id
                );
            }
        }
        Ok(())
    }

    async fn snapshot_state(&self, snapshot: Snapshot) -> Result<ImageState> {
        Ok(match snapshot.state.as_str() {
            "active" => ImageState::Ready,
            "inactive" => {
                self.client.activate_snapshot(&snapshot.id).await?;
                ImageState::Pending
            }
            "error" | "build_failed" => {
                // A failed snapshot keeps its name; deleting it lets the next run retry
                // (e.g. after the image is pushed again).
                if let Err(e) = self.client.delete_snapshot(&snapshot.id).await {
                    log::warn!("Failed to delete failed snapshot {}: {e:?}", snapshot.name);
                }
                ImageState::Failed {
                    error_reason: snapshot.error_reason.unwrap_or_default(),
                }
            }
            _ => ImageState::Pending,
        })
    }

    /// Best effort: snapshots pile up with every image version and resource shape.
    async fn delete_idle_snapshots(&self, project_id: &Uuid) {
        let prefix = snapshot_prefix(project_id);
        let cutoff = Utc::now() - chrono::Duration::days(SNAPSHOT_IDLE_DAYS);
        let snapshots = match self.client.list_snapshots(&prefix).await {
            Ok(snapshots) => snapshots,
            Err(e) => {
                log::warn!("Failed to list hosted evals snapshots: {e:?}");
                return;
            }
        };
        for snapshot in snapshots {
            let idle_since = snapshot.last_used_at.unwrap_or(snapshot.created_at);
            if snapshot.name.starts_with(&prefix) && idle_since < cutoff {
                if let Err(e) = self.client.delete_snapshot(&snapshot.id).await {
                    log::warn!("Failed to delete idle snapshot {}: {e:?}", snapshot.name);
                }
            }
        }
    }
}

#[async_trait]
impl SandboxProviderTrait for DaytonaProvider {
    async fn prepare_image(
        &self,
        project_id: &Uuid,
        image: &PushedImage,
        resources: Resources,
    ) -> Result<ImageState> {
        let name = snapshot_name(project_id, &image.digest, resources);
        if let Some(snapshot) = self.client.get_snapshot(&name).await? {
            return self.snapshot_state(snapshot).await;
        }
        self.grant_pull(&image.registry).await?;
        let created = self
            .client
            .create_snapshot(&CreateSnapshot {
                name,
                image_name: image.reference.clone(),
                cpu: resources.cpus,
                memory: resources.memory_gb,
                disk: resources.disk_gb,
            })
            .await?;
        if created {
            self.delete_idle_snapshots(project_id).await;
        }
        Ok(ImageState::Pending)
    }

    async fn create(&self, spec: SandboxSpec) -> Result<SandboxHandle, CreateFailure> {
        let snapshot = match &spec.image {
            SandboxImage::Default => None,
            SandboxImage::Pushed { digest, resources } => {
                let name = snapshot_name(&spec.project_id, digest, *resources);
                match self.client.get_snapshot(&name).await? {
                    Some(s) if s.state == "active" => Some(s.name),
                    _ => return Err(CreateFailure::ImageNotReady),
                }
            }
        };
        let sandbox = self
            .client
            .create_sandbox(&CreateSandbox {
                env: spec.env,
                labels: HashMap::from([
                    (PROJECT_LABEL.to_string(), spec.project_id.to_string()),
                    (ROLE_LABEL.to_string(), spec.role.as_str().to_string()),
                ]),
                snapshot,
                auto_stop_interval: 0,
                auto_delete_interval: 0,
                ttl_minutes: spec.ttl_minutes,
            })
            .await?;
        Ok(SandboxHandle {
            id: sandbox.id,
            route: sandbox.toolbox_proxy_url,
        })
    }

    async fn get(&self, sandbox_id: &str) -> Result<Option<SandboxInfo>> {
        let Some(sandbox) = self.client.get_sandbox(sandbox_id).await? else {
            return Ok(None);
        };
        Ok(Some(SandboxInfo {
            project_id: sandbox
                .labels
                .get(PROJECT_LABEL)
                .and_then(|id| Uuid::parse_str(id).ok()),
            status: SandboxStatus {
                state: sandbox_state(&sandbox.state),
                error_reason: sandbox.error_reason.filter(|r| !r.is_empty()),
            },
            handle: SandboxHandle {
                id: sandbox.id,
                route: sandbox.toolbox_proxy_url,
            },
        }))
    }

    async fn list_live(&self, project_id: &Uuid, limit: usize) -> Result<Vec<String>> {
        let labels = HashMap::from([(PROJECT_LABEL.to_string(), project_id.to_string())]);
        Ok(self
            .client
            .list_sandboxes(&labels, limit)
            .await?
            .into_iter()
            .filter(|s| !matches!(s.state.as_str(), "destroyed" | "destroying"))
            .map(|s| s.id)
            .collect())
    }

    async fn delete(&self, sandbox_id: &str) -> Result<()> {
        self.client.delete_sandbox(sandbox_id).await
    }

    /// One session per command, as Harbor's own Daytona environment does. The
    /// command id is `<session>.<Daytona command id>`.
    async fn start_command(&self, sandbox: &SandboxHandle, command: &str) -> Result<String> {
        let toolbox = toolbox(sandbox);
        let session_id = Uuid::new_v4().simple().to_string();
        self.client.create_session(&toolbox, &session_id).await?;
        let wrapped = format!(
            "mkdir -p {STDERR_DIR}; sh -c {} 2>{STDERR_DIR}/{session_id}",
            shell_quote(command)
        );
        let cmd_id = self
            .client
            .exec_async(&toolbox, &session_id, &wrapped)
            .await?;
        Ok(format!("{session_id}.{cmd_id}"))
    }

    async fn command_result(
        &self,
        sandbox: &SandboxHandle,
        command_id: &str,
    ) -> Result<Option<CommandResult>> {
        let Some((session_id, cmd_id)) = parse_command_id(command_id) else {
            return Ok(None);
        };
        let toolbox = toolbox(sandbox);
        let Some(exit_code) = self
            .client
            .command_exit_code(&toolbox, session_id, cmd_id)
            .await?
        else {
            return Ok(Some(CommandResult::running()));
        };
        let stdout = self
            .client
            .command_logs(&toolbox, session_id, cmd_id)
            .await?;
        let stderr = match self
            .client
            .download_file(&toolbox, &format!("{STDERR_DIR}/{session_id}"))
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

    async fn upload_file(&self, sandbox: &SandboxHandle, path: &str, content: Bytes) -> Result<()> {
        self.client
            .upload_file(&toolbox(sandbox), path, content)
            .await
    }

    async fn download_file(
        &self,
        sandbox: &SandboxHandle,
        path: &str,
    ) -> Result<Option<ByteStream>> {
        let Some(response) = self.client.download_file(&toolbox(sandbox), path).await? else {
            return Ok(None);
        };
        Ok(Some(
            response.bytes_stream().map_err(anyhow::Error::from).boxed(),
        ))
    }
}

fn toolbox(sandbox: &SandboxHandle) -> String {
    format!("{}/{}", sandbox.route, sandbox.id)
}

fn sandbox_state(state: &str) -> SandboxState {
    match state {
        "started" => SandboxState::Started,
        "error" | "build_failed" => SandboxState::Error,
        // Hosted-evals sandboxes are deleted on stop, so a stopping one is as good as gone.
        "destroyed" | "destroying" | "stopping" | "stopped" | "archiving" | "archived" => {
            SandboxState::Destroyed
        }
        _ => SandboxState::Pending,
    }
}

/// Both halves end up in toolbox URL paths, so only id characters pass.
fn parse_command_id(command_id: &str) -> Option<(&str, &str)> {
    let (session_id, cmd_id) = command_id.split_once('.')?;
    let session_ok = !session_id.is_empty() && session_id.bytes().all(|b| b.is_ascii_hexdigit());
    let cmd_ok = !cmd_id.is_empty()
        && cmd_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    (session_ok && cmd_ok).then_some((session_id, cmd_id))
}

/// `lmnr-<project>-<image>-<cpus>c<memory>g<disk>d`: one snapshot per image and
/// resource shape.
fn snapshot_name(project_id: &Uuid, digest: &str, resources: Resources) -> String {
    let hex = digest.trim_start_matches("sha256:");
    format!(
        "{}{}-{}c{}g{}d",
        snapshot_prefix(project_id),
        &hex[..16.min(hex.len())],
        resources.cpus,
        resources.memory_gb,
        resources.disk_gb
    )
}

fn snapshot_prefix(project_id: &Uuid) -> String {
    format!("lmnr-{}-", project_id.simple())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_names_are_scoped_to_the_project_and_shape() {
        let a = Uuid::parse_str("8f0a2b4c-1d3e-4f56-8a7b-9c0d1e2f3a4b").unwrap();
        let image = format!("sha256:{}", "b".repeat(64));
        let resources = Resources {
            cpus: 2,
            memory_gb: 4,
            disk_gb: 10,
        };
        let name = snapshot_name(&a, &image, resources);
        assert_eq!(
            name,
            "lmnr-8f0a2b4c1d3e4f568a7b9c0d1e2f3a4b-bbbbbbbbbbbbbbbb-2c4g10d"
        );
        assert!(name.starts_with(&snapshot_prefix(&a)));
        assert_ne!(name, snapshot_name(&Uuid::nil(), &image, resources));
    }

    #[test]
    fn command_ids_only_carry_id_characters() {
        assert_eq!(
            parse_command_id("abc123.4f2e-9a_b"),
            Some(("abc123", "4f2e-9a_b"))
        );
        for bad in [
            "", "abc", ".x", "abc.", "xyz.1", "abc.../x", "abc.1/2", "abc.a?b",
        ] {
            assert_eq!(parse_command_id(bad), None, "{bad}");
        }
    }

    #[test]
    fn sandbox_states_map_to_the_wire_set() {
        assert_eq!(sandbox_state("started"), SandboxState::Started);
        assert_eq!(sandbox_state("build_failed"), SandboxState::Error);
        assert_eq!(sandbox_state("stopped"), SandboxState::Destroyed);
        assert_eq!(sandbox_state("pulling_snapshot"), SandboxState::Pending);
    }
}
