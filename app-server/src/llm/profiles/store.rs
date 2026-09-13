use std::sync::Arc;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::LLM_PROFILE_CACHE_KEY};
use crate::db::{DB, llm_profiles};
use crate::llm::{ProviderClient, ProviderError, ProviderResult};
use crate::utils::limits::get_workspace_info_for_project_id;

use super::{LlmProfile, LlmProfileRoute, build::build_client};

/// `service` removes the key on every write, so a long TTL is safe.
const LLM_PROFILE_CACHE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7;

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

/// Resolves `LlmProfileRoute`s to ready-to-use provider clients.
///
/// Caching:
/// - The project's workspace id comes from the shared `project:{id}` entry that
///   billing/limits already keep warm.
/// - Profile rows live in the shared cache as `llm_profile:{workspace_id}:{id}`;
///   `service` removes the key on every write.
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
                ProviderError::ConfigError(format!("failed to load LLM profile {profile_id}: {e}"))
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
                ProviderError::ConfigError(format!("failed to load project {project_id}: {e}"))
            })?
            .map(|info| info.workspace_id)
            .ok_or_else(|| ProviderError::ConfigError(format!("project {project_id} not found")))
    }
}
