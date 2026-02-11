use anyhow::Result;
use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::worker::MessageHandler;

use super::{Storage, StorageTrait};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueuePayloadMessage {
    pub key: String,
    pub data: Vec<u8>,
    pub bucket: String,
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
                .store(&message.bucket, &message.key, message.data.clone())
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
