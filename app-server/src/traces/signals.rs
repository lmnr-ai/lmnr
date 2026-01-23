use std::env;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY};
use crate::ch::{self, events::CHEvent};
use crate::db;
use crate::db::events::{Event, EventSource};
use crate::db::signals::Signal;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::notifications::{
    self, EventIdentificationPayload, NotificationType, SlackMessagePayload,
};
use crate::traces::clustering;
use crate::utils::call_service_with_retry;
use crate::worker::{HandlerError, MessageHandler};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub trigger_span_id: Uuid,
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
    trigger_span_id: Uuid,
    signal: Signal,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = SignalMessage {
        trace_id,
        project_id,
        trigger_span_id,
        event_definition: signal.clone(),
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY)
        .await?;

    log::debug!(
        "Pushed signal message to queue: trace_id={}, project_id={}, trigger_span_id={}, event={}",
        trace_id,
        project_id,
        trigger_span_id,
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
    let signal = &message.event_definition;

    let service_url = env::var("SEMANTIC_EVENT_SERVICE_URL")
        .map_err(|_| anyhow::anyhow!("SEMANTIC_EVENT_SERVICE_URL environment variable not set"))?;

    let auth_token = env::var("SEMANTIC_EVENT_SERVICE_SECRET_KEY").map_err(|_| {
        anyhow::anyhow!("SEMANTIC_EVENT_SERVICE_SECRET_KEY environment variable not set")
    })?;

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "event_definition": serde_json::to_value(signal).unwrap(), // shall stay "event_definition" until modal service is updated
    });

    let response: SignalEventResponse =
        call_service_with_retry(client, &service_url, &auth_token, &request_body).await?;

    if !response.success {
        return Err(anyhow::anyhow!(
            "Semantic event identification failed: {:?}",
            response.error
        ));
    }

    // if response has attributes it means we identified the event
    if let Some(attributes) = response.attributes.clone() {
        // create a new event if we have attributes
        let event = Event {
            id: uuid::Uuid::new_v4(),
            span_id: message.trigger_span_id,
            project_id: message.project_id,
            timestamp: chrono::Utc::now(),
            name: signal.name.clone(),
            attributes: attributes.clone(),
            trace_id: message.trace_id,
            source: EventSource::Semantic,
        };

        let ch_events = vec![CHEvent::from_db_event(&event)];

        ch::events::insert_events(clickhouse, ch_events).await?;

        process_event_notifications_and_clustering(
            db,
            queue,
            message.project_id,
            message.trace_id,
            message.trigger_span_id,
            &signal.name,
            attributes,
            event,
        )
        .await?;
    }

    Ok(())
}

/// Process notifications and clustering for an identified event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
    event_name: &str,
    attributes: Value,
    event: Event,
) -> anyhow::Result<()> {
    // Check for Slack notifications
    // It's ok to not check for feature flag here, because channels can't be added without Slack integration
    let channels =
        db::slack_channel_to_events::get_channels_for_event(&db.pool, project_id, event_name)
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
            span_id,
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
            event_name,
            EventSource::Semantic,
        )
        .await
        {
            if let Err(e) = clustering::push_to_event_clustering_queue(
                project_id,
                event,
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
