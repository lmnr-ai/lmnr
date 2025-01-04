use anyhow::Result;

pub struct MockStorage;

#[async_trait::async_trait]
impl super::Storage for MockStorage {
    async fn store(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }
}
