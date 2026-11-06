//! Workspace audit log (LAM-2460). Every event is enriched here, published to
//! the audit queue, and written to ClickHouse `audit_events` by
//! [`consumer::AuditEventHandler`]. app-server is the only writer: the
//! frontend posts its events to [`routes::create_audit_event`].
//!
//! Event names (`AuditResource`, `AuditAction`) are a stable vocabulary shared
//! with the frontend (`frontend/lib/audit/events.ts`, kept in sync by
//! `frontend/tests/audit-events.test.ts`). Rows are immutable, so never rename
//! a variant; add a new one.

pub mod consumer;
pub mod routes;

use std::sync::Arc;

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, DB, project_api_keys::ProjectApiKey},
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, MessageQueueTrait},
    utils::limits::get_workspace_info_for_project_id,
};

pub const AUDIT_QUEUE: &str = "audit_events_queue";
pub const AUDIT_EXCHANGE: &str = "audit_events_exchange";
pub const AUDIT_ROUTING_KEY: &str = "audit_events_routing_key";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditResource {
    Workspace,
    Member,
    Invitation,
    ApiKey,
    Project,
    Dataset,
    Datapoint,
    Evaluation,
    Signal,
    Alert,
    Dashboard,
    Chart,
    Trace,
    Sql,
    SqlTemplate,
    LlmProfile,
    SlackIntegration,
    Deployment,
    License,
    Subscription,
    Report,
    LabelingQueue,
    Playground,
    RenderTemplate,
    CustomModelCost,
    TagClass,
    View,
    DebuggerSession,
    AuditLog,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    Create,
    Update,
    Delete,
    View,
    List,
    Export,
    Query,
    Run,
    Backfill,
    Invite,
    Join,
    Remove,
    RoleUpdate,
    TransferOwnership,
    Share,
    Unshare,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditSource {
    Ui,
    Api,
    Cli,
    Mcp,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditOutcome {
    Success,
    Denied,
    Error,
}

impl AuditOutcome {
    pub fn from_status(status: u16) -> Self {
        match status {
            200..=399 => Self::Success,
            401 | 403 => Self::Denied,
            _ => Self::Error,
        }
    }
}

/// Who acted. API keys carry their label and creator from the auth extractor,
/// so they need no lookup beyond the creator's email.
/// Only `User` deserializes: the internal route must not let a caller claim
/// to be an API key.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuditActor {
    User {
        #[serde(rename = "userId")]
        user_id: Uuid,
    },
    #[serde(skip_deserializing)]
    ApiKey {
        key_id: Uuid,
        label: String,
        owner_user_id: Option<Uuid>,
    },
}

impl AuditActor {
    pub fn api_key(key: &ProjectApiKey) -> Self {
        let label = match &key.name {
            Some(name) if !name.is_empty() => format!("{name} ({})", key.shorthand),
            _ => key.shorthand.clone(),
        };
        Self::ApiKey {
            key_id: key.id,
            label,
            owner_user_id: key.user_id,
        }
    }
}

/// An event as the caller knows it: ids only. [`emit`] resolves the workspace,
/// project name and actor labels at write time, so they survive later renames
/// and deletions.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventInput {
    pub actor: AuditActor,
    pub source: AuditSource,
    /// Required when the event has no project, or the project may already be
    /// gone (project deletion).
    #[serde(default)]
    pub workspace_id: Option<Uuid>,
    #[serde(default)]
    pub project_id: Option<Uuid>,
    #[serde(default)]
    pub project_name: Option<String>,
    pub resource_type: AuditResource,
    pub action: AuditAction,
    #[serde(default)]
    pub resource_id: Option<String>,
    #[serde(default)]
    pub resource_label: Option<String>,
    pub outcome: AuditOutcome,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub user_agent: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

impl AuditEventInput {
    pub fn new(
        actor: AuditActor,
        source: AuditSource,
        resource_type: AuditResource,
        action: AuditAction,
        outcome: AuditOutcome,
    ) -> Self {
        Self {
            actor,
            source,
            workspace_id: None,
            project_id: None,
            project_name: None,
            resource_type,
            action,
            resource_id: None,
            resource_label: None,
            outcome,
            ip: None,
            user_agent: None,
            metadata: None,
        }
    }
}

/// The enriched event, as published to the audit queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub event_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub workspace_id: Uuid,
    pub project_id: Option<Uuid>,
    pub project_name: String,
    pub actor_type: String,
    pub actor_id: Uuid,
    pub actor_label: String,
    /// The user's workspace role when the event was recorded; empty for API keys.
    pub actor_role: String,
    pub actor_owner_user_id: Option<Uuid>,
    pub actor_owner_label: String,
    pub source: AuditSource,
    pub resource_type: AuditResource,
    pub action: AuditAction,
    pub resource_id: String,
    pub resource_label: String,
    pub outcome: AuditOutcome,
    pub ip: String,
    pub user_agent: String,
    pub metadata: Option<Value>,
}

struct ResolvedScope {
    workspace_id: Uuid,
    project_name: String,
}

/// Resolve, enrich and publish one event. Returns once the broker confirmed
/// the publish, so callers that await it know the event is durable. A no-op
/// when `Feature::AuditLog` is off.
pub async fn emit(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: &MessageQueue,
    input: AuditEventInput,
) -> anyhow::Result<()> {
    if !is_feature_enabled(Feature::AuditLog) {
        return Ok(());
    }
    // Names the event in the error, so a lost one can be traced. Metadata is left out: it can
    // hold query text.
    let event_desc = format!(
        "audit event {:?} {:?}.{:?} by {:?} (project {:?}, workspace {:?}, resource {:?})",
        input.source,
        input.resource_type,
        input.action,
        input.actor,
        input.project_id,
        input.workspace_id,
        input.resource_id,
    );
    let event = enrich(db, cache, input)
        .await
        .with_context(|| event_desc.clone())?;
    let payload = serde_json::to_vec(&event)?;
    queue
        .publish(&payload, AUDIT_EXCHANGE, AUDIT_ROUTING_KEY, None)
        .await
        .with_context(|| event_desc)
}

/// Fire-and-forget [`emit`] for read events, which must not delay the response.
pub fn emit_detached(
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    input: AuditEventInput,
) {
    tokio::spawn(async move {
        if let Err(e) = emit(db, cache, &queue, input).await {
            log::error!("Failed to emit audit event: {e:?}");
        }
    });
}

async fn enrich(
    db: Arc<DB>,
    cache: Arc<Cache>,
    input: AuditEventInput,
) -> anyhow::Result<AuditEvent> {
    let scope = resolve_scope(db.clone(), cache, &input).await?;

    let (actor_type, actor_id, actor_label, actor_owner_user_id) = match &input.actor {
        AuditActor::User { user_id } => (
            "user",
            *user_id,
            db::users::get_user_email(&db.pool, *user_id)
                .await?
                .unwrap_or_default(),
            None,
        ),
        AuditActor::ApiKey {
            key_id,
            label,
            owner_user_id,
        } => ("api_key", *key_id, label.clone(), *owner_user_id),
    };
    // Read at write time: the role the actor held when acting, not their current one.
    let actor_role = match &input.actor {
        AuditActor::User { user_id } => {
            db::workspaces::get_member_role(&db.pool, scope.workspace_id, *user_id)
                .await?
                .unwrap_or_default()
        }
        AuditActor::ApiKey { .. } => String::new(),
    };
    let actor_owner_label = match actor_owner_user_id {
        Some(owner) => db::users::get_user_email(&db.pool, owner)
            .await?
            .unwrap_or_default(),
        None => String::new(),
    };

    Ok(AuditEvent {
        event_id: Uuid::new_v4(),
        timestamp: Utc::now(),
        workspace_id: scope.workspace_id,
        project_id: input.project_id,
        project_name: scope.project_name,
        actor_type: actor_type.to_string(),
        actor_id,
        actor_label,
        actor_role,
        actor_owner_user_id,
        actor_owner_label,
        source: input.source,
        resource_type: input.resource_type,
        action: input.action,
        resource_id: input.resource_id.unwrap_or_default(),
        resource_label: input.resource_label.unwrap_or_default(),
        outcome: input.outcome,
        ip: input.ip.unwrap_or_default(),
        user_agent: input.user_agent.unwrap_or_default(),
        metadata: input.metadata,
    })
}

async fn resolve_scope(
    db: Arc<DB>,
    cache: Arc<Cache>,
    input: &AuditEventInput,
) -> anyhow::Result<ResolvedScope> {
    let project = match input.project_id {
        Some(project_id) => get_workspace_info_for_project_id(db, cache, project_id).await?,
        None => None,
    };
    let workspace_id = input
        .workspace_id
        .or(project.as_ref().map(|p| p.workspace_id))
        .ok_or_else(|| anyhow::anyhow!("audit event has no resolvable workspace"))?;
    let project_name = input
        .project_name
        .clone()
        .or(project.map(|p| p.name))
        .unwrap_or_default();
    Ok(ResolvedScope {
        workspace_id,
        project_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_from_status() {
        assert_eq!(AuditOutcome::from_status(200), AuditOutcome::Success);
        assert_eq!(AuditOutcome::from_status(302), AuditOutcome::Success);
        assert_eq!(AuditOutcome::from_status(401), AuditOutcome::Denied);
        assert_eq!(AuditOutcome::from_status(403), AuditOutcome::Denied);
        assert_eq!(AuditOutcome::from_status(404), AuditOutcome::Error);
        assert_eq!(AuditOutcome::from_status(500), AuditOutcome::Error);
    }

    #[test]
    fn input_accepts_user_actor_and_rejects_api_key() {
        let user_id = Uuid::new_v4();
        let input: AuditEventInput = serde_json::from_value(serde_json::json!({
            "actor": { "type": "user", "userId": user_id },
            "source": "ui",
            "resourceType": "api_key",
            "action": "create",
            "outcome": "success",
        }))
        .unwrap();
        assert_eq!(input.actor, AuditActor::User { user_id });
        assert_eq!(input.resource_type, AuditResource::ApiKey);

        let spoofed = serde_json::from_value::<AuditEventInput>(serde_json::json!({
            "actor": { "type": "apiKey", "key_id": Uuid::new_v4(), "label": "x" },
            "source": "ui",
            "resourceType": "api_key",
            "action": "create",
            "outcome": "success",
        }));
        assert!(spoofed.is_err());
    }

    #[test]
    fn input_rejects_unknown_event_names() {
        let input = serde_json::from_value::<AuditEventInput>(serde_json::json!({
            "actor": { "type": "user", "userId": Uuid::new_v4() },
            "source": "ui",
            "resourceType": "datasett",
            "action": "create",
            "outcome": "success",
        }));
        assert!(input.is_err());
    }
}
