use anyhow::Result;
use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use base64::{Engine, prelude::BASE64_STANDARD};
use enum_delegate;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::worker::MessageHandler;

pub mod mock;
pub mod s3;

pub const PAYLOADS_QUEUE: &str = "payloads_queue";
pub const PAYLOADS_EXCHANGE: &str = "payloads_exchange";
pub const PAYLOADS_ROUTING_KEY: &str = "payloads_routing_key";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueuePayloadMessage {
    pub key: String,
    pub data: Vec<u8>,
    pub bucket: String,
}

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
    async fn store(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String>;
    async fn store_direct(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String>;
    async fn get_stream(&self, bucket: &str, key: &str) -> Result<Self::StorageBytesStream>;
    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64>;
}

pub fn create_key(project_id: &Uuid, file_extension: &Option<String>) -> String {
    format!(
        "project/{project_id}/{}{}",
        Uuid::new_v4(),
        file_extension
            .as_ref()
            .map(|ext| format!(".{}", ext))
            .unwrap_or_default()
    )
}

pub fn base64_to_bytes(base64: &str) -> Result<Vec<u8>> {
    BASE64_STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| e.into())
}

/// Handler for payload storage
pub struct PayloadHandler {
    pub storage: Arc<Storage>,
}

#[async_trait]
impl MessageHandler for PayloadHandler {
    type Message = QueuePayloadMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let store_payload = || async {
            self.storage
                .store_direct(&message.bucket, &message.key, message.data.clone())
                .await
                .map_err(|e| {
                    log::error!("Failed attempt to store payload. Will retry: {:?}", e);
                    backoff::Error::transient(e)
                })
        };

        let exponential_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(1000))
            .with_multiplier(1.5)
            .with_randomization_factor(0.5)
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(10)))
            .build();

        let url = backoff::future::retry(exponential_backoff, store_payload)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to store payload: {:?}", e))?;

        log::debug!("Successfully stored payload to: {}", url);

        Ok(())
    }
}
