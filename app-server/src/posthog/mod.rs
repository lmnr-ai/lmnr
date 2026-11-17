//! Usage events for the programmatic surfaces: the `/v1` API (project API keys),
//! `/v1/cli` (CLI user tokens) and MCP tool calls. They go to the frontend's
//! PostHog project (`frontend/lib/posthog/`) and are keyed the same way: the
//! distinct id is the user's email and the `workspace` group is the workspace
//! name. A no-op unless `Feature::PostHog` is on.
//!
//! Events are batched in memory and posted to `/batch/`. Analytics is
//! best-effort: a full buffer, a failed post or a pod shutdown drops events.

pub mod usage;

use std::{sync::Arc, time::Duration};

use chrono::Utc;
use serde_json::{Map, Value, json};
use tokio::sync::mpsc;
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

const BATCH_SIZE: usize = 100;
const FLUSH_INTERVAL: Duration = Duration::from_secs(5);
const POST_TIMEOUT: Duration = Duration::from_secs(10);
/// Events waiting for a flush; more are dropped while PostHog is slow.
const BUFFER_SIZE: usize = 10_000;
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
    tx: mpsc::Sender<Value>,
    db: Arc<DB>,
    cache: Arc<Cache>,
}

impl PostHog {
    /// Spawns the flush loop, so call it inside the runtime that should run it.
    pub fn new(http_client: reqwest::Client, db: Arc<DB>, cache: Arc<Cache>) -> Self {
        if !is_feature_enabled(Feature::PostHog) {
            return Self { inner: None };
        }
        let (tx, rx) = mpsc::channel(BUFFER_SIZE);
        let url = format!("{}/batch/", env::posthog::HOST.get().trim_end_matches('/'));
        tokio::spawn(flush_loop(rx, http_client, url, env::posthog::KEY.get()));
        Self {
            inner: Some(Inner { tx, db, cache }),
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
        let (tx, db, cache) = (inner.tx.clone(), inner.db.clone(), inner.cache.clone());
        let timestamp = Utc::now().to_rfc3339();
        tokio::spawn(async move {
            let payload = resolve(db, cache, event, timestamp).await;
            if tx.try_send(payload).is_err() {
                log::debug!("PostHog buffer full; dropping a usage event");
            }
        });
    }
}

async fn resolve(db: Arc<DB>, cache: Arc<Cache>, event: UsageEvent, timestamp: String) -> Value {
    let UsageEvent {
        name,
        actor,
        project_id,
        mut properties,
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
    let distinct_id = email.unwrap_or_else(|| {
        properties.insert("$process_person_profile".to_string(), json!(false));
        fallback_id
    });

    if let Some(project_id) = project_id {
        properties.insert("project_id".to_string(), json!(project_id));
        let workspace_id = get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id)
            .await
            .ok()
            .flatten()
            .map(|info| info.workspace_id);
        if let Some(workspace_id) = workspace_id {
            properties.insert("workspace_id".to_string(), json!(workspace_id));
            if let Some(workspace) = workspace_name(&db, &cache, workspace_id).await {
                properties.insert("$groups".to_string(), json!({ "workspace": workspace }));
            }
        }
    }
    properties.insert("$lib".to_string(), json!("laminar-app-server"));
    // The request reaches PostHog from our servers, so its IP says nothing about the user.
    properties.insert("$geoip_disable".to_string(), json!(true));

    json!({
        "event": name,
        "distinct_id": distinct_id,
        "timestamp": timestamp,
        "properties": properties,
    })
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

async fn flush_loop(
    mut rx: mpsc::Receiver<Value>,
    http_client: reqwest::Client,
    url: String,
    api_key: String,
) {
    let mut batch = Vec::with_capacity(BATCH_SIZE);
    let mut tick = tokio::time::interval(FLUSH_INTERVAL);
    loop {
        tokio::select! {
            event = rx.recv() => match event {
                Some(event) => {
                    batch.push(event);
                    if batch.len() >= BATCH_SIZE {
                        send(&http_client, &url, &api_key, &mut batch).await;
                    }
                }
                None => {
                    send(&http_client, &url, &api_key, &mut batch).await;
                    return;
                }
            },
            _ = tick.tick() => send(&http_client, &url, &api_key, &mut batch).await,
        }
    }
}

async fn send(http_client: &reqwest::Client, url: &str, api_key: &str, batch: &mut Vec<Value>) {
    if batch.is_empty() {
        return;
    }
    let body = json!({ "api_key": api_key, "batch": std::mem::take(batch) });
    let result = http_client
        .post(url)
        .timeout(POST_TIMEOUT)
        .json(&body)
        .send()
        .await
        .and_then(|res| res.error_for_status());
    if let Err(e) = result {
        log::warn!("Failed to send usage events to PostHog: {e}");
    }
}
