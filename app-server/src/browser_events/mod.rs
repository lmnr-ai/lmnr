use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::EventBatch,
    batch_worker::message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery},
    cache::Cache,
    ch::browser_events::{BrowserEventCHRow, insert_browser_events},
    db::DB,
    features::{Feature, is_feature_enabled},
    traces::limits::update_workspace_limit_exceeded_by_project_id,
    worker::HandlerError,
};

#[derive(Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    pub batch: EventBatch,
    pub project_id: Uuid,
}

pub struct BatchingConfig {
    pub size: usize,
    pub flush_interval: Duration,
}

/// Handler for browser events
pub struct BrowserEventHandler {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub cache: Arc<Cache>,
    pub config: BatchingConfig,
}

impl BrowserEventHandler {
    /// Flattens accumulated deliveries into BrowserEventCHRow and inserts them into ClickHouse.
    /// Returns a HandlerResult with all deliveries to ack on success, or requeue/reject on failure.
    async fn flush_batch(
        &self,
        state: &mut Vec<MessageDelivery<QueueBrowserEventMessage>>,
    ) -> HandlerResult<QueueBrowserEventMessage> {
        log::debug!("Flushing browser events batch");

        // Take ownership of deliveries and reset state
        let deliveries_to_flush = std::mem::take(state);

        match self.flush_batch_inner(&deliveries_to_flush).await {
            Ok(()) => HandlerResult::ack(deliveries_to_flush),
            Err(HandlerError::Transient(_)) => HandlerResult::requeue(deliveries_to_flush),
            Err(HandlerError::Permanent(_)) => HandlerResult::reject(deliveries_to_flush),
        }
    }

    async fn flush_batch_inner(
        &self,
        deliveries_to_flush: &[MessageDelivery<QueueBrowserEventMessage>],
    ) -> Result<(), HandlerError> {
        // Flatten all deliveries into BrowserEventCHRows
        let events_to_insert: Vec<BrowserEventCHRow> = deliveries_to_flush
            .iter()
            .flat_map(|delivery| {
                let project_id = delivery.message.project_id;
                let batch = &delivery.message.batch;
                batch.events.iter().map(move |event| {
                    BrowserEventCHRow::new(
                        batch.session_id,
                        batch.trace_id,
                        event.timestamp.abs() as u64,
                        event.event_type,
                        event.data.clone(),
                        project_id,
                    )
                })
            })
            .collect();

        if events_to_insert.is_empty() {
            return Ok(());
        }

        // Insert events into ClickHouse with exponential backoff
        let insert_browser_events_fn = || async {
            insert_browser_events(&self.clickhouse, &events_to_insert)
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

        backoff::future::retry(exponential_backoff, insert_browser_events_fn)
            .await
            .map_err(|e| {
                log::error!("Failed to insert browser events after retries: {:?}", e);
                HandlerError::transient(e)
            })?;

        // Update usage limits for all affected projects
        if is_feature_enabled(Feature::UsageLimit) {
            let mut bytes_per_project: HashMap<Uuid, usize> = HashMap::new();
            for event in &events_to_insert {
                *bytes_per_project.entry(event.project_id).or_default() += event.size_bytes();
            }

            for (project_id, bytes) in bytes_per_project {
                if let Err(e) = update_workspace_limit_exceeded_by_project_id(
                    self.db.clone(),
                    self.clickhouse.clone(),
                    self.cache.clone(),
                    project_id,
                    bytes,
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
        }

        Ok(())
    }
}

#[async_trait]
impl BatchMessageHandler for BrowserEventHandler {
    type Message = QueueBrowserEventMessage;
    type State = Vec<MessageDelivery<QueueBrowserEventMessage>>;

    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn initial_state(&self) -> Self::State {
        Vec::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Skip empty batches
        if delivery.message.batch.events.is_empty() {
            return HandlerResult::ack(vec![delivery]);
        }

        // Add delivery to the batch
        state.push(delivery);

        // Check if we've reached the batch size threshold
        let total_events: usize = state.iter().map(|d| d.message.batch.events.len()).sum();
        log::debug!(
            "Browser events batch size: {}, total events: {}",
            self.config.size,
            total_events
        );

        if total_events >= self.config.size {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        // Check if we have deliveries and enough time has passed since last flush
        if !state.is_empty() {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }
}
