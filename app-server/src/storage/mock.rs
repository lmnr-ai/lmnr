use anyhow::Result;
use async_trait::async_trait;

use super::StorageBytesStream;

pub struct MockStorage;

#[async_trait]
impl super::StorageTrait for MockStorage {
    async fn get_stream(&self, _bucket: &str, _key: &str) -> Result<StorageBytesStream> {
        Ok(Box::pin(futures_util::stream::once(async move {
            bytes::Bytes::new()
        })))
    }

    async fn get_size(&self, _bucket: &str, _key: &str) -> Result<u64> {
        Ok(0)
    }
}
