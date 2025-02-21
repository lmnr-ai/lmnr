use anyhow::Result;
use async_trait::async_trait;
use base64::{prelude::BASE64_STANDARD, Engine};
use enum_dispatch::enum_dispatch;
use uuid::Uuid;

pub mod mock;
pub mod s3;

use mock::MockStorage;
use s3::S3Storage;

#[enum_dispatch]
pub enum Storage {
    Mock(MockStorage),
    S3(S3Storage),
}

#[async_trait]
#[enum_dispatch(Storage)]
pub trait StorageTrait {
    async fn store(&self, data: Vec<u8>, key: &str) -> Result<String>;
}

pub fn create_key(project_id: &Uuid, file_extension: &Option<String>) -> String {
    format!(
        "project/{project_id}/{}{}",
        Uuid::new_v4(),
        file_extension
            .as_ref()
            .map(|ext| format!(".{}", ext))
            .unwrap_or_default()
    )
}

pub fn base64_to_bytes(base64: &str) -> Result<Vec<u8>> {
    BASE64_STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| e.into())
}
