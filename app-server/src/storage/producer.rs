//! Payload handling for StorageService.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::instrument;

use crate::mq::MessageQueue;
use crate::mq::MessageQueueTrait;

use super::{PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueuePayloadMessage {
    pub key: String,
    pub data: Vec<u8>,
    pub bucket: String,
}

/// Publish a payload to the queue for async storage.
/// Returns the URL that will be available after the payload is stored.
#[instrument(skip(queue, data))]
pub async fn publish_payload(
    queue: Arc<MessageQueue>,
    bucket: &str,
    key: &str,
    data: Vec<u8>,
) -> Result<String> {
    let message = QueuePayloadMessage {
        key: key.to_string(),
        data,
        bucket: bucket.to_string(),
    };

    queue
        .publish(
            &serde_json::to_vec(&message)?,
            PAYLOADS_EXCHANGE,
            PAYLOADS_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(key_to_url(key))
}

/// Convert a storage key to a URL.
/// Key format: "project/{project_id}/{payload_id}[.ext]"
fn key_to_url(key: &str) -> String {
    let parts = key
        .strip_prefix("project/")
        .unwrap()
        .split("/")
        .collect::<Vec<&str>>();
    format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
}
