use anyhow::Result;
use async_trait::async_trait;
use base64::{prelude::BASE64_STANDARD, Engine};
use uuid::Uuid;

pub mod mock;
pub mod s3;

#[async_trait]
pub trait Storage: Sync + Send {
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
