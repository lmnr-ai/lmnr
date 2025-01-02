use super::MediaType;
use anyhow::Result;

pub struct MockStorage;

#[async_trait::async_trait]
impl super::Storage for MockStorage {
    async fn store(&self, _data: Vec<u8>, _key: &str, _media_type: MediaType) -> Result<String> {
        Ok("mock".to_string())
    }
}
