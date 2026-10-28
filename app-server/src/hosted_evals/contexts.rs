//! Docker build contexts for trial images. Daytona builds a sandbox's image from
//! a Dockerfile plus context tars stored at `<org>/<hash>/context.tar` in its
//! build bucket, and caches the build. That bucket is shared by every project
//! in our Daytona org, so clients name a context by `md5(tar)` (verified while
//! it streams in) and it is stored under [`stored_hash`], derived from the
//! project: one project can't plant a context another project's build reads.

use anyhow::{Result, anyhow};
use aws_sdk_s3::{
    Client,
    config::{BehaviorVersion, Credentials, Region},
};
use bytes::Bytes;
use md5::{Digest, Md5};
use tokio::sync::mpsc::Receiver;
use uuid::Uuid;

use super::{daytona::StorageAccess, daytona_client};
use crate::storage::{StorageTrait, s3::S3Storage};

pub struct ContextStore {
    storage: S3Storage,
    bucket: String,
    organization_id: String,
}

impl ContextStore {
    pub async fn connect(http: &reqwest::Client) -> Result<Self> {
        let access = daytona_client(http)?.storage_push_access().await?;
        Ok(Self::from_access(access))
    }

    fn from_access(access: StorageAccess) -> Self {
        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(access.region))
            .endpoint_url(access.storage_url)
            .credentials_provider(Credentials::new(
                access.access_key,
                access.secret,
                Some(access.session_token),
                None,
                "daytona",
            ))
            .build();
        Self {
            storage: S3Storage::new(Client::from_conf(config)),
            bucket: access.bucket,
            organization_id: access.organization_id,
        }
    }

    pub async fn exists(&self, project_id: &Uuid, hash: &str) -> bool {
        self.storage
            .get_size(&self.bucket, &self.key(project_id, hash))
            .await
            .is_ok()
    }

    /// Stores the tar streamed through `chunks`. The sender must end the stream
    /// with an `Err` to abort (see [`ContextHasher`]).
    pub async fn upload(
        &self,
        project_id: &Uuid,
        hash: &str,
        chunks: Receiver<Result<Bytes>>,
    ) -> Result<()> {
        self.storage
            .upload_stream(&self.bucket, &self.key(project_id, hash), chunks)
            .await
            .map(|_| ())
    }

    fn key(&self, project_id: &Uuid, hash: &str) -> String {
        format!(
            "{}/{}/context.tar",
            self.organization_id,
            stored_hash(project_id, hash)
        )
    }
}

/// The hash Daytona knows a project's context by.
pub fn stored_hash(project_id: &Uuid, hash: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(project_id.as_bytes());
    hasher.update(hash.to_ascii_lowercase().as_bytes());
    hex::encode(hasher.finalize())
}

/// `md5` of a context as its bytes stream past.
#[derive(Default)]
pub struct ContextHasher(Md5);

impl ContextHasher {
    pub fn update(&mut self, chunk: &[u8]) {
        self.0.update(chunk);
    }

    pub fn verify(self, expected: &str) -> Result<()> {
        let actual = hex::encode(self.0.finalize());
        if actual.eq_ignore_ascii_case(expected) {
            Ok(())
        } else {
            Err(anyhow!(
                "Context hash mismatch: expected {expected}, got {actual}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_the_content_hash() {
        let mut hasher = ContextHasher::default();
        hasher.update(b"tar ");
        hasher.update(b"bytes");
        assert!(hasher.verify("4d5b2dc2d3a2cc5a2ab4b0f5a6a3c3d8").is_err());
        let mut hasher = ContextHasher::default();
        hasher.update(b"tar bytes");
        assert!(
            hasher
                .verify(&hex::encode(Md5::digest(b"tar bytes")))
                .is_ok()
        );
    }

    #[test]
    fn stored_hash_differs_per_project() {
        let hash = hex::encode(Md5::digest(b"tar bytes"));
        let a = Uuid::parse_str("8f0a2b4c-1d3e-4f56-8a7b-9c0d1e2f3a4b").unwrap();
        assert_ne!(stored_hash(&a, &hash), stored_hash(&Uuid::nil(), &hash));
        assert_eq!(
            stored_hash(&a, &hash),
            stored_hash(&a, &hash.to_uppercase())
        );
        assert_eq!(stored_hash(&a, &hash).len(), 32);
    }
}
