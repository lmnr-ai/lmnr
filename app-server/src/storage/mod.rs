use anyhow::Result;
use async_trait::async_trait;
use enum_delegate;

pub mod mock;
pub mod s3;

use mock::MockStorage;
use s3::S3Storage;

#[enum_delegate::implement(StorageTrait)]
pub enum Storage {
    Mock(MockStorage),
    S3(S3Storage),
}

#[async_trait]
#[enum_delegate::register]
pub trait StorageTrait {
    type StorageBytesStream: futures_util::stream::Stream<Item = bytes::Bytes>;
    async fn get_stream(&self, bucket: &str, key: &str) -> Result<Self::StorageBytesStream>;
    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64>;
}
