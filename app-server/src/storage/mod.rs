use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;
use enum_dispatch::enum_dispatch;

pub mod mock;
pub mod s3;

use mock::MockStorage;
use s3::S3Storage;

pub type StorageBytesStream =
    Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send>>;

#[enum_dispatch]
pub enum Storage {
    Mock(MockStorage),
    S3(S3Storage),
}

#[async_trait]
#[enum_dispatch(Storage)]
pub trait StorageTrait {
    async fn get_stream(&self, bucket: &str, key: &str) -> Result<StorageBytesStream>;
    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64>;
}
