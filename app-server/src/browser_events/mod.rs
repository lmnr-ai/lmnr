use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::EventBatch,
    batch_worker::message_handler::{BatchMessageHandler, HandlerResult, UniqueId},
    cache::Cache,
    ch::browser_events::{BrowserEventCHRow, insert_browser_events},
    db::DB,
    features::{Feature, is_feature_enabled},
    traces::limits::update_workspace_limit_exceeded_by_project_id,
};

#[derive(Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    pub batch: EventBatch,
    pub project_id: Uuid,
}

impl UniqueId for QueueBrowserEventMessage {
    fn get_unique_id(&self) -> String {
        self.id.to_string()
    }
}

pub struct BatchingConfig {
    pub size: usize,
    pub flush_interval: Duration,
    pub ch_wait_for_async_insert: bool,
}

/// Handler for browser events
pub struct BrowserEventHandler {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub cache: Arc<Cache>,
    pub config: BatchingConfig,
}

/// A batch of browser events with metadata for interval-based flushing
#[derive(Clone)]
pub struct BrowserEventBatch {
    pub messages: Vec<QueueBrowserEventMessage>,
    pub last_flush: Instant,
}

impl BrowserEventHandler {
    /// Flattens accumulated messages into BrowserEventCHRow and inserts them into ClickHouse.
    /// Returns a HandlerResult with all messages to ack on success, or requeue on failure.
    async fn flush_batch(
        &self,
        state: &mut BrowserEventBatch,
    ) -> HandlerResult<QueueBrowserEventMessage> {
        log::debug!("Flushing browser events batch");

        // Take ownership of messages and reset state
        let messages_to_flush = std::mem::take(&mut state.messages);
        state.last_flush = Instant::now();

        match self.flush_batch_inner(&messages_to_flush).await {
            Ok(result) => result,
            Err(()) => HandlerResult::requeue(messages_to_flush),
        }
    }

    async fn flush_batch_inner(
        &self,
        messages_to_flush: &[QueueBrowserEventMessage],
    ) -> Result<HandlerResult<QueueBrowserEventMessage>, ()> {
        // Flatten all messages into BrowserEventCHRows
        let events_to_insert: Vec<BrowserEventCHRow> = messages_to_flush
            .iter()
            .flat_map(|msg| {
                let project_id = msg.project_id;
                let batch = &msg.batch;
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
            return Ok(HandlerResult::empty());
        }

        // Insert events into ClickHouse with exponential backoff
        let wait_for_async_insert = self.config.ch_wait_for_async_insert;
        let insert_browser_events_fn = || async {
            insert_browser_events(&self.clickhouse, &events_to_insert, wait_for_async_insert)
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

        Ok(HandlerResult::ack(messages_to_flush.to_vec()))
    }
}

#[async_trait]
impl BatchMessageHandler for BrowserEventHandler {
    type Message = QueueBrowserEventMessage;
    type State = BrowserEventBatch;

    /// Interval is half of the flush interval to ensure batches are checked frequently enough.
    fn interval(&self) -> Duration {
        self.config.flush_interval
    }

    fn initial_state(&self) -> Self::State {
        BrowserEventBatch {
            messages: Vec::new(),
            last_flush: Instant::now(),
        }
    }

    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Skip empty batches
        if message.batch.events.is_empty() {
            return HandlerResult::empty();
        }

        // Add message to the batch
        state.messages.push(message);

        // Check if we've reached the batch size threshold
        let total_events: usize = state.messages.iter().map(|m| m.batch.events.len()).sum();
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
        // Check if we have messages and enough time has passed since last flush
        if !state.messages.is_empty() && state.last_flush.elapsed() >= self.config.flush_interval {
            return self.flush_batch(state).await;
        }

        HandlerResult::empty()
    }
}
