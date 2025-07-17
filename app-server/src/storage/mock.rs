use anyhow::Result;

pub struct MockStorage;

impl super::StorageTrait for MockStorage {
    async fn store(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }
}
