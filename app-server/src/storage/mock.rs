use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;

use crate::db::workspaces::WorkspaceDeployment;

pub struct MockStorage;

#[async_trait]
impl super::StorageTrait for MockStorage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

    async fn store(
        &self,
        _bucket: &str,
        _key: &str,
        _data: Vec<u8>,
        _config: Option<&WorkspaceDeployment>,
    ) -> Result<String> {
        Ok("mock".to_string())
    }

    async fn get_stream(
        &self,
        _bucket: &str,
        _key: &str,
        _config: Option<&WorkspaceDeployment>,
    ) -> Result<Self::StorageBytesStream> {
        Ok(Box::pin(futures_util::stream::once(async move {
            bytes::Bytes::new()
        })))
    }

    async fn get_size(
        &self,
        _bucket: &str,
        _key: &str,
        _config: Option<&WorkspaceDeployment>,
    ) -> Result<u64> {
        Ok(0)
    }
}
