//! Minimal Daytona REST client: the sandbox, toolbox and build-context storage
//! calls hosted evals proxy. The API key never leaves the app-server.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::{Result, bail};
use bytes::Bytes;
use reqwest::{Client, RequestBuilder, Response, StatusCode, multipart};
use serde::{Deserialize, Serialize};
use serde_json::json;

const LIST_TIMEOUT: Duration = Duration::from_secs(30);
const START_TIMEOUT: Duration = Duration::from_secs(120);
const POLL_INTERVAL: Duration = Duration::from_secs(1);
const DELETE_TIMEOUT: Duration = Duration::from_secs(60);

pub struct Daytona<'a> {
    http: &'a Client,
    api_url: String,
    api_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub dockerfile_content: String,
    pub context_hashes: Vec<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandbox {
    pub env: HashMap<String, String>,
    pub labels: HashMap<String, String>,
    /// `None` uses Daytona's default snapshot.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_info: Option<BuildInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk: Option<u32>,
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

/// Temporary credentials for Daytona's build-context bucket.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageAccess {
    pub access_key: String,
    pub secret: String,
    pub session_token: String,
    pub storage_url: String,
    pub organization_id: String,
    pub bucket: String,
    pub region: String,
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

/// The toolbox address of one sandbox: `<toolboxProxyUrl>/<sandboxId>`.
pub struct Toolbox {
    base: String,
}

impl Toolbox {
    pub fn new(toolbox_proxy_url: &str, sandbox_id: &str) -> Self {
        Self {
            base: format!("{toolbox_proxy_url}/{sandbox_id}"),
        }
    }
}

impl<'a> Daytona<'a> {
    pub fn new(http: &'a Client, api_url: String, api_key: String) -> Self {
        Self {
            http,
            api_url,
            api_key,
        }
    }

    pub async fn create_sandbox(&self, request: &CreateSandbox) -> Result<Sandbox> {
        let url = format!("{}/sandbox", self.api_url);
        Ok(self
            .send(self.http.post(url).json(request))
            .await?
            .json()
            .await?)
    }

    /// `None` if Daytona doesn't know the sandbox (already deleted).
    pub async fn get_sandbox(&self, id: &str) -> Result<Option<Sandbox>> {
        let url = format!("{}/sandbox/{id}", self.api_url);
        let response = self.http.get(url).bearer_auth(&self.api_key).send().await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        Ok(Some(check(response).await?.json().await?))
    }

    pub async fn wait_until_started(&self, id: &str) -> Result<Sandbox> {
        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            let Some(sandbox) = self.get_sandbox(id).await? else {
                bail!("Daytona sandbox {id} disappeared before starting");
            };
            match sandbox.state.as_str() {
                "started" => return Ok(sandbox),
                "error" | "build_failed" | "destroyed" | "destroying" => bail!(
                    "Daytona sandbox {id} is {}: {}",
                    sandbox.state,
                    sandbox.error_reason.unwrap_or_default()
                ),
                _ if Instant::now() >= deadline => {
                    bail!("Daytona sandbox {id} did not start within {START_TIMEOUT:?}")
                }
                _ => tokio::time::sleep(POLL_INTERVAL).await,
            }
        }
    }

    /// Deletes the sandbox. One that is gone or already being destroyed counts as deleted.
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
                    tokio::time::sleep(POLL_INTERVAL * 2).await;
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

    pub async fn storage_push_access(&self) -> Result<StorageAccess> {
        let url = format!("{}/object-storage/push-access", self.api_url);
        Ok(self.send(self.http.get(url)).await?.json().await?)
    }

    pub async fn create_session(&self, toolbox: &Toolbox, session_id: &str) -> Result<()> {
        self.send(
            self.http
                .post(format!("{}/process/session", toolbox.base))
                .json(&json!({ "sessionId": session_id })),
        )
        .await?;
        Ok(())
    }

    /// Starts `command` in the session and returns its command id without waiting.
    pub async fn exec_async(
        &self,
        toolbox: &Toolbox,
        session_id: &str,
        command: &str,
    ) -> Result<String> {
        let response: ExecResponse = self
            .send(
                self.http
                    .post(format!(
                        "{}/process/session/{session_id}/exec",
                        toolbox.base
                    ))
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
        toolbox: &Toolbox,
        session_id: &str,
        command_id: &str,
    ) -> Result<Option<i32>> {
        let status: CommandStatus = self
            .send(self.http.get(format!(
                "{}/process/session/{session_id}/command/{command_id}",
                toolbox.base
            )))
            .await?
            .json()
            .await?;
        Ok(status.exit_code)
    }

    /// The command's output. The REST endpoint merges stdout and stderr.
    pub async fn command_logs(
        &self,
        toolbox: &Toolbox,
        session_id: &str,
        command_id: &str,
    ) -> Result<String> {
        Ok(self
            .send(self.http.get(format!(
                "{}/process/session/{session_id}/command/{command_id}/logs",
                toolbox.base
            )))
            .await?
            .text()
            .await?)
    }

    pub async fn upload_file(&self, toolbox: &Toolbox, path: &str, content: Bytes) -> Result<()> {
        let length = content.len() as u64;
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::stream_with_length(reqwest::Body::from(content), length)
                .file_name("file"),
        );
        self.send(
            self.http
                .post(format!("{}/files/upload", toolbox.base))
                .query(&[("path", path)])
                .multipart(form),
        )
        .await?;
        Ok(())
    }

    /// `None` if the file doesn't exist.
    pub async fn download_file(&self, toolbox: &Toolbox, path: &str) -> Result<Option<Response>> {
        let response = self
            .http
            .get(format!("{}/files/download", toolbox.base))
            .query(&[("path", path)])
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        Ok(Some(check(response).await?))
    }

    async fn send(&self, request: RequestBuilder) -> Result<Response> {
        check(request.bearer_auth(&self.api_key).send().await?).await
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
