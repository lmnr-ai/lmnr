use anyhow::Result;
use async_trait::async_trait;
use enum_delegate;

mod consumer;
pub mod data_plane;
pub mod mock;
pub mod s3;
mod service;
mod service_payload;
mod utils;

pub use consumer::PayloadHandler;
pub use service::StorageService;
pub use service_payload::QueuePayloadMessage;
pub use utils::{base64_to_bytes, create_key};

use mock::MockStorage;
use s3::S3Storage;

pub const PAYLOADS_QUEUE: &str = "payloads_queue";
pub const PAYLOADS_EXCHANGE: &str = "payloads_exchange";
pub const PAYLOADS_ROUTING_KEY: &str = "payloads_routing_key";

#[enum_delegate::implement(StorageTrait)]
pub enum Storage {
    Mock(MockStorage),
    S3(S3Storage),
}

#[async_trait]
#[enum_delegate::register]
pub trait StorageTrait {
    type StorageBytesStream: futures_util::stream::Stream<Item = bytes::Bytes>;
    async fn store(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String>;
    async fn get_stream(&self, bucket: &str, key: &str) -> Result<Self::StorageBytesStream>;
    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64>;
}
