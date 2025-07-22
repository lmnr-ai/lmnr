use anyhow::Result;
use aws_sdk_s3::Client;
use std::sync::Arc;

use crate::{
    mq::{MessageQueue, MessageQueueTrait},
    storage::{PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY, QueuePayloadMessage},
};

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
    bucket: String,
    queue: Arc<MessageQueue>,
}

impl S3Storage {
    pub fn new(client: Client, bucket: String, queue: Arc<MessageQueue>) -> Self {
        Self {
            client,
            bucket,
            queue,
        }
    }

    fn get_url(&self, key: &str) -> String {
        let parts = key
            .strip_prefix("project/")
            .unwrap()
            .split("/")
            .collect::<Vec<&str>>();
        format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
    }
}

impl super::StorageTrait for S3Storage {
    async fn store(&self, data: Vec<u8>, key: &str) -> Result<String> {
        // Push to queue instead of storing directly
        let message = QueuePayloadMessage {
            key: key.to_string(),
            data,
        };

        self.queue
            .publish(
                &serde_json::to_vec(&message)?,
                PAYLOADS_EXCHANGE,
                PAYLOADS_ROUTING_KEY,
            )
            .await?;

        // Return the URL that will be available after processing
        Ok(self.get_url(key))
    }

    async fn store_direct(&self, data: Vec<u8>, key: &str) -> Result<String> {
        // Direct storage method used by the payload worker
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(data.into())
            .send()
            .await?;

        Ok(self.get_url(key))
    }
}
