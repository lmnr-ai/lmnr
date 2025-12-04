use std::sync::Arc;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::EventBatch,
    cache::Cache,
    ch::browser_events::insert_browser_events,
    db::DB,
    features::{Feature, is_feature_enabled},
    traces::limits::update_workspace_limit_exceeded_by_project_id,
    worker::MessageHandler,
};

#[derive(Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    pub batch: EventBatch,
    pub project_id: Uuid,
}

/// Handler for browser events
pub struct BrowserEventHandler {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub cache: Arc<Cache>,
}

#[async_trait]
impl MessageHandler for BrowserEventHandler {
    type Message = QueueBrowserEventMessage;

    async fn handle(&self, message: Self::Message) -> anyhow::Result<()> {
        let project_id = message.project_id;
        let batch = message.batch;

        if batch.events.is_empty() {
            return Ok(());
        }

        let insert_browser_events_fn = || async {
            insert_browser_events(&self.clickhouse, project_id, &batch)
                .await
                .map_err(|e| {
                    log::error!(
                        "Failed attempt to insert browser events. Will retry: {:?}",
                        e
                    );
                    backoff::Error::transient(e)
                })
        };

        let exponential_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(1000))
            .with_multiplier(1.5)
            .with_randomization_factor(0.5)
            .with_max_interval(std::time::Duration::from_secs(60))
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(60)))
            .build();

        let bytes_written =
            backoff::future::retry(exponential_backoff, insert_browser_events_fn).await?;

        // Update workspace limits cache
        if is_feature_enabled(Feature::UsageLimit) {
            if let Err(e) = update_workspace_limit_exceeded_by_project_id(
                self.db.clone(),
                self.clickhouse.clone(),
                self.cache.clone(),
                project_id,
                bytes_written,
            )
            .await
            {
                log::error!(
                    "Failed to update workspace limit exceeded for project [{}]: {:?}",
                    project_id,
                    e
                );
            }
        }

        Ok(())
    }
}
