use anyhow::Result;
use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use std::sync::Arc;
use uuid::Uuid;

use crate::worker::MessageHandler;

use super::{QueuePayloadMessage, StorageService};

/// Extract project_id from a storage key.
/// Key format: "project/{project_id}/{payload_id}[.ext]"
fn extract_project_id_from_key(key: &str) -> Result<Uuid> {
    let project_id_str = key
        .strip_prefix("project/")
        .ok_or_else(|| anyhow::anyhow!("Invalid key format: missing 'project/' prefix"))?
        .split('/')
        .next()
        .ok_or_else(|| anyhow::anyhow!("Invalid key format: missing project_id"))?;

    Uuid::parse_str(project_id_str).map_err(|e| anyhow::anyhow!("Invalid project_id in key: {}", e))
}

/// Handler for payload storage
pub struct PayloadHandler {
    pub storage_service: Arc<StorageService>,
}

#[async_trait]
impl MessageHandler for PayloadHandler {
    type Message = QueuePayloadMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let project_id = extract_project_id_from_key(&message.key)?;

        let store_payload = || async {
            self.storage_service
                .store(
                    project_id,
                    &message.bucket,
                    &message.key,
                    message.data.clone(),
                )
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

