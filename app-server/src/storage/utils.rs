use anyhow::Result;
use base64::{Engine, prelude::BASE64_STANDARD};
use uuid::Uuid;

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
