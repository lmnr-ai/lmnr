use anyhow::Result;

pub struct MockStorage;

impl super::StorageTrait for MockStorage {
    async fn store(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }

    async fn store_direct(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }

    async fn get(&self, _key: &str) -> Result<Vec<u8>> {
        Ok(b"mock data".to_vec())
    }
}
