use anyhow::Result;
use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use base64::{Engine, prelude::BASE64_STANDARD};
use enum_delegate;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait,
};

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

pub async fn process_payloads(storage: Arc<Storage>, payloads_message_queue: Arc<MessageQueue>) {
    loop {
        inner_process_payloads(storage.clone(), payloads_message_queue.clone()).await;
        log::warn!("Payload listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_payloads(storage: Arc<Storage>, queue: Arc<MessageQueue>) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(PAYLOADS_QUEUE, PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY)
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from payloads queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(60))) // 1 minute max
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to payloads queue");
            receiver
        }
        Err(e) => {
            log::error!("Failed to connect to payloads queue after retries: {:?}", e);
            return;
        }
    };

    log::info!("Started processing payloads from queue");

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from payloads queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let message = match serde_json::from_slice::<QueuePayloadMessage>(&delivery.data()) {
            Ok(message) => message,
            Err(e) => {
                log::error!("Failed to deserialize payload message from queue: {:?}", e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        let store_payload = || async {
            storage.store_direct(&message.bucket, &message.key, message.data.clone()).await.map_err(|e| {
                log::error!("Failed attempt to store payload. Will retry according to backoff policy. Error: {:?}", e);
                backoff::Error::transient(e)
            })
        };

        let exponential_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(1000))
            .with_multiplier(1.5)
            .with_randomization_factor(0.5)
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(10)))
            .build();

        match backoff::future::retry(exponential_backoff, store_payload).await {
            Ok(url) => {
                log::debug!("Successfully stored payload to: {}", url);
                if let Err(e) = acker.ack().await {
                    log::error!("Failed to ack MQ delivery (payload storage): {:?}", e);
                }
            }
            Err(e) => {
                log::error!(
                    "Exhausted backoff retries. Failed to store payload: {:?}",
                    e
                );
                if let Err(e) = acker.reject(false).await {
                    log::error!("Failed to reject MQ delivery (payload storage): {:?}", e);
                }
            }
        }
    }

    log::warn!("Payloads queue closed connection. Shutting down payload listener");
}
