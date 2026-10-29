//! Minimal Daytona REST client: the sandbox, toolbox, private-registry and
//! snapshot calls hosted evals need.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::{Result, bail};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use reqwest::{Client, RequestBuilder, Response, StatusCode, multipart};
use serde::{Deserialize, Serialize};
use serde_json::json;

const LIST_TIMEOUT: Duration = Duration::from_secs(30);
const CREATE_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// Per read, not per request: file transfers stream for longer.
const READ_TIMEOUT: Duration = Duration::from_secs(120);
const DELETE_TIMEOUT: Duration = Duration::from_secs(60);
const DELETE_POLL: Duration = Duration::from_secs(2);

pub struct Daytona {
    http: Client,
    api_url: String,
    api_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandbox {
    pub env: HashMap<String, String>,
    pub labels: HashMap<String, String>,
    /// Snapshot name, which fixes the sandbox's resources. `None` uses
    /// Daytona's default snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,
    /// Minutes of inactivity before Daytona stops the sandbox; 0 disables it.
    pub auto_stop_interval: u32,
    /// Minutes after stopping before deletion; 0 deletes on stop.
    pub auto_delete_interval: i32,
    /// Wall-clock lifetime after which the sandbox is destroyed.
    pub ttl_minutes: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sandbox {
    pub id: String,
    pub state: String,
    pub toolbox_proxy_url: String,
    pub error_reason: Option<String>,
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

#[derive(Deserialize)]
struct SandboxPage {
    items: Vec<Sandbox>,
}

/// A private registry Daytona pulls snapshot images from.
#[derive(Deserialize)]
pub struct DockerRegistry {
    pub id: String,
    pub url: String,
}

/// Body of creating or updating a `DockerRegistry`.
#[derive(Serialize)]
pub struct DockerRegistryRequest {
    pub name: String,
    /// `https://<host>`.
    pub url: String,
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshot {
    pub name: String,
    pub image_name: String,
    pub cpu: u32,
    pub memory: u32,
    pub disk: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub state: String,
    pub error_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct SnapshotPage {
    items: Vec<Snapshot>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecResponse {
    cmd_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandStatus {
    exit_code: Option<i32>,
}

impl Daytona {
    pub fn new(api_url: String, api_key: String) -> Self {
        let http = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .build()
            .expect("Failed to build the Daytona HTTP client");
        Self {
            http,
            api_url,
            api_key,
        }
    }

    pub async fn create_sandbox(&self, request: &CreateSandbox) -> Result<Sandbox> {
        let url = format!("{}/sandbox", self.api_url);
        Ok(self
            .send(self.http.post(url).timeout(CREATE_TIMEOUT).json(request))
            .await?
            .json()
            .await?)
    }

    /// `None` if Daytona doesn't know the sandbox (already deleted).
    pub async fn get_sandbox(&self, id: &str) -> Result<Option<Sandbox>> {
        let url = format!("{}/sandbox/{id}", self.api_url);
        match self.send_optional(self.http.get(url)).await? {
            Some(response) => Ok(Some(response.json().await?)),
            None => Ok(None),
        }
    }

    pub async fn delete_sandbox(&self, id: &str) -> Result<()> {
        let url = format!("{}/sandbox/{id}", self.api_url);
        let deadline = Instant::now() + DELETE_TIMEOUT;
        loop {
            let response = self
                .http
                .delete(&url)
                .bearer_auth(&self.api_key)
                .send()
                .await?;
            match response.status() {
                StatusCode::NOT_FOUND => return Ok(()),
                // "Sandbox state change in progress": destroying, or still starting.
                StatusCode::CONFLICT => {
                    let gone = match self.get_sandbox(id).await? {
                        None => true,
                        Some(s) => matches!(s.state.as_str(), "destroying" | "destroyed"),
                    };
                    if gone {
                        return Ok(());
                    }
                    if Instant::now() >= deadline {
                        check(response).await?;
                    }
                    tokio::time::sleep(DELETE_POLL).await;
                }
                _ => {
                    check(response).await?;
                    return Ok(());
                }
            }
        }
    }

    /// Sandboxes carrying all `labels`, up to `limit`.
    pub async fn list_sandboxes(
        &self,
        labels: &HashMap<String, String>,
        limit: usize,
    ) -> Result<Vec<Sandbox>> {
        let url = format!("{}/sandbox", self.api_url);
        let request = self.http.get(url).timeout(LIST_TIMEOUT).query(&[
            ("labels", serde_json::to_string(labels)?),
            ("limit", limit.to_string()),
        ]);
        let page: SandboxPage = self.send(request).await?.json().await?;
        Ok(page.items)
    }

    pub async fn list_registries(&self) -> Result<Vec<DockerRegistry>> {
        let url = format!("{}/docker-registry", self.api_url);
        Ok(self.send(self.http.get(url)).await?.json().await?)
    }

    pub async fn create_registry(&self, request: &DockerRegistryRequest) -> Result<()> {
        let url = format!("{}/docker-registry", self.api_url);
        self.send(self.http.post(url).json(request)).await?;
        Ok(())
    }

    pub async fn update_registry(&self, id: &str, request: &DockerRegistryRequest) -> Result<()> {
        let url = format!("{}/docker-registry/{id}", self.api_url);
        self.send(self.http.patch(url).json(request)).await?;
        Ok(())
    }

    pub async fn delete_registry(&self, id: &str) -> Result<()> {
        let url = format!("{}/docker-registry/{id}", self.api_url);
        self.send_optional(self.http.delete(url)).await?;
        Ok(())
    }

    /// `None` if no snapshot has this name.
    pub async fn get_snapshot(&self, name: &str) -> Result<Option<Snapshot>> {
        let url = format!("{}/snapshots/{name}", self.api_url);
        match self.send_optional(self.http.get(url)).await? {
            Some(response) => Ok(Some(response.json().await?)),
            None => Ok(None),
        }
    }

    /// Starts creating the snapshot. `false` if one with this name already
    /// exists (a concurrent request created it).
    pub async fn create_snapshot(&self, request: &CreateSnapshot) -> Result<bool> {
        let url = format!("{}/snapshots", self.api_url);
        let response = self
            .http
            .post(url)
            .timeout(CREATE_TIMEOUT)
            .bearer_auth(&self.api_key)
            .json(request)
            .send()
            .await?;
        if response.status() == StatusCode::CONFLICT {
            return Ok(false);
        }
        check(response).await?;
        Ok(true)
    }

    /// Re-activates a snapshot Daytona deactivated for being unused.
    pub async fn activate_snapshot(&self, id: &str) -> Result<()> {
        let url = format!("{}/snapshots/{id}/activate", self.api_url);
        self.send(self.http.post(url)).await?;
        Ok(())
    }

    /// Snapshots whose name contains `name`, up to 100.
    pub async fn list_snapshots(&self, name: &str) -> Result<Vec<Snapshot>> {
        let url = format!("{}/snapshots", self.api_url);
        let request = self
            .http
            .get(url)
            .timeout(LIST_TIMEOUT)
            .query(&[("name", name), ("limit", "100")]);
        let page: SnapshotPage = self.send(request).await?.json().await?;
        Ok(page.items)
    }

    pub async fn delete_snapshot(&self, id: &str) -> Result<()> {
        let url = format!("{}/snapshots/{id}", self.api_url);
        self.send_optional(self.http.delete(url)).await?;
        Ok(())
    }

    /// `toolbox` is `<toolboxProxyUrl>/<sandboxId>`, as for every toolbox call.
    pub async fn create_session(&self, toolbox: &str, session_id: &str) -> Result<()> {
        self.send(
            self.http
                .post(format!("{toolbox}/process/session"))
                .json(&json!({ "sessionId": session_id })),
        )
        .await?;
        Ok(())
    }

    /// Starts `command` in the session and returns its command id without waiting.
    pub async fn exec_async(
        &self,
        toolbox: &str,
        session_id: &str,
        command: &str,
    ) -> Result<String> {
        let response: ExecResponse = self
            .send(
                self.http
                    .post(format!("{toolbox}/process/session/{session_id}/exec"))
                    .json(&json!({ "command": command, "runAsync": true })),
            )
            .await?
            .json()
            .await?;
        Ok(response.cmd_id)
    }

    /// The command's exit code, or `None` while it is still running.
    pub async fn command_exit_code(
        &self,
        toolbox: &str,
        session_id: &str,
        command_id: &str,
    ) -> Result<Option<i32>> {
        let status: CommandStatus = self
            .send(self.http.get(format!(
                "{toolbox}/process/session/{session_id}/command/{command_id}"
            )))
            .await?
            .json()
            .await?;
        Ok(status.exit_code)
    }

    /// The command's output. The REST endpoint merges stdout and stderr.
    pub async fn command_logs(
        &self,
        toolbox: &str,
        session_id: &str,
        command_id: &str,
    ) -> Result<String> {
        Ok(self
            .send(self.http.get(format!(
                "{toolbox}/process/session/{session_id}/command/{command_id}/logs"
            )))
            .await?
            .text()
            .await?)
    }

    pub async fn upload_file(&self, toolbox: &str, path: &str, content: Bytes) -> Result<()> {
        let length = content.len() as u64;
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::stream_with_length(reqwest::Body::from(content), length)
                .file_name("file"),
        );
        self.send(
            self.http
                .post(format!("{toolbox}/files/upload"))
                .query(&[("path", path)])
                .multipart(form),
        )
        .await?;
        Ok(())
    }

    /// `None` if the file doesn't exist.
    pub async fn download_file(&self, toolbox: &str, path: &str) -> Result<Option<Response>> {
        self.send_optional(
            self.http
                .get(format!("{toolbox}/files/download"))
                .query(&[("path", path)]),
        )
        .await
    }

    async fn send(&self, request: RequestBuilder) -> Result<Response> {
        check(request.bearer_auth(&self.api_key).send().await?).await
    }

    /// Like [`Self::send`], but a 404 is `None`.
    async fn send_optional(&self, request: RequestBuilder) -> Result<Option<Response>> {
        let response = request.bearer_auth(&self.api_key).send().await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        Ok(Some(check(response).await?))
    }
}

async fn check(response: Response) -> Result<Response> {
    let status = response.status();
    if !status.is_success() {
        bail!(
            "Daytona API returned {status}: {}",
            response.text().await.unwrap_or_default()
        );
    }
    Ok(response)
}
