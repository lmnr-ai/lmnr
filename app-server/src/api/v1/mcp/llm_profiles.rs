//! Workspace LLM profile tools: the MCP twins of `lmnr-cli llm-profile`. Same service calls as
//! `api::v1::llm_profiles::handlers`, which both the API-key and CLI routes use.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{
    Audit, AuditTarget, LaminarMcpServer, ProjectParam, ProjectScope, ToolError, ToolOutput,
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
    #[tool(name = "list_llm_profiles")]
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
    #[tool(name = "get_llm_profile")]
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
    #[tool(name = "create_llm_profile")]
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
    #[tool(name = "update_llm_profile")]
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
                let profile = service::update_llm_profile(
                    &self.db.pool,
                    &self.cache,
                    workspace_id,
                    params.profile_id,
                    params.update,
                )
                .await?;
                Ok(profile_output(profile))
            },
        )
        .await
    }

    /// Delete an LLM profile. Refused while a signal or feature route uses it.
    #[tool(name = "delete_llm_profile")]
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
