use std::time::Duration;

use async_trait::async_trait;
use chrono::Utc;

use super::AuditEvent;
use crate::{
    batch_worker::{
        config::BatchingConfig,
        message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery},
    },
    ch::{
        audit_events::{AuditEventCHRow, insert_audit_events},
        utils::chrono_to_nanoseconds,
    },
};

pub struct AuditEventHandler {
    pub clickhouse: clickhouse::Client,
    pub config: BatchingConfig,
}

fn to_ch_row(event: &AuditEvent, inserted_at: i64) -> AuditEventCHRow {
    AuditEventCHRow {
        event_id: event.event_id,
        timestamp: chrono_to_nanoseconds(event.timestamp),
        inserted_at,
        workspace_id: event.workspace_id,
        project_id: event.project_id.unwrap_or_default(),
        project_name: event.project_name.clone(),
        actor_type: event.actor_type.clone(),
        actor_id: event.actor_id,
        actor_label: event.actor_label.clone(),
        actor_owner_user_id: event.actor_owner_user_id.unwrap_or_default(),
        actor_owner_label: event.actor_owner_label.clone(),
        source: enum_str(&event.source),
        resource_type: enum_str(&event.resource_type),
        action: enum_str(&event.action),
        resource_id: event.resource_id.clone(),
        resource_label: event.resource_label.clone(),
        outcome: enum_str(&event.outcome),
        ip: event.ip.clone(),
        user_agent: event.user_agent.clone(),
        metadata: event
            .metadata
            .as_ref()
            .map(|m| m.to_string())
            .unwrap_or_default(),
    }
}

/// The `rename_all = "snake_case"` name of a unit enum variant (`ApiKey` →
/// `api_key`). The row needs it as a `String`: the clickhouse crate panics on
/// unit enum variants.
fn enum_str<T: serde::Serialize>(value: &T) -> String {
    match serde_json::to_value(value) {
        Ok(serde_json::Value::String(s)) => s,
        _ => String::new(),
    }
}

impl AuditEventHandler {
    async fn flush(
        &self,
        state: &mut Vec<MessageDelivery<AuditEvent>>,
    ) -> HandlerResult<AuditEvent> {
        let deliveries = std::mem::take(state);
        let inserted_at = chrono_to_nanoseconds(Utc::now());
        let rows: Vec<AuditEventCHRow> = deliveries
            .iter()
            .map(|d| to_ch_row(&d.message, inserted_at))
            .collect();

        match insert_audit_events(&self.clickhouse, &rows).await {
            Ok(()) => HandlerResult::ack(deliveries),
            Err(e) => {
                log::error!("Failed to insert {} audit events: {e:?}", rows.len());
                HandlerResult::requeue(deliveries)
            }
        }
    }
}

#[async_trait]
impl BatchMessageHandler for AuditEventHandler {
    type Message = AuditEvent;
    type State = Vec<MessageDelivery<AuditEvent>>;

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
        state.push(delivery);
        if state.len() >= self.config.size {
            return self.flush(state).await;
        }
        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        if state.is_empty() {
            return HandlerResult::empty();
        }
        self.flush(state).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::{AuditAction, AuditOutcome, AuditResource, AuditSource};
    use uuid::Uuid;

    #[test]
    fn ch_row_uses_serde_names_and_nil_for_missing_ids() {
        let event = AuditEvent {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            workspace_id: Uuid::new_v4(),
            project_id: None,
            project_name: String::new(),
            actor_type: "user".to_string(),
            actor_id: Uuid::new_v4(),
            actor_label: "a@b.c".to_string(),
            actor_owner_user_id: None,
            actor_owner_label: String::new(),
            source: AuditSource::Ui,
            resource_type: AuditResource::ApiKey,
            action: AuditAction::RoleUpdate,
            resource_id: String::new(),
            resource_label: String::new(),
            outcome: AuditOutcome::Denied,
            ip: String::new(),
            user_agent: String::new(),
            metadata: Some(serde_json::json!({ "fields": ["name"] })),
        };
        let row = to_ch_row(&event, 1);
        assert_eq!(row.resource_type, "api_key");
        assert_eq!(row.action, "role_update");
        assert_eq!(row.outcome, "denied");
        assert_eq!(row.source, "ui");
        assert!(row.project_id.is_nil());
        assert!(row.actor_owner_user_id.is_nil());
        assert_eq!(row.metadata, r#"{"fields":["name"]}"#);
    }
}
