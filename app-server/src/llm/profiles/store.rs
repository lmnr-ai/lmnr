use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use uuid::Uuid;

use crate::cache::{
    Cache, CacheTrait,
    keys::{LLM_FEATURE_ROUTE_CACHE_KEY, LLM_PROFILE_CACHE_KEY},
};
use crate::db::{
    DB,
    llm_feature_routes::{self, FeatureRouteTarget},
    llm_profiles,
};
use crate::llm::{LlmFeature, ProviderClient, ProviderError, ProviderResult};
use crate::utils::limits::get_workspace_info_for_project_id;

use super::{LlmProfile, LlmProfileRoute, build::build_client};

/// `service` removes the key on every write, so a long TTL is safe.
const LLM_PROFILE_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7;

/// `llm_feature_routes` rows are written straight to the database (no app
/// write path), so nothing invalidates these entries: the TTL is how long a
/// route change takes to reach every process.
const LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS: u64 = 5 * 60;

/// Cached outcome of one `(workspace, feature)` route resolution. Absence is
/// cached because most resolutions miss (few deployments route every feature).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
enum FeatureRouteEntry {
    Route(FeatureRouteTarget),
    Absent,
}

fn route_cache_key(workspace_id: Option<Uuid>, feature: LlmFeature) -> String {
    match workspace_id {
        Some(id) => format!("{LLM_FEATURE_ROUTE_CACHE_KEY}:{id}:{feature}"),
        None => format!("{LLM_FEATURE_ROUTE_CACHE_KEY}:global:{feature}"),
    }
}

/// A feature route resolved for one call.
pub struct ResolvedFeature {
    pub client: Arc<ProviderClient>,
    pub reported_provider: &'static str,
    pub model: String,
}

/// A built client is reused until the profile row changes (`updated_at`).
#[derive(Clone)]
struct CachedClient {
    updated_at: DateTime<Utc>,
    client: Arc<ProviderClient>,
}

/// A profile resolved for one call: the client to use plus the labels spans need.
pub struct ResolvedProfile {
    pub client: Arc<ProviderClient>,
    pub reported_provider: &'static str,
}

/// Resolves `LlmProfileRoute`s and `LlmFeature`s to ready-to-use provider clients.
///
/// Caching:
/// - The project's workspace id comes from the shared `project:{id}` entry that
///   billing/limits already keep warm.
/// - Profile rows live in the shared cache as `llm_profile:{workspace_id}:{id}`;
///   `service` removes the key on every write.
/// - Resolved feature routes (and misses) live as
///   `llm_feature_route:{workspace_id|global}:{feature}`, one key per
///   `(workspace, feature)` resolution, expiring after
///   `LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS`.
/// - Lookup failures (project, route, profile) are `RequestError`, i.e.
///   retryable; only "the row does not exist / does not match" is `ConfigError`.
/// - Built `ProviderClient`s are kept in-process, keyed by profile id and reused
///   while `updated_at` is unchanged, so secrets are decrypted once per edit.
///   The map holds one entry per profile this process has run; never evicted.
pub struct LlmProfileStore {
    db: Arc<DB>,
    cache: Arc<Cache>,
    clients: DashMap<Uuid, CachedClient>,
}

impl LlmProfileStore {
    pub fn new(db: Arc<DB>, cache: Arc<Cache>) -> Self {
        Self {
            db,
            cache,
            clients: DashMap::new(),
        }
    }

    /// Loads the profile within the route's project workspace, checks it lists
    /// `route.model`, then returns a (cached) client for it.
    pub async fn resolve(&self, route: &LlmProfileRoute) -> ProviderResult<ResolvedProfile> {
        let profile = self
            .load_profile(route.project_id, route.profile_id)
            .await?;
        if !profile.models.iter().any(|m| m == &route.model) {
            return Err(ProviderError::ConfigError(format!(
                "model '{}' is not part of LLM profile '{}'",
                route.model, profile.name
            )));
        }

        let client = self.client_for(&profile)?;
        Ok(ResolvedProfile {
            client,
            reported_provider: profile.provider.reported_name(),
        })
    }

    /// Resolves `feature` through `llm_feature_routes`: the project's workspace
    /// rows first (the feature, then `default`), then the global rows in the same
    /// order. `Ok(None)` means no row applies and the caller falls back to env.
    ///
    /// Lookup failures are `RequestError` (retryable): a Postgres/Redis blip
    /// must not silently reroute a workspace's traffic to the env provider.
    pub async fn resolve_feature(
        &self,
        feature: LlmFeature,
        project_id: Option<Uuid>,
    ) -> ProviderResult<Option<ResolvedFeature>> {
        let workspace_id = match project_id {
            Some(project_id) => Some(self.project_workspace_id(project_id).await?),
            None => None,
        };
        let Some(target) = self.get_route_cached(workspace_id, feature).await? else {
            return Ok(None);
        };

        let profile = self
            .get_profile_cached(target.profile_workspace_id, target.profile_id)
            .await
            .map_err(|e| {
                ProviderError::RequestError(format!(
                    "failed to load LLM profile {} for feature '{feature}': {e}",
                    target.profile_id
                ))
            })?
            .ok_or_else(|| {
                ProviderError::ConfigError(format!(
                    "LLM feature route for '{feature}' points at profile {} which no longer exists",
                    target.profile_id
                ))
            })?;
        if !profile.models.iter().any(|m| m == &target.model) {
            return Err(ProviderError::ConfigError(format!(
                "LLM feature route for '{feature}' pins model '{}', which is not part of profile '{}'",
                target.model, profile.name
            )));
        }

        let client = self.client_for(&profile)?;
        Ok(Some(ResolvedFeature {
            client,
            reported_provider: profile.provider.reported_name(),
            model: target.model,
        }))
    }

    /// Read-through on the `(workspace, feature)` route key; both hits and misses
    /// are cached. A miss costs one query: the database ranks the workspace and
    /// global rows for `feature` and `default` and returns the winner.
    async fn get_route_cached(
        &self,
        workspace_id: Option<Uuid>,
        feature: LlmFeature,
    ) -> ProviderResult<Option<FeatureRouteTarget>> {
        let cache_key = route_cache_key(workspace_id, feature);
        if let Ok(Some(entry)) = self.cache.get::<FeatureRouteEntry>(&cache_key).await {
            return Ok(match entry {
                FeatureRouteEntry::Route(target) => Some(target),
                FeatureRouteEntry::Absent => None,
            });
        }

        let target = llm_feature_routes::resolve_route(
            &self.db.pool,
            workspace_id,
            feature.as_str(),
            LlmFeature::Default.as_str(),
        )
        .await
        .map_err(|e| {
            ProviderError::RequestError(format!(
                "failed to load LLM feature route for '{feature}': {e}"
            ))
        })?;
        let entry = match &target {
            Some(target) => FeatureRouteEntry::Route(target.clone()),
            None => FeatureRouteEntry::Absent,
        };
        if let Err(e) = self
            .cache
            .insert_with_ttl(&cache_key, entry, LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS)
            .await
        {
            log::error!("Failed to cache LLM feature route {cache_key}: {e:?}");
        }
        Ok(target)
    }

    /// The cached profile row (secrets still encrypted), without building a client.
    /// Scoped to the project's workspace: a profile from another workspace is absent.
    pub async fn load_profile(
        &self,
        project_id: Uuid,
        profile_id: Uuid,
    ) -> ProviderResult<LlmProfile> {
        let workspace_id = self.project_workspace_id(project_id).await?;
        self.get_profile_cached(workspace_id, profile_id)
            .await
            .map_err(|e| {
                ProviderError::RequestError(format!("failed to load LLM profile {profile_id}: {e}"))
            })?
            .ok_or_else(|| {
                ProviderError::ConfigError(format!(
                    "LLM profile {profile_id} is not in this workspace or no longer exists; pick another profile for this signal"
                ))
            })
    }

    /// Read-through on `llm_profile:{workspace_id}:{profile_id}`; misses are not cached.
    async fn get_profile_cached(
        &self,
        workspace_id: Uuid,
        profile_id: Uuid,
    ) -> anyhow::Result<Option<LlmProfile>> {
        let cache_key = format!("{LLM_PROFILE_CACHE_KEY}:{workspace_id}:{profile_id}");

        if let Ok(Some(profile)) = self.cache.get::<LlmProfile>(&cache_key).await {
            return Ok(Some(profile));
        }

        let profile =
            llm_profiles::get_llm_profile(&self.db.pool, workspace_id, profile_id).await?;
        if let Some(profile) = &profile
            && let Err(e) = self
                .cache
                .insert_with_ttl(&cache_key, profile.clone(), LLM_PROFILE_CACHE_TTL_SECONDS)
                .await
        {
            log::error!("Failed to cache LLM profile {profile_id}: {e:?}");
        }
        Ok(profile)
    }

    fn client_for(&self, profile: &LlmProfile) -> ProviderResult<Arc<ProviderClient>> {
        // The read guard is released at the end of this statement, before the insert below.
        if let Some(client) = self
            .clients
            .get(&profile.id)
            .filter(|cached| cached.updated_at == profile.updated_at)
            .map(|cached| cached.client.clone())
        {
            return Ok(client);
        }
        let client = Arc::new(build_client(profile)?);
        self.clients.insert(
            profile.id,
            CachedClient {
                updated_at: profile.updated_at,
                client: client.clone(),
            },
        );
        Ok(client)
    }

    async fn project_workspace_id(&self, project_id: Uuid) -> ProviderResult<Uuid> {
        get_workspace_info_for_project_id(self.db.clone(), self.cache.clone(), project_id)
            .await
            .map_err(|e| {
                ProviderError::RequestError(format!("failed to load project {project_id}: {e}"))
            })?
            .map(|info| info.workspace_id)
            .ok_or_else(|| ProviderError::ConfigError(format!("project {project_id} not found")))
    }
}
