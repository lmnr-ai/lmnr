//! Prebuilt trial images. lmnr-cli builds an image locally and uploads its
//! layers here; the app-server pushes them to Daytona's registry with temporary
//! push credentials that never leave it, then turns the image into one Daytona
//! snapshot per resource shape (a snapshot fixes its sandboxes' resources).
//!
//! Each project pushes to its own repository, named from a hash of the project
//! id and the Daytona key, so images can't be named across projects. Layers are
//! identified by their `diff_id` (the uncompressed digest the client knows
//! without compressing); the cache maps it to the stored blob.

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use bytes::Bytes;
use chrono::Utc;
use futures_util::StreamExt;
use reqwest::{Body, Client, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::mpsc::{self, Receiver};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use super::{
    daytona::{CreateSnapshot, Daytona, RegistryAccess, Snapshot},
    daytona_client,
};
use crate::{
    cache::{Cache, CacheTrait, keys::HOSTED_EVALS_LAYER_CACHE_KEY},
    env,
};

const MANIFEST_MEDIA_TYPE: &str = "application/vnd.oci.image.manifest.v1+json";
const CONFIG_MEDIA_TYPE: &str = "application/vnd.oci.image.config.v1+json";
const LAYER_MEDIA_TYPE: &str = "application/vnd.oci.image.layer.v1.tar+gzip";
/// Daytona runs sandboxes on x86_64.
const PLATFORM_ARCHITECTURE: &str = "amd64";
/// How long a layer's blob is remembered. A blob the registry dropped meanwhile
/// is uploaded again: `missing_layers` checks it still exists.
const LAYER_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
/// A project's snapshots unused for this long are deleted when it creates a new one.
const SNAPSHOT_IDLE_DAYS: i64 = 7;
const REGISTRY_TIMEOUT: Duration = Duration::from_secs(30);

/// A blob stored in the registry.
#[derive(Serialize, Deserialize, Clone)]
pub struct Blob {
    pub digest: String,
    pub size: u64,
}

impl Blob {
    fn of(content: &[u8]) -> Self {
        Self {
            digest: format!("sha256:{}", hex::encode(Sha256::digest(content))),
            size: content.len() as u64,
        }
    }
}

pub enum ImageError {
    InvalidConfig(String),
    WrongPlatform(String),
    MissingLayers(Vec<String>),
}

/// Resources a snapshot's sandboxes get, already clamped to the deployment caps.
#[derive(Clone, Copy)]
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
                .clamp(1, env::hosted_evals::MAX_SANDBOX_CPUS.get()),
            memory_gb: memory_gb
                .unwrap_or(1)
                .clamp(1, env::hosted_evals::MAX_SANDBOX_MEMORY_GB.get()),
            // The image has to fit, so an unset disk gets the cap rather than a minimum.
            disk_gb: disk_gb.unwrap_or(max_disk).clamp(1, max_disk),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum SnapshotStatus {
    #[serde(rename = "ready")]
    Ready { name: String },
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "failed")]
    Failed { error_reason: String },
}

pub fn is_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64 && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

/// The project's identity in registry and snapshot names: stable, and not
/// derivable from the project id without the Daytona key.
fn project_key(project_id: &Uuid) -> String {
    let api_key = std::env::var(env::hosted_evals::DAYTONA_API_KEY).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(api_key.as_bytes());
    hasher.update(project_id.as_bytes());
    hex::encode(hasher.finalize())[..24].to_string()
}

fn image_tag(digest: &str) -> String {
    digest.replace(':', "-")
}

/// `lmnr-<project>-<image>-<cpus>c<memory>g<disk>d`: one snapshot per image and
/// resource shape.
pub fn snapshot_name(project_id: &Uuid, image: &str, resources: Resources) -> String {
    let hex = image.trim_start_matches("sha256:");
    format!(
        "lmnr-{}-{}-{}c{}g{}d",
        &project_key(project_id)[..16],
        &hex[..16],
        resources.cpus,
        resources.memory_gb,
        resources.disk_gb
    )
}

fn snapshot_prefix(project_id: &Uuid) -> String {
    format!("lmnr-{}-", &project_key(project_id)[..16])
}

fn layer_cache_key(project_id: &Uuid, diff_id: &str) -> String {
    format!("{HOSTED_EVALS_LAYER_CACHE_KEY}:{project_id}:{diff_id}")
}

/// The project's repository in Daytona's registry.
pub struct Registry<'a> {
    http: &'a Client,
    base: String,
    host: String,
    repository: String,
    username: String,
    secret: String,
}

impl<'a> Registry<'a> {
    pub async fn connect(http: &'a Client, project_id: &Uuid) -> Result<Self> {
        let access = daytona_client(http)?.registry_push_access().await?;
        Ok(Self::new(http, access, project_id))
    }

    fn new(http: &'a Client, access: RegistryAccess, project_id: &Uuid) -> Self {
        let host = access
            .registry_url
            .trim_start_matches("https://")
            .trim_end_matches('/')
            .to_string();
        Self {
            http,
            base: format!("https://{host}"),
            repository: format!("{}/lmnr-{}", access.project, project_key(project_id)),
            host,
            username: access.username,
            secret: access.secret,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/v2/{}/{path}", self.base, self.repository)
    }

    /// Upload URLs come back absolute or host-relative.
    fn absolute(&self, location: &str) -> String {
        if location.starts_with('/') {
            format!("{}{location}", self.base)
        } else {
            location.to_string()
        }
    }

    fn image_name(&self, digest: &str) -> String {
        format!("{}/{}:{}", self.host, self.repository, image_tag(digest))
    }

    pub async fn blob_exists(&self, digest: &str) -> Result<bool> {
        let response = self
            .http
            .head(self.url(&format!("blobs/{digest}")))
            .basic_auth(&self.username, Some(&self.secret))
            .timeout(REGISTRY_TIMEOUT)
            .send()
            .await?;
        match response.status() {
            StatusCode::OK => Ok(true),
            StatusCode::NOT_FOUND => Ok(false),
            status => bail!("Registry blob check returned {status}"),
        }
    }

    /// Streams `chunks` into a new blob, hashing as it goes. The sender must end
    /// the stream with an `Err` to abort.
    pub async fn upload_blob(&self, chunks: Receiver<Result<Bytes>>) -> Result<Blob> {
        let started = check(
            self.http
                .post(self.url("blobs/uploads/"))
                .basic_auth(&self.username, Some(&self.secret))
                .timeout(REGISTRY_TIMEOUT)
                .send()
                .await?,
        )
        .await?;
        let location = self.absolute(location_header(&started)?);

        let hashed = Arc::new(Mutex::new((Sha256::new(), 0u64)));
        let observer = hashed.clone();
        let stream = ReceiverStream::new(chunks).map(move |chunk| {
            if let Ok(bytes) = &chunk {
                let mut state = observer.lock().unwrap();
                state.0.update(bytes);
                state.1 += bytes.len() as u64;
            }
            chunk
        });
        let patched = check(
            self.http
                .patch(&location)
                .basic_auth(&self.username, Some(&self.secret))
                .header("Content-Type", "application/octet-stream")
                .body(Body::wrap_stream(stream))
                .send()
                .await?,
        )
        .await?;
        let location = self.absolute(location_header(&patched)?);

        let (hasher, size) = std::mem::take(&mut *hashed.lock().unwrap());
        let digest = format!("sha256:{}", hex::encode(hasher.finalize()));
        let separator = if location.contains('?') { '&' } else { '?' };
        check(
            self.http
                .put(format!("{location}{separator}digest={digest}"))
                .basic_auth(&self.username, Some(&self.secret))
                .timeout(REGISTRY_TIMEOUT)
                .send()
                .await?,
        )
        .await?;
        Ok(Blob { digest, size })
    }

    async fn upload_bytes(&self, content: Bytes) -> Result<Blob> {
        let (tx, rx) = mpsc::channel(1);
        tx.send(Ok(content)).await.ok();
        drop(tx);
        self.upload_blob(rx).await
    }

    async fn manifest_exists(&self, tag: &str) -> Result<bool> {
        let response = self
            .http
            .head(self.url(&format!("manifests/{tag}")))
            .basic_auth(&self.username, Some(&self.secret))
            .header("Accept", MANIFEST_MEDIA_TYPE)
            .timeout(REGISTRY_TIMEOUT)
            .send()
            .await?;
        match response.status() {
            StatusCode::OK => Ok(true),
            StatusCode::NOT_FOUND => Ok(false),
            status => bail!("Registry manifest check returned {status}"),
        }
    }

    /// Tags in Daytona's registry are immutable (a second push answers 412), so
    /// an existing tag is left alone. Tags are derived from the manifest digest,
    /// so an existing one already holds this manifest.
    async fn put_manifest(&self, tag: &str, manifest: Bytes) -> Result<()> {
        if self.manifest_exists(tag).await? {
            return Ok(());
        }
        check(
            self.http
                .put(self.url(&format!("manifests/{tag}")))
                .basic_auth(&self.username, Some(&self.secret))
                .header("Content-Type", MANIFEST_MEDIA_TYPE)
                .timeout(REGISTRY_TIMEOUT)
                .body(manifest)
                .send()
                .await?,
        )
        .await?;
        Ok(())
    }
}

/// The layers (by `diff_id`) the project still has to upload.
pub async fn missing_layers(
    registry: &Registry<'_>,
    cache: &Cache,
    project_id: &Uuid,
    diff_ids: &[String],
) -> Result<Vec<String>> {
    let mut missing = Vec::new();
    for diff_id in diff_ids {
        if missing.contains(diff_id) {
            continue;
        }
        let blob: Option<Blob> = cache
            .get(&layer_cache_key(project_id, diff_id))
            .await
            .ok()
            .flatten();
        let present = match blob {
            Some(blob) => registry.blob_exists(&blob.digest).await?,
            None => false,
        };
        if !present {
            missing.push(diff_id.clone());
        }
    }
    Ok(missing)
}

/// Stores a gzip-compressed layer streamed through `chunks` and remembers it as
/// `diff_id`. The `diff_id` isn't verified here: a wrong one only breaks the
/// uploading project's own image, which the runtime rejects on unpack.
pub async fn upload_layer(
    registry: &Registry<'_>,
    cache: &Cache,
    project_id: &Uuid,
    diff_id: &str,
    chunks: Receiver<Result<Bytes>>,
) -> Result<Blob> {
    let blob = registry.upload_blob(chunks).await?;
    if let Err(e) = cache
        .insert_with_ttl(
            &layer_cache_key(project_id, diff_id),
            &blob,
            LAYER_TTL_SECONDS,
        )
        .await
    {
        log::warn!("Failed to remember hosted evals layer {diff_id}: {e:?}");
    }
    Ok(blob)
}

/// Pushes the image described by `config` (a Docker / OCI image config) whose
/// layers the project uploaded, and returns the image's manifest digest.
pub async fn create_image(
    registry: &Registry<'_>,
    cache: &Cache,
    project_id: &Uuid,
    config: String,
) -> Result<Result<String, ImageError>> {
    let parsed: Value = match serde_json::from_str(&config) {
        Ok(value) => value,
        Err(e) => return Ok(Err(ImageError::InvalidConfig(e.to_string()))),
    };
    let architecture = parsed["architecture"].as_str().unwrap_or_default();
    if architecture != PLATFORM_ARCHITECTURE {
        return Ok(Err(ImageError::WrongPlatform(architecture.to_string())));
    }
    let Some(diff_ids) = parsed["rootfs"]["diff_ids"].as_array() else {
        return Ok(Err(ImageError::InvalidConfig(
            "rootfs.diff_ids is missing".to_string(),
        )));
    };
    let mut layers = Vec::with_capacity(diff_ids.len());
    let mut missing = Vec::new();
    for diff_id in diff_ids {
        let diff_id = diff_id.as_str().unwrap_or_default();
        let blob: Option<Blob> = cache
            .get(&layer_cache_key(project_id, diff_id))
            .await
            .ok()
            .flatten();
        match blob {
            Some(blob) => layers.push(blob),
            None => missing.push(diff_id.to_string()),
        }
    }
    if !missing.is_empty() {
        return Ok(Err(ImageError::MissingLayers(missing)));
    }

    let config = Bytes::from(config);
    let config = match Blob::of(&config) {
        blob if registry.blob_exists(&blob.digest).await? => blob,
        _ => registry.upload_bytes(config).await?,
    };
    let manifest = Bytes::from(serde_json::to_vec(&json!({
        "schemaVersion": 2,
        "mediaType": MANIFEST_MEDIA_TYPE,
        "config": { "mediaType": CONFIG_MEDIA_TYPE, "digest": config.digest, "size": config.size },
        "layers": layers
            .iter()
            .map(|l| json!({ "mediaType": LAYER_MEDIA_TYPE, "digest": l.digest, "size": l.size }))
            .collect::<Vec<_>>(),
    }))?);
    let digest = Blob::of(&manifest).digest;
    registry.put_manifest(&image_tag(&digest), manifest).await?;
    Ok(Ok(digest))
}

/// Creates the snapshot for `image` + `resources` unless it exists, and reports
/// whether sandboxes can start from it yet. Callers poll until `Ready`.
pub async fn ensure_snapshot(
    http: &Client,
    daytona: &Daytona<'_>,
    project_id: &Uuid,
    image: &str,
    resources: Resources,
) -> Result<SnapshotStatus> {
    let name = snapshot_name(project_id, image, resources);
    let snapshot = match daytona.get_snapshot(&name).await? {
        Some(snapshot) => snapshot,
        None => {
            // A digest another project pushed isn't in this project's repository,
            // so Daytona fails the snapshot instead of reading someone else's image.
            let registry = Registry::connect(http, project_id).await?;
            let created = daytona
                .create_snapshot(&CreateSnapshot {
                    name: name.clone(),
                    image_name: registry.image_name(image),
                    cpu: resources.cpus,
                    memory: resources.memory_gb,
                    disk: resources.disk_gb,
                })
                .await?;
            if created.is_some() {
                delete_idle_snapshots(daytona, project_id).await;
            }
            return Ok(SnapshotStatus::Pending);
        }
    };
    status_of(daytona, snapshot).await
}

async fn status_of(daytona: &Daytona<'_>, snapshot: Snapshot) -> Result<SnapshotStatus> {
    Ok(match snapshot.state.as_str() {
        "active" => SnapshotStatus::Ready {
            name: snapshot.name,
        },
        "inactive" => {
            daytona.activate_snapshot(&snapshot.id).await?;
            SnapshotStatus::Pending
        }
        "error" | "build_failed" => {
            // A failed snapshot keeps its name; deleting it lets the next run retry
            // (e.g. after the image is pushed again).
            if let Err(e) = daytona.delete_snapshot(&snapshot.id).await {
                log::warn!("Failed to delete failed snapshot {}: {e:?}", snapshot.name);
            }
            SnapshotStatus::Failed {
                error_reason: snapshot.error_reason.unwrap_or_default(),
            }
        }
        _ => SnapshotStatus::Pending,
    })
}

/// The ready snapshot sandboxes for `image` + `resources` start from, if any.
pub async fn ready_snapshot(
    daytona: &Daytona<'_>,
    project_id: &Uuid,
    image: &str,
    resources: Resources,
) -> Result<Option<String>> {
    let name = snapshot_name(project_id, image, resources);
    Ok(daytona
        .get_snapshot(&name)
        .await?
        .filter(|s| s.state == "active")
        .map(|s| s.name))
}

/// Best effort: snapshots pile up with every image version and resource shape.
async fn delete_idle_snapshots(daytona: &Daytona<'_>, project_id: &Uuid) {
    let prefix = snapshot_prefix(project_id);
    let cutoff = Utc::now() - chrono::Duration::days(SNAPSHOT_IDLE_DAYS);
    let snapshots = match daytona.list_snapshots(&prefix).await {
        Ok(snapshots) => snapshots,
        Err(e) => {
            log::warn!("Failed to list hosted evals snapshots: {e:?}");
            return;
        }
    };
    for snapshot in snapshots {
        let idle_since = snapshot.last_used_at.unwrap_or(snapshot.created_at);
        if snapshot.name.starts_with(&prefix) && idle_since < cutoff {
            if let Err(e) = daytona.delete_snapshot(&snapshot.id).await {
                log::warn!("Failed to delete idle snapshot {}: {e:?}", snapshot.name);
            }
        }
    }
}

fn location_header(response: &Response) -> Result<&str> {
    response
        .headers()
        .get("Location")
        .context("Registry response has no Location header")?
        .to_str()
        .map_err(|e| anyhow!("Invalid registry Location header: {e}"))
}

async fn check(response: Response) -> Result<Response> {
    let status = response.status();
    if !status.is_success() {
        bail!(
            "Registry returned {status}: {}",
            response.text().await.unwrap_or_default()
        );
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digests_are_lowercase_sha256() {
        let hex = "a".repeat(64);
        assert!(is_digest(&format!("sha256:{hex}")));
        assert!(!is_digest(&format!("sha256:{}", "A".repeat(64))));
        assert!(!is_digest(&format!("sha512:{hex}")));
        assert!(!is_digest("sha256:abc"));
        assert!(!is_digest(&format!("sha256:{hex}/../x")));
    }

    #[test]
    fn names_are_scoped_to_the_project() {
        let a = Uuid::parse_str("8f0a2b4c-1d3e-4f56-8a7b-9c0d1e2f3a4b").unwrap();
        let image = format!("sha256:{}", "b".repeat(64));
        let resources = Resources {
            cpus: 2,
            memory_gb: 4,
            disk_gb: 10,
        };
        let name = snapshot_name(&a, &image, resources);
        assert!(name.starts_with(&snapshot_prefix(&a)));
        assert!(name.ends_with("-bbbbbbbbbbbbbbbb-2c4g10d"));
        assert_ne!(name, snapshot_name(&Uuid::nil(), &image, resources));
        assert!(!name.contains(&a.simple().to_string()));
        assert_eq!(image_tag(&image), format!("sha256-{}", "b".repeat(64)));
    }
}
