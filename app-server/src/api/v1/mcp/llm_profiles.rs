//! Workspace LLM profile tools: the MCP twins of `lmnr-cli llm-profile`. Same service calls as
//! `api::v1::llm_profiles::handlers`, which both the API-key and CLI routes use.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::{
    Audit, AuditTarget, LaminarMcpServer, ProjectParam, ProjectScope, ToolError, ToolOutput,
};
use crate::{
    audit::{AuditAction, AuditResource},
    llm::profiles::{
        LlmProfileProvider, ProfileAuth, ProfileConfig, ProfileSecrets,
        service::{
            self, CreateLlmProfileInput, CrudError, LlmProfileResponse, UpdateLlmProfileInput,
        },
    },
};

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListLlmProfilesParams {
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LlmProfileIdParams {
    pub profile_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateLlmProfileParams {
    #[serde(flatten)]
    pub profile: CreateLlmProfileInput,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// Omitted or `null` fields keep their stored value, nested `config` fields included.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLlmProfileParams {
    pub profile_id: Uuid,
    #[serde(default)]
    pub name: Option<String>,
    /// Changing it requires `config`, which then starts empty instead of from the stored one.
    #[serde(default)]
    pub provider: Option<LlmProfileProvider>,
    #[serde(default)]
    pub config: Option<ProfileConfigPatch>,
    /// Absent keys, or the masks `get_llm_profile` returns, keep the stored secret.
    #[serde(default, deserialize_with = "echoed_secrets")]
    pub secrets: ProfileSecrets,
    /// Replaces the whole list.
    #[serde(default)]
    pub models: Option<Vec<String>>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// `get_llm_profile` lists header names (`["X-Tenant"]`) where updates take a name → value map;
/// an agent echoing a fetched profile sends the list, which keeps the stored header values.
fn echoed_secrets<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<ProfileSecrets, D::Error> {
    let Some(mut value) = Option::<serde_json::Value>::deserialize(deserializer)? else {
        return Ok(ProfileSecrets::default());
    };
    if let Some(secrets) = value.as_object_mut()
        && secrets
            .get("headers")
            .is_some_and(serde_json::Value::is_array)
    {
        secrets.remove("headers");
    }
    serde_json::from_value(value).map_err(serde::de::Error::custom)
}

/// The `config` fields to change. The service replaces `config` whole, so a field a
/// schema-driven client sends as `null` would otherwise reset it (and `headerNames` would drop
/// the stored header secrets with it).
#[derive(Debug, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfileConfigPatch {
    #[serde(default)]
    pub auth: Option<ProfileAuth>,
    /// `""` clears it; likewise `resourceId`, `baseUrl` and `apiVersion`.
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub resource_id: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_version: Option<String>,
    /// Custom header names, with their values in `secrets.headers`. `[]` removes every header
    /// and its stored value.
    #[serde(default)]
    pub header_names: Option<Vec<String>>,
}

impl ProfileConfigPatch {
    fn apply(self, config: ProfileConfig) -> ProfileConfig {
        ProfileConfig {
            auth: self.auth.unwrap_or(config.auth),
            region: self.region.or(config.region),
            resource_id: self.resource_id.or(config.resource_id),
            base_url: self.base_url.or(config.base_url),
            api_version: self.api_version.or(config.api_version),
            header_names: self.header_names.unwrap_or(config.header_names),
        }
    }
}

impl UpdateLlmProfileParams {
    /// The service input, with `config` laid over the stored one unless the provider changes.
    fn into_update(
        self,
        stored_provider: LlmProfileProvider,
        stored_config: ProfileConfig,
    ) -> UpdateLlmProfileInput {
        // Agents echo `provider` from `get_llm_profile`; the service reads any provider as a
        // change and would then demand `config`.
        let provider = self.provider.filter(|p| *p != stored_provider);
        let base = if provider.is_some() {
            ProfileConfig::default()
        } else {
            stored_config
        };
        UpdateLlmProfileInput {
            name: self.name,
            provider,
            config: self.config.map(|patch| patch.apply(base)),
            secrets: self.secrets,
            models: self.models,
        }
    }
}

impl From<CrudError> for ToolError {
    fn from(error: CrudError) -> Self {
        match error {
            CrudError::Internal(e) => Self::Internal(e),
            e => Self::message(e.to_string()),
        }
    }
}

fn profile_output(profile: LlmProfileResponse) -> ToolOutput {
    let target = AuditTarget::named(profile.id, &profile.name);
    ToolOutput::json(&profile).target(target)
}

impl LaminarMcpServer {
    async fn workspace_id(&self, scope: &ProjectScope) -> Result<Uuid, CrudError> {
        service::workspace_for_project(&self.db.pool, scope.project_id).await
    }
}

#[tool_router(router = llm_profile_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// List the workspace's LLM profiles (provider credentials + models that signals and the
    /// playground run on). Secrets come back masked.
    #[tool(
        name = "list_llm_profiles",
        title = "List LLM profiles",
        annotations(
            title = "List LLM profiles",
            read_only_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_llm_profiles(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<ListLlmProfilesParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "list_llm_profiles",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let workspace_id = self.workspace_id(&scope).await?;
                let profiles = service::list_llm_profiles(&self.db.pool, workspace_id).await?;
                Ok(ToolOutput::json(&json!({ "llmProfiles": profiles })))
            },
        )
        .await
    }

    /// Get one LLM profile. Secrets come back masked.
    #[tool(
        name = "get_llm_profile",
        title = "Get LLM profile",
        annotations(
            title = "Get LLM profile",
            read_only_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<LlmProfileIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "get_llm_profile",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let workspace_id = self.workspace_id(&scope).await?;
                let profile =
                    service::get_llm_profile(&self.db.pool, workspace_id, params.profile_id)
                        .await?;
                Ok(ToolOutput::json(&profile))
            },
        )
        .await
    }

    /// Create a workspace LLM profile. Secrets you pass are stored encrypted and never returned.
    #[tool(
        name = "create_llm_profile",
        title = "Create LLM profile",
        annotations(
            title = "Create LLM profile",
            read_only_hint = false,
            destructive_hint = false,
            open_world_hint = false
        )
    )]
    async fn create_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<CreateLlmProfileParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "create_llm_profile",
            &context,
            params.project.project_id,
            Some(Audit::new(AuditResource::LlmProfile, AuditAction::Create)),
            |scope: ProjectScope| async move {
                let workspace_id = self.workspace_id(&scope).await?;
                let profile =
                    service::create_llm_profile(&self.db.pool, workspace_id, params.profile)
                        .await?;
                Ok(profile_output(profile))
            },
        )
        .await
    }

    /// Update an LLM profile; only the fields you pass change.
    #[tool(
        name = "update_llm_profile",
        title = "Update LLM profile",
        annotations(
            title = "Update LLM profile",
            read_only_hint = false,
            destructive_hint = true,
            open_world_hint = false
        )
    )]
    async fn update_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<UpdateLlmProfileParams>,
    ) -> Result<CallToolResponse, McpError> {
        let audit = Audit::new(AuditResource::LlmProfile, AuditAction::Update)
            .target(AuditTarget::id(params.profile_id));
        self.run(
            "update_llm_profile",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                let workspace_id = self.workspace_id(&scope).await?;
                let profile_id = params.profile_id;
                let stored =
                    service::get_llm_profile(&self.db.pool, workspace_id, profile_id).await?;
                let update = params.into_update(stored.provider, stored.config);
                let profile = service::update_llm_profile(
                    &self.db.pool,
                    &self.cache,
                    workspace_id,
                    profile_id,
                    update,
                )
                .await?;
                Ok(profile_output(profile))
            },
        )
        .await
    }

    /// Delete an LLM profile. Refused while a signal or feature route uses it.
    #[tool(
        name = "delete_llm_profile",
        title = "Delete LLM profile",
        annotations(
            title = "Delete LLM profile",
            read_only_hint = false,
            destructive_hint = true,
            open_world_hint = false
        )
    )]
    async fn delete_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<LlmProfileIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let audit = Audit::new(AuditResource::LlmProfile, AuditAction::Delete)
            .target(AuditTarget::id(params.profile_id));
        self.run(
            "delete_llm_profile",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                let workspace_id = self.workspace_id(&scope).await?;
                let profile = service::delete_llm_profile(
                    &self.db.pool,
                    &self.cache,
                    workspace_id,
                    params.profile_id,
                )
                .await?;
                Ok(profile_output(profile))
            },
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gateway() -> ProfileConfig {
        ProfileConfig {
            base_url: Some("https://gw.example.com/v1".to_string()),
            header_names: vec!["X-Tenant".to_string()],
            ..ProfileConfig::default()
        }
    }

    fn update(
        args: serde_json::Value,
        stored_provider: LlmProfileProvider,
    ) -> UpdateLlmProfileInput {
        let mut body = json!({ "profileId": Uuid::new_v4() });
        body.as_object_mut()
            .unwrap()
            .extend(args.as_object().unwrap().clone());
        serde_json::from_value::<UpdateLlmProfileParams>(body)
            .unwrap()
            .into_update(stored_provider, gateway())
    }

    #[test]
    fn null_config_fields_keep_the_stored_ones() {
        let config = update(
            json!({ "config": {
                "baseUrl": "https://other.example.com/v1",
                "headerNames": null,
                "auth": null,
                "region": null,
            } }),
            LlmProfileProvider::Custom,
        )
        .config
        .unwrap();
        assert_eq!(
            config.base_url.as_deref(),
            Some("https://other.example.com/v1")
        );
        assert_eq!(config.header_names, vec!["X-Tenant".to_string()]);
    }

    #[test]
    fn config_fields_clear_only_on_request() {
        let config = update(
            json!({ "config": { "headerNames": [], "baseUrl": "" } }),
            LlmProfileProvider::Custom,
        )
        .config
        .unwrap();
        assert!(config.header_names.is_empty());
        assert_eq!(config.base_url.as_deref(), Some(""));
        assert!(
            update(json!({ "config": null }), LlmProfileProvider::Custom)
                .config
                .is_none()
        );
    }

    #[test]
    fn a_new_provider_starts_from_an_empty_config() {
        let config = update(
            json!({ "provider": "anthropic", "config": { "headerNames": null } }),
            LlmProfileProvider::Custom,
        )
        .config
        .unwrap();
        assert!(config.header_names.is_empty());
        assert!(config.base_url.is_none());
    }

    #[test]
    fn an_echoed_provider_is_not_a_change() {
        let input = update(
            json!({ "provider": "custom", "name": "renamed" }),
            LlmProfileProvider::Custom,
        );
        assert!(input.provider.is_none());
        assert!(input.config.is_none());
        let config = update(
            json!({ "provider": "custom", "config": { "region": "eu" } }),
            LlmProfileProvider::Custom,
        )
        .config
        .unwrap();
        assert_eq!(config.header_names, vec!["X-Tenant".to_string()]);
    }

    #[test]
    fn an_echoed_profile_keeps_the_stored_secrets() {
        let input = update(
            json!({ "secrets": { "apiKey": "sk-***xyz", "headers": ["X-Tenant"] } }),
            LlmProfileProvider::Custom,
        );
        assert_eq!(input.secrets.api_key.as_deref(), Some("sk-***xyz"));
        assert!(input.secrets.headers.is_empty());
        let input = update(
            json!({ "secrets": { "headers": { "X-Tenant": "t2" } } }),
            LlmProfileProvider::Custom,
        );
        assert_eq!(input.secrets.headers["X-Tenant"], "t2");
    }
}
