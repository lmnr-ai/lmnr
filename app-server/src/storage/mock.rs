use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;

pub struct MockStorage;

#[async_trait]
impl super::StorageTrait for MockStorage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;
    async fn store(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }

    async fn store_direct(&self, _data: Vec<u8>, _key: &str) -> Result<String> {
        Ok("mock".to_string())
    }

    async fn get(&self, _key: &str, _bucket: &Option<String>) -> Result<Vec<u8>> {
        Ok(b"mock data".to_vec())
    }

    async fn get_stream(
        &self,
        _key: &str,
        _bucket: &Option<String>,
    ) -> Result<Self::StorageBytesStream> {
        Ok(Box::pin(futures_util::stream::once(async move {
            bytes::Bytes::new()
        })))
    }

    async fn get_size(&self, _key: &str, _bucket: &Option<String>) -> Result<u64> {
        Ok(0)
    }
}
