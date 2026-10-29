use anyhow::{Result, bail};
use async_trait::async_trait;
use bytes::Bytes;
use tokio::sync::mpsc::Receiver;

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

    async fn exists(&self, _bucket: &str, _key: &str) -> Result<bool> {
        Ok(false)
    }

    async fn upload_stream(
        &self,
        _bucket: &str,
        _key: &str,
        _chunks: Receiver<Result<Bytes>>,
    ) -> Result<u64> {
        bail!("uploads require S3 storage")
    }
}
