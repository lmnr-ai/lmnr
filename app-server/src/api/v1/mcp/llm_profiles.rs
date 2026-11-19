//! Workspace LLM profile tools: the MCP twins of `lmnr-cli llm-profile`. Same service calls as
//! `api::v1::llm_profiles::handlers`, which both the API-key and CLI routes use.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{
    AuditTarget, LaminarMcpServer, ProjectParam, ProjectScope, internal_error, tool_error,
    tool_json,
};
use crate::{
    audit::{AuditAction, AuditResource},
    llm::profiles::service::{
        self, CreateLlmProfileInput, CrudError, LlmProfileResponse, UpdateLlmProfileInput,
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

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLlmProfileParams {
    pub profile_id: Uuid,
    /// Omitted fields keep their stored value; absent `secrets` keys, or the masks
    /// `get_llm_profile` returns, keep the stored secret; `models` replaces the whole list.
    #[serde(flatten)]
    pub update: UpdateLlmProfileInput,
    #[serde(flatten)]
    pub project: ProjectParam,
}

fn profile_error(tool: &str, error: CrudError) -> CallToolResponse {
    match error {
        CrudError::Internal(e) => internal_error(tool, e),
        e => tool_error(e.to_string()),
    }
}

fn profile_target(result: &Result<LlmProfileResponse, CrudError>, id: Option<Uuid>) -> AuditTarget {
    match (result, id) {
        (Ok(profile), _) => AuditTarget::named(profile.id, &profile.name),
        (Err(_), Some(id)) => AuditTarget::id(id),
        (Err(_), None) => AuditTarget::default(),
    }
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
    #[tool(name = "list_llm_profiles")]
    async fn list_llm_profiles(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<ListLlmProfilesParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = match self.workspace_id(&scope).await {
            Ok(workspace_id) => service::list_llm_profiles(&self.db.pool, workspace_id).await,
            Err(e) => Err(e),
        };
        Ok(match result {
            Ok(profiles) => tool_json(&json!({ "llmProfiles": profiles })),
            Err(e) => profile_error("list_llm_profiles", e),
        })
    }

    /// Get one LLM profile. Secrets come back masked.
    #[tool(name = "get_llm_profile")]
    async fn get_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<LlmProfileIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = match self.workspace_id(&scope).await {
            Ok(workspace_id) => {
                service::get_llm_profile(&self.db.pool, workspace_id, params.profile_id).await
            }
            Err(e) => Err(e),
        };
        Ok(match result {
            Ok(profile) => tool_json(&profile),
            Err(e) => profile_error("get_llm_profile", e),
        })
    }

    /// Create a workspace LLM profile. Secrets you pass are stored encrypted and never returned.
    #[tool(name = "create_llm_profile")]
    async fn create_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<CreateLlmProfileParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = match self.workspace_id(&scope).await {
            Ok(workspace_id) => {
                service::create_llm_profile(&self.db.pool, workspace_id, params.profile).await
            }
            Err(e) => Err(e),
        };
        self.audit(
            &scope,
            AuditResource::LlmProfile,
            AuditAction::Create,
            result.is_ok(),
            profile_target(&result, None),
            None,
        )
        .await;
        Ok(match result {
            Ok(profile) => tool_json(&profile),
            Err(e) => profile_error("create_llm_profile", e),
        })
    }

    /// Update an LLM profile; only the fields you pass change.
    #[tool(name = "update_llm_profile")]
    async fn update_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<UpdateLlmProfileParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = match self.workspace_id(&scope).await {
            Ok(workspace_id) => {
                service::update_llm_profile(
                    &self.db.pool,
                    &self.cache,
                    workspace_id,
                    params.profile_id,
                    params.update,
                )
                .await
            }
            Err(e) => Err(e),
        };
        self.audit(
            &scope,
            AuditResource::LlmProfile,
            AuditAction::Update,
            result.is_ok(),
            profile_target(&result, Some(params.profile_id)),
            None,
        )
        .await;
        Ok(match result {
            Ok(profile) => tool_json(&profile),
            Err(e) => profile_error("update_llm_profile", e),
        })
    }

    /// Delete an LLM profile. Refused while a signal or feature route uses it.
    #[tool(name = "delete_llm_profile")]
    async fn delete_llm_profile(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<LlmProfileIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = match self.workspace_id(&scope).await {
            Ok(workspace_id) => {
                service::delete_llm_profile(
                    &self.db.pool,
                    &self.cache,
                    workspace_id,
                    params.profile_id,
                )
                .await
            }
            Err(e) => Err(e),
        };
        self.audit(
            &scope,
            AuditResource::LlmProfile,
            AuditAction::Delete,
            result.is_ok(),
            profile_target(&result, Some(params.profile_id)),
            None,
        )
        .await;
        Ok(match result {
            Ok(profile) => tool_json(&profile),
            Err(e) => profile_error("delete_llm_profile", e),
        })
    }
}
