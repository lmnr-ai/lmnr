//! Payload handling for StorageService.

use anyhow::Result;
use std::sync::Arc;
use tracing::instrument;

use crate::mq::MessageQueue;
use crate::mq::MessageQueueTrait;

use super::utils::key_to_url;
use super::{PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY, QueuePayloadMessage};

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
