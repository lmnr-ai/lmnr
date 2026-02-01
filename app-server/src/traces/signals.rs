use std::env;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY};
use crate::ch::signal_events::{CHSignalEvent, insert_signal_events};
use crate::ch::signal_runs::{CHSignalRun, insert_signal_runs};
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::db::events::EventSource;
use crate::db::signals::Signal;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::notifications::{
    self, EventIdentificationPayload, NotificationType, SlackMessagePayload,
};
use crate::signals::{RunStatus, SignalRun};
use crate::utils::call_service_with_retry;
use crate::worker::{HandlerError, MessageHandler};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub trigger_id: Option<Uuid>, // TODO: Remove Option once old messages in queue without trigger_id are processed
    pub event_definition: Signal, // should stay "event_definition" for backward compatibility
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalEventResponse {
    pub success: bool,
    #[serde(default)]
    pub attributes: Option<Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Push a signal message to the signals queue
pub async fn push_to_signals_queue(
    trace_id: Uuid,
    project_id: Uuid,
    trigger_id: Option<Uuid>,
    signal: Signal,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = SignalMessage {
        trace_id,
        project_id,
        trigger_id,
        event_definition: signal.clone(),
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY, None)
        .await?;

    log::debug!(
        "Pushed signal message to queue: trace_id={}, project_id={}, trigger_id={}, event={}",
        trace_id,
        project_id,
        trigger_id.unwrap_or_default(),
        signal.name
    );

    Ok(())
}

/// Handler for signal messages
pub struct SignalHandler {
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    client: reqwest::Client,
}

impl SignalHandler {
    pub fn new(
        db: Arc<db::DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        client: reqwest::Client,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            client,
        }
    }
}

#[async_trait]
impl MessageHandler for SignalHandler {
    type Message = SignalMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_signal(
            &self.client,
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
        )
        .await
        .map_err(Into::into)
    }
}

/// Process signal identification
async fn process_signal(
    client: &reqwest::Client,
    message: SignalMessage,
    db: Arc<db::DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    // Create signal run instance
    let mut run: SignalRun = SignalRun {
        run_id: Uuid::new_v4(),
        project_id: message.project_id,
        job_id: Uuid::nil(),
        trigger_id: message.trigger_id.unwrap_or_default(),
        signal_id: message.event_definition.id,
        trace_id: message.trace_id,
        step: 0,
        status: RunStatus::Pending,
        internal_trace_id: Uuid::nil(),
        internal_span_id: Uuid::nil(),
        updated_at: Utc::now(),
        event_id: None,
        error_message: None,
    };

    let signal = &message.event_definition;

    let service_url = env::var("SEMANTIC_EVENT_SERVICE_URL")
        .map_err(|_| anyhow::anyhow!("SEMANTIC_EVENT_SERVICE_URL environment variable not set"))?;

    let auth_token = env::var("SEMANTIC_EVENT_SERVICE_SECRET_KEY").map_err(|_| {
        anyhow::anyhow!("SEMANTIC_EVENT_SERVICE_SECRET_KEY environment variable not set")
    })?;

    let request_body: Value = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "event_definition": serde_json::to_value(signal).unwrap(), // shall stay "event_definition" until modal service is updated
    });

    let response: SignalEventResponse =
        call_service_with_retry(client, &service_url, &auth_token, &request_body).await?;

    if !response.success {
        let error_msg = response
            .error
            .clone()
            .unwrap_or_else(|| "Unknown error".to_string());
        run = run.failed(&error_msg);

        if !run.trigger_id.is_nil() {
            // don't insert runs for old queue messages with no trigger id
            let ch_run = CHSignalRun::from(&run);
            if let Err(e) = insert_signal_runs(clickhouse, &[ch_run]).await {
                log::error!("Failed to insert failed signal run to ClickHouse: {:?}", e);
            }
        }

        return Err(anyhow::anyhow!(
            "Semantic event identification failed: {:?}",
            response.error
        ));
    }

    // if response has attributes it means we identified the event
    if let Some(attributes) = response.attributes.clone() {
        let event_id = Uuid::new_v4();

        // Create signal event
        let signal_event = CHSignalEvent::new(
            event_id,
            message.project_id,
            message.event_definition.id,
            message.trace_id,
            run.run_id,
            signal.name.clone(),
            attributes.clone(),
            Utc::now(),
        );

        insert_signal_events(clickhouse.clone(), vec![signal_event.clone()]).await?;

        process_event_notifications_and_clustering(
            db,
            queue,
            message.project_id,
            message.trace_id,
            signal_event,
        )
        .await?;

        // Mark run as completed with event
        run = run.completed_with_event(event_id);
    } else {
        // No event identified, but still completed successfully
        run = run.completed();
    }

    // Insert completed signal run to ClickHouse
    if !run.trigger_id.is_nil() {
        // don't insert runs for old queue messages with no trigger id
        let ch_run = CHSignalRun::from(&run);
        if let Err(e) = insert_signal_runs(clickhouse, &[ch_run]).await {
            log::error!(
                "Failed to insert completed signal run to ClickHouse: {:?}",
                e
            );
        }
    }

    Ok(())
}

/// Process notifications and clustering for an identified signal event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    // Check for Slack notifications
    // It's ok to not check for feature flag here, because channels can't be added without Slack integration
    let channels =
        db::slack_channel_to_events::get_channels_for_event(&db.pool, project_id, &event_name)
            .await?;

    // Push a notification for each configured channel
    for channel in channels {
        let payload = EventIdentificationPayload {
            event_name: event_name.to_string(),
            extracted_information: Some(attributes.clone()),
            channel_id: channel.channel_id.clone(),
            integration_id: channel.integration_id,
        };

        let notification_message = notifications::NotificationMessage {
            project_id,
            trace_id,
            notification_type: NotificationType::Slack,
            event_name: event_name.to_string(),
            payload: serde_json::to_value(SlackMessagePayload::EventIdentification(payload))?,
        };

        if let Err(e) =
            notifications::push_to_notification_queue(notification_message, queue.clone()).await
        {
            log::error!(
                "Failed to push to notification queue for channel {}: {:?}",
                channel.channel_id,
                e
            );
        }
    }

    if is_feature_enabled(Feature::Clustering) {
        // Check for event clustering configuration
        if let Ok(Some(cluster_config)) = db::event_cluster_configs::get_event_cluster_config(
            &db.pool,
            project_id,
            &event_name,
            EventSource::Semantic,
        )
        .await
        {
            if let Err(e) = push_to_event_clustering_queue(
                project_id,
                signal_event,
                cluster_config.value_template,
                queue.clone(),
            )
            .await
            {
                log::error!(
                    "Failed to push to event clustering queue for event {}: {:?}",
                    event_name,
                    e
                );
            }
        }
    }

    Ok(())
}
