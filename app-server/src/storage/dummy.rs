use anyhow::Result;

pub struct DummyStorage;

#[async_trait::async_trait]
impl super::Storage for DummyStorage {
    async fn store(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("dummy".to_string())
    }

    async fn retrieve(&self, _key: &str) -> Result<Vec<u8>> {
        Ok(vec![])
    }
}
