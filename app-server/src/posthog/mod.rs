//! Usage events for the programmatic surfaces: the `/v1` API (project API keys),
//! `/v1/cli` (CLI user tokens) and MCP tool calls. They go to the frontend's
//! PostHog project (`frontend/lib/posthog/`) and are keyed the same way: the
//! distinct id is the user's email and the `workspace` group is the workspace
//! name. A no-op unless `Feature::PostHog` is on.
//!
//! Delivery (queueing, batching, retries) is the `posthog` SDK's. Events still
//! queued when the process exits without `shutdown` are lost.

pub mod usage;

use std::sync::Arc;

use chrono::{DateTime, Utc};
use posthog::{ClientOptionsBuilder, Event};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{POSTHOG_USER_EMAIL_CACHE_KEY, POSTHOG_WORKSPACE_NAME_CACHE_KEY},
    },
    db::{self, DB, project_api_keys::ProjectApiKey},
    env,
    features::{Feature, is_feature_enabled},
    utils::limits::get_workspace_info_for_project_id,
};

const NAME_CACHE_TTL_SECONDS: u64 = 60 * 60;

/// Who made the call. API keys count for the user who created them; a key
/// with no creator is its own anonymous id, with no person profile.
#[derive(Debug, Clone, Copy)]
pub enum UsageActor {
    User(Uuid),
    ApiKey {
        key_id: Uuid,
        owner_user_id: Option<Uuid>,
    },
}

impl UsageActor {
    pub fn api_key(key: &ProjectApiKey) -> Self {
        Self::ApiKey {
            key_id: key.id,
            owner_user_id: key.user_id,
        }
    }
}

pub struct UsageEvent {
    /// `feature:action`, as the frontend's `track` names events.
    pub name: &'static str,
    pub actor: UsageActor,
    pub project_id: Option<Uuid>,
    pub properties: Map<String, Value>,
}

pub struct PostHog {
    inner: Option<Inner>,
}

struct Inner {
    client: Arc<posthog::Client>,
    db: Arc<DB>,
    cache: Arc<Cache>,
}

impl PostHog {
    pub async fn new(db: Arc<DB>, cache: Arc<Cache>) -> Self {
        if !is_feature_enabled(Feature::PostHog) {
            return Self { inner: None };
        }
        let options = ClientOptionsBuilder::default()
            .api_key(env::posthog::KEY.get())
            .host(env::posthog::HOST.get())
            // The request reaches PostHog from our servers, so its IP says nothing about the user.
            .disable_geoip(true)
            .build();
        let options = match options {
            Ok(options) => options,
            Err(e) => {
                log::error!("Invalid PostHog options; usage events are off: {e}");
                return Self { inner: None };
            }
        };
        Self {
            inner: Some(Inner {
                client: Arc::new(posthog::client(options).await),
                db,
                cache,
            }),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.inner.is_some()
    }

    /// Fire-and-forget: names are resolved off the request path.
    pub fn capture(&self, event: UsageEvent) {
        let Some(inner) = &self.inner else {
            return;
        };
        let (client, db, cache) = (inner.client.clone(), inner.db.clone(), inner.cache.clone());
        let timestamp = Utc::now();
        tokio::spawn(async move {
            client.capture(resolve(db, cache, event, timestamp).await);
        });
    }

    /// Sends what is still queued. Call once the HTTP server has stopped.
    pub async fn shutdown(&self) {
        if let Some(inner) = &self.inner {
            inner.client.shutdown().await;
        }
    }
}

async fn resolve(
    db: Arc<DB>,
    cache: Arc<Cache>,
    event: UsageEvent,
    timestamp: DateTime<Utc>,
) -> Event {
    let UsageEvent {
        name,
        actor,
        project_id,
        properties,
    } = event;

    let (user_id, fallback_id) = match actor {
        UsageActor::User(user_id) => (Some(user_id), format!("user:{user_id}")),
        UsageActor::ApiKey {
            key_id,
            owner_user_id,
        } => (owner_user_id, format!("api_key:{key_id}")),
    };
    let email = match user_id {
        Some(user_id) => user_email(&db, &cache, user_id).await,
        None => None,
    };
    let mut ph_event = match email {
        Some(email) => Event::new(name.to_string(), email),
        None => {
            let mut ph_event = Event::new(name.to_string(), fallback_id);
            let _ = ph_event.insert_option("process_person_profile", false);
            ph_event
        }
    };
    let _ = ph_event.set_timestamp(timestamp);
    for (key, value) in properties {
        let _ = ph_event.insert_prop(key, value);
    }

    if let Some(project_id) = project_id {
        let _ = ph_event.insert_prop("project_id", project_id);
        let workspace_id = get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id)
            .await
            .ok()
            .flatten()
            .map(|info| info.workspace_id);
        if let Some(workspace_id) = workspace_id {
            let _ = ph_event.insert_prop("workspace_id", workspace_id);
            if let Some(workspace) = workspace_name(&db, &cache, workspace_id).await {
                ph_event.add_group("workspace", &workspace);
            }
        }
    }
    ph_event
}

async fn user_email(db: &DB, cache: &Cache, user_id: Uuid) -> Option<String> {
    let key = format!("{POSTHOG_USER_EMAIL_CACHE_KEY}:{user_id}");
    if let Ok(Some(email)) = cache.get::<String>(&key).await {
        return Some(email);
    }
    let email = db::users::get_user_email(&db.pool, user_id)
        .await
        .ok()
        .flatten()?;
    let _ = cache
        .insert_with_ttl(&key, email.clone(), NAME_CACHE_TTL_SECONDS)
        .await;
    Some(email)
}

async fn workspace_name(db: &DB, cache: &Cache, workspace_id: Uuid) -> Option<String> {
    let key = format!("{POSTHOG_WORKSPACE_NAME_CACHE_KEY}:{workspace_id}");
    if let Ok(Some(name)) = cache.get::<String>(&key).await {
        return Some(name);
    }
    let name = db::usage_warnings::get_workspace_name(&db.pool, workspace_id)
        .await
        .ok()?;
    let _ = cache
        .insert_with_ttl(&key, name.clone(), NAME_CACHE_TTL_SECONDS)
        .await;
    Some(name)
}
