//! Prebuilt trial images. lmnr-cli builds an image locally and uploads its
//! layers here; the app-server pushes them to the project's repository in our
//! registry (`registry.rs`). Layers are identified by their `diff_id` (the
//! uncompressed digest the client knows without compressing); the cache maps
//! it to the stored blob.

use anyhow::Result;
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::mpsc::Receiver;
use uuid::Uuid;

use super::registry::{MANIFEST_MEDIA_TYPE, Repository};
use crate::cache::{Cache, CacheTrait, keys::HOSTED_EVALS_LAYER_CACHE_KEY};

const CONFIG_MEDIA_TYPE: &str = "application/vnd.oci.image.config.v1+json";
const LAYER_MEDIA_TYPE: &str = "application/vnd.oci.image.layer.v1.tar+gzip";
/// Sandboxes run on x86_64.
const PLATFORM_ARCHITECTURE: &str = "amd64";
/// How long a layer's blob is remembered. A blob the registry dropped meanwhile
/// is uploaded again: `missing_layers` checks it still exists.
const LAYER_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

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
    Registry(anyhow::Error),
}

impl From<anyhow::Error> for ImageError {
    fn from(e: anyhow::Error) -> Self {
        Self::Registry(e)
    }
}

pub fn is_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64 && hex.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

/// The layers (by `diff_id`) the project still has to upload.
pub async fn missing_layers(
    repository: &Repository<'_>,
    cache: &Cache,
    project_id: &Uuid,
    diff_ids: &[String],
) -> Result<Vec<String>> {
    let mut missing = Vec::new();
    for diff_id in diff_ids {
        if missing.contains(diff_id) {
            continue;
        }
        let present = match cached_layer(cache, project_id, diff_id).await {
            Some(blob) => repository.blob_exists(&blob.digest).await?,
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
    repository: &Repository<'_>,
    cache: &Cache,
    project_id: &Uuid,
    diff_id: &str,
    chunks: Receiver<Result<Bytes>>,
) -> Result<Blob> {
    repository.ensure_exists().await?;
    let blob = repository.upload_blob(chunks).await?;
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
    repository: &Repository<'_>,
    cache: &Cache,
    project_id: &Uuid,
    config: String,
) -> Result<String, ImageError> {
    let diff_ids = parse_config(&config)?;
    let mut layers = Vec::with_capacity(diff_ids.len());
    let mut missing = Vec::new();
    for diff_id in diff_ids {
        match cached_layer(cache, project_id, &diff_id).await {
            Some(blob) => layers.push(blob),
            None => missing.push(diff_id),
        }
    }
    if !missing.is_empty() {
        return Err(ImageError::MissingLayers(missing));
    }

    repository.ensure_exists().await?;
    let config = Bytes::from(config);
    let config = match Blob::of(&config) {
        blob if repository.blob_exists(&blob.digest).await? => blob,
        _ => repository.upload_bytes(config).await?,
    };
    let manifest = Bytes::from(
        serde_json::to_vec(&json!({
            "schemaVersion": 2,
            "mediaType": MANIFEST_MEDIA_TYPE,
            "config": { "mediaType": CONFIG_MEDIA_TYPE, "digest": config.digest, "size": config.size },
            "layers": layers
                .iter()
                .map(|l| json!({ "mediaType": LAYER_MEDIA_TYPE, "digest": l.digest, "size": l.size }))
                .collect::<Vec<_>>(),
        }))
        .map_err(anyhow::Error::from)?,
    );
    let digest = Blob::of(&manifest).digest;
    repository.put_manifest(&digest, manifest).await?;
    Ok(digest)
}

/// The config's layer `diff_ids`, once it is known to be an amd64 image.
fn parse_config(config: &str) -> Result<Vec<String>, ImageError> {
    let parsed: Value =
        serde_json::from_str(config).map_err(|e| ImageError::InvalidConfig(e.to_string()))?;
    let architecture = parsed["architecture"].as_str().unwrap_or_default();
    if architecture != PLATFORM_ARCHITECTURE {
        return Err(ImageError::WrongPlatform(architecture.to_string()));
    }
    let diff_ids = parsed["rootfs"]["diff_ids"]
        .as_array()
        .ok_or_else(|| ImageError::InvalidConfig("rootfs.diff_ids is missing".to_string()))?;
    diff_ids
        .iter()
        .map(|d| match d.as_str() {
            Some(d) if is_digest(d) => Ok(d.to_string()),
            _ => Err(ImageError::InvalidConfig(format!(
                "rootfs.diff_ids holds {d}, not a sha256 digest"
            ))),
        })
        .collect()
}

async fn cached_layer(cache: &Cache, project_id: &Uuid, diff_id: &str) -> Option<Blob> {
    cache
        .get(&layer_cache_key(project_id, diff_id))
        .await
        .ok()
        .flatten()
}

fn layer_cache_key(project_id: &Uuid, diff_id: &str) -> String {
    format!("{HOSTED_EVALS_LAYER_CACHE_KEY}:{project_id}:{diff_id}")
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
    fn configs_must_be_amd64_with_digest_diff_ids() {
        let layer = format!("sha256:{}", "d".repeat(64));
        let config = |arch: &str, diff_ids: Value| {
            json!({ "architecture": arch, "rootfs": { "type": "layers", "diff_ids": diff_ids } })
                .to_string()
        };
        assert!(matches!(
            parse_config(&config("amd64", json!([layer]))),
            Ok(ids) if ids == vec![layer.clone()]
        ));
        assert!(matches!(
            parse_config(&config("arm64", json!([layer]))),
            Err(ImageError::WrongPlatform(arch)) if arch == "arm64"
        ));
        for bad in [json!([1]), json!(["sha256:abc"]), json!(null)] {
            assert!(matches!(
                parse_config(&config("amd64", bad)),
                Err(ImageError::InvalidConfig(_))
            ));
        }
        assert!(matches!(
            parse_config("not json"),
            Err(ImageError::InvalidConfig(_))
        ));
    }
}
