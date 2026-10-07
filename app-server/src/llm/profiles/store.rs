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
    llm_feature_routes::{self, FeatureRouteRow, FeatureRouteTarget},
    llm_profiles,
};
use crate::llm::{LlmFeature, ProviderClient, ProviderError, ProviderResult};
use crate::utils::limits::get_workspace_info_for_project_id;

use super::{LlmProfile, LlmProfileRoute, build::build_client};

/// `service` removes the key on every write, so a long TTL is safe.
const LLM_PROFILE_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7;

/// `llm_feature_routes` rows are written straight to the database (no app
/// write path), so nothing invalidates these entries: the TTL is how long a
/// route change takes to reach every process, including ones on the in-memory
/// cache where no key can be deleted by hand. One TTL for every entry: a
/// scope's `default` key is rewritten whenever the scope is re-queried, so a
/// longer TTL on it would save no round trips.
const LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS: u64 = 5 * 60;

/// Cached outcome of one `(scope, feature)` row lookup. Absence is cached
/// because most lookups miss (few workspaces override anything).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
enum FeatureRouteEntry {
    Route(FeatureRouteTarget),
    Absent,
}

impl FeatureRouteEntry {
    fn into_target(self) -> Option<FeatureRouteTarget> {
        match self {
            FeatureRouteEntry::Route(target) => Some(target),
            FeatureRouteEntry::Absent => None,
        }
    }
}

/// Which `llm_feature_routes` rows a lookup reads. Each scope has its own cache
/// keys, so the global entries are shared by every workspace that falls
/// through to them.
#[derive(Debug, Clone, Copy)]
enum RouteScope {
    Workspace(Uuid),
    Global,
}

impl RouteScope {
    fn cache_key(self, feature: LlmFeature) -> String {
        match self {
            RouteScope::Workspace(id) => format!("{LLM_FEATURE_ROUTE_CACHE_KEY}:{id}:{feature}"),
            RouteScope::Global => format!("{LLM_FEATURE_ROUTE_CACHE_KEY}:global:{feature}"),
        }
    }

    fn workspace_id(self) -> Option<Uuid> {
        match self {
            RouteScope::Workspace(id) => Some(id),
            RouteScope::Global => None,
        }
    }
}

/// One scope's two candidate rows for a feature.
struct ScopeRoutes {
    own: FeatureRouteEntry,
    default: FeatureRouteEntry,
}

impl ScopeRoutes {
    fn from_rows(rows: &[FeatureRouteRow], feature: LlmFeature) -> Self {
        Self {
            own: entry_for(rows, feature),
            default: entry_for(rows, LlmFeature::Default),
        }
    }

    /// The feature's own row wins over the scope's `default` row.
    fn into_target(self) -> Option<FeatureRouteTarget> {
        self.own.into_target().or(self.default.into_target())
    }
}

fn entry_for(rows: &[FeatureRouteRow], feature: LlmFeature) -> FeatureRouteEntry {
    rows.iter()
        .find(|row| row.feature_id == feature.as_str())
        .map(|row| FeatureRouteEntry::Route(row.target.clone()))
        .unwrap_or(FeatureRouteEntry::Absent)
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
/// - Feature route rows (and misses) live as
///   `llm_feature_route_v2:{workspace_id|global}:{feature}`, one key per scope
///   and feature: the `global:*` keys are shared by every workspace and the
///   `*:default` key of a scope by every feature that falls through to it.
///   Each entry is that scope's own row (or `Absent`), never an inherited one;
///   the `_v2` prefix keeps these apart from the retired resolved-target layout.
///   Every entry expires after `LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS`.
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
        let Some(target) = self.lookup_route(workspace_id, feature).await? else {
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

    /// The workspace's answer wins over the global one. Two scopes at most, so
    /// the precedence is written out rather than looped over.
    async fn lookup_route(
        &self,
        workspace_id: Option<Uuid>,
        feature: LlmFeature,
    ) -> ProviderResult<Option<FeatureRouteTarget>> {
        if let Some(workspace_id) = workspace_id
            && let Some(target) = self
                .scope_route(RouteScope::Workspace(workspace_id), feature)
                .await?
        {
            return Ok(Some(target));
        }
        self.scope_route(RouteScope::Global, feature).await
    }

    /// The scope's row for `feature`, else its `default` row. Both entries are
    /// read from the cache; if either is missing, one query loads and caches
    /// both, so a scope costs at most one round trip per TTL.
    async fn scope_route(
        &self,
        scope: RouteScope,
        feature: LlmFeature,
    ) -> ProviderResult<Option<FeatureRouteTarget>> {
        let own = self.cached_route(scope, feature).await;
        let default = self.cached_route(scope, LlmFeature::Default).await;
        let routes = match (own, default) {
            (Some(own), Some(default)) => ScopeRoutes { own, default },
            _ => self.load_scope_routes(scope, feature).await?,
        };
        Ok(routes.into_target())
    }

    /// `None` when the key is not cached (or the cache is unreachable).
    async fn cached_route(
        &self,
        scope: RouteScope,
        feature: LlmFeature,
    ) -> Option<FeatureRouteEntry> {
        self.cache
            .get::<FeatureRouteEntry>(&scope.cache_key(feature))
            .await
            .ok()
            .flatten()
    }

    async fn load_scope_routes(
        &self,
        scope: RouteScope,
        feature: LlmFeature,
    ) -> ProviderResult<ScopeRoutes> {
        let rows = llm_feature_routes::get_scope_routes(
            &self.db.pool,
            scope.workspace_id(),
            &[feature.as_str(), LlmFeature::Default.as_str()],
        )
        .await
        .map_err(|e| {
            ProviderError::RequestError(format!(
                "failed to load LLM feature route for '{feature}': {e}"
            ))
        })?;
        let routes = ScopeRoutes::from_rows(&rows, feature);
        self.cache_route(scope, feature, &routes.own).await;
        if feature != LlmFeature::Default {
            self.cache_route(scope, LlmFeature::Default, &routes.default)
                .await;
        }
        Ok(routes)
    }

    async fn cache_route(&self, scope: RouteScope, feature: LlmFeature, entry: &FeatureRouteEntry) {
        let cache_key = scope.cache_key(feature);
        if let Err(e) = self
            .cache
            .insert_with_ttl(
                &cache_key,
                entry.clone(),
                LLM_FEATURE_ROUTE_CACHE_TTL_SECONDS,
            )
            .await
        {
            log::error!("Failed to cache LLM feature route {cache_key}: {e:?}");
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn row(feature: LlmFeature, model: &str) -> FeatureRouteRow {
        FeatureRouteRow {
            feature_id: feature.as_str().to_string(),
            target: FeatureRouteTarget {
                profile_id: Uuid::nil(),
                profile_workspace_id: Uuid::nil(),
                model: model.to_string(),
            },
        }
    }

    fn model_of(routes: ScopeRoutes) -> Option<String> {
        routes.into_target().map(|t| t.model)
    }

    #[test]
    fn own_row_wins_over_default() {
        let rows = [
            row(LlmFeature::Default, "fallback"),
            row(LlmFeature::Signals, "pinned"),
        ];
        let routes = ScopeRoutes::from_rows(&rows, LlmFeature::Signals);
        assert_eq!(model_of(routes).as_deref(), Some("pinned"));
    }

    #[test]
    fn default_row_covers_a_feature_without_its_own_row() {
        let rows = [
            row(LlmFeature::Default, "fallback"),
            row(LlmFeature::Signals, "pinned"),
        ];
        let routes = ScopeRoutes::from_rows(&rows, LlmFeature::AgentChat);
        assert!(matches!(routes.own, FeatureRouteEntry::Absent));
        assert_eq!(model_of(routes).as_deref(), Some("fallback"));
    }

    #[test]
    fn scope_without_rows_resolves_to_nothing() {
        let rows = [row(LlmFeature::Signals, "pinned")];
        let routes = ScopeRoutes::from_rows(&rows, LlmFeature::AgentChat);
        assert!(model_of(routes).is_none());
    }
}
